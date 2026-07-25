import type { IncomingMessage, ServerResponse } from "node:http";

import type { AuthSession } from "../src/api/auth.js";
import type { PushAlertPreferences, PushConfiguration, PushDevice, PushSubscriptionInput } from "../src/api/pushTypes.js";
import type { PostgresQuery } from "../src/api/postgresRepository.js";
import { createDatabaseQuery } from "../src/server/neonRepositoryFactory.js";
import { getAuthenticatedSessionFromCookie } from "../src/server/productionAuth.js";
import {
  getWebPushConfiguration,
  sendWebPushNotification,
  type StoredPushSubscription,
  type WebPushEnv
} from "../src/server/webPush.js";

type PushRequest = {
  body?: unknown;
  host?: string;
  method: string;
  origin?: string;
  serverSession?: AuthSession;
  userAgent?: string;
};

type PushResponse = { body: unknown; status: number };

type PushSubscriptionRow = Record<string, unknown> & {
  alert_clock_in: boolean;
  alert_clock_out: boolean;
  auth_secret: string;
  created_at: string;
  device_label: string;
  enabled: boolean;
  endpoint: string;
  id: string;
  last_success_at?: string | null;
  p256dh: string;
};

type PushActionBody = {
  action?: "status" | "subscribe" | "update" | "unsubscribe" | "test";
  currentEndpoint?: string;
  deviceId?: string;
  preferences?: PushAlertPreferences;
  subscription?: PushSubscriptionInput;
};

type PushSender = (subscription: StoredPushSubscription, payload: Parameters<typeof sendWebPushNotification>[1], env: WebPushEnv) => Promise<unknown>;

export default async function handler(request: IncomingMessage & { body?: unknown }, response: ServerResponse) {
  const authenticated = await getAuthenticatedSessionFromCookie(request.headers.cookie).catch(() => undefined);
  const result = await handlePushHttpRequest(
    {
      method: request.method ?? "GET",
      body: parseRequestBody(request.body),
      host: firstHeader(request.headers["x-forwarded-host"]) ?? request.headers.host,
      origin: request.headers.origin,
      serverSession: authenticated?.session,
      userAgent: request.headers["user-agent"]
    },
    process.env
  );

  response.statusCode = result.status;
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(result.body));
}

export async function handlePushHttpRequest(
  request: PushRequest,
  env: WebPushEnv = process.env,
  query?: PostgresQuery,
  send: PushSender = sendWebPushNotification
): Promise<PushResponse> {
  try {
    if (request.method !== "POST") {
      return { status: 405, body: { error: "Method not allowed" } };
    }
    assertSameOrigin(request.origin, request.host);
    const session = request.serverSession;
    if (!session) {
      return { status: 401, body: { error: "Authentication required." } };
    }
    if (session.passwordChangeRequired) {
      return { status: 403, body: { error: "비밀번호 변경 후 알림을 설정할 수 있습니다." } };
    }
    if (session.role !== "HR_ADMIN" && session.role !== "SYSTEM_ADMIN") {
      return { status: 403, body: { error: "관리자 계정만 푸시 알림을 설정할 수 있습니다." } };
    }

    const config = getWebPushConfiguration(env);
    if (!env.DATABASE_URL) {
      return { status: 503, body: { error: "푸시 알림 저장소가 설정되지 않았습니다." } };
    }
    const databaseQuery = query ?? createDatabaseQuery(env.DATABASE_URL);
    const body = request.body as PushActionBody | undefined;
    const action = body?.action;

    if (action === "status") {
      return { status: 200, body: await buildConfiguration(databaseQuery, session.employeeId, body?.currentEndpoint, config) };
    }
    if (!config.configured) {
      return { status: 503, body: { error: "서버 푸시 키가 설정되지 않았습니다." } };
    }

    if (action === "subscribe") {
      const subscription = validateSubscription(body?.subscription);
      const rows = await databaseQuery<PushSubscriptionRow>(
        `insert into web_push_subscriptions (
           employee_id, endpoint, p256dh, auth_secret, device_label,
           alert_clock_in, alert_clock_out, enabled, failure_count, updated_at
         ) values ($1, $2, $3, $4, $5, $6, $7, true, 0, now())
         on conflict (endpoint) do update set
           employee_id = excluded.employee_id,
           p256dh = excluded.p256dh,
           auth_secret = excluded.auth_secret,
           device_label = excluded.device_label,
           alert_clock_in = excluded.alert_clock_in,
           alert_clock_out = excluded.alert_clock_out,
           enabled = true,
           deliver_from = now(),
           failure_count = 0,
           updated_at = now()
         returning id::text as id, endpoint, p256dh, auth_secret, device_label,
                   alert_clock_in, alert_clock_out, enabled, created_at, last_success_at`,
        [
          session.employeeId,
          subscription.endpoint,
          subscription.keys.p256dh,
          subscription.keys.auth,
          cleanDeviceLabel(subscription.deviceLabel || request.userAgent || "iPhone"),
          subscription.preferences.clockIn,
          subscription.preferences.clockOut
        ]
      );
      return {
        status: 200,
        body: {
          ...(await buildConfiguration(databaseQuery, session.employeeId, subscription.endpoint, config)),
          device: toPushDevice(requireRow(rows[0]))
        }
      };
    }

    const deviceId = requiredDeviceId(body?.deviceId);
    if (action === "update") {
      const preferences = validatePreferences(body?.preferences);
      const rows = await databaseQuery<PushSubscriptionRow>(
        `update web_push_subscriptions
         set alert_clock_in = $3, alert_clock_out = $4, deliver_from = now(), updated_at = now()
         where id = $1 and employee_id = $2
         returning id::text as id, endpoint, p256dh, auth_secret, device_label,
                   alert_clock_in, alert_clock_out, enabled, created_at, last_success_at`,
        [deviceId, session.employeeId, preferences.clockIn, preferences.clockOut]
      );
      return { status: 200, body: { device: toPushDevice(requireRow(rows[0])) } };
    }
    if (action === "unsubscribe") {
      const rows = await databaseQuery<{ id: string }>(
        `update web_push_subscriptions
         set enabled = false, updated_at = now()
         where id = $1 and employee_id = $2
         returning id::text as id`,
        [deviceId, session.employeeId]
      );
      requireRow(rows[0]);
      return { status: 200, body: { ok: true } };
    }
    if (action === "test") {
      const rows = await databaseQuery<PushSubscriptionRow>(
        `select id::text as id, endpoint, p256dh, auth_secret, device_label,
                alert_clock_in, alert_clock_out, enabled, created_at, last_success_at
         from web_push_subscriptions
         where id = $1 and employee_id = $2 and enabled = true
         limit 1`,
        [deviceId, session.employeeId]
      );
      const subscription = requireRow(rows[0]);
      await send(
        { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth_secret },
        {
          title: "더스토리지 근태",
          body: "이 iPhone에서 출퇴근 알림을 받을 준비가 되었습니다.",
          icon: "/pwa-icon-192.png",
          tag: `push-test-${deviceId}`,
          url: "/?section=self-service"
        },
        env
      );
      await databaseQuery(
        `update web_push_subscriptions
         set last_success_at = now(), failure_count = 0, updated_at = now()
         where id = $1`,
        [deviceId]
      );
      return { status: 200, body: { ok: true } };
    }

    return { status: 400, body: { error: `Unsupported push action: ${action ?? "missing"}` } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "푸시 알림 요청을 처리하지 못했습니다.";
    const status = error instanceof PushRequestError ? error.status : 500;
    return { status, body: { error: status === 500 ? "푸시 알림 서비스에 연결하지 못했습니다." : message } };
  }
}

async function buildConfiguration(
  query: PostgresQuery,
  employeeId: string,
  currentEndpoint: string | undefined,
  config: ReturnType<typeof getWebPushConfiguration>
): Promise<PushConfiguration> {
  const rows = await query<PushSubscriptionRow>(
    `select id::text as id, endpoint, p256dh, auth_secret, device_label,
            alert_clock_in, alert_clock_out, enabled, created_at, last_success_at
     from web_push_subscriptions
     where employee_id = $1 and enabled = true
     order by updated_at desc`,
    [employeeId]
  );
  return {
    configured: config.configured,
    currentDeviceId: rows.find((row) => currentEndpoint && row.endpoint === currentEndpoint)?.id,
    devices: rows.map(toPushDevice),
    ...(config.publicKey ? { publicKey: config.publicKey } : {})
  };
}

function validateSubscription(value: PushSubscriptionInput | undefined): PushSubscriptionInput {
  if (!value || typeof value.endpoint !== "string" || typeof value.keys?.p256dh !== "string" || typeof value.keys?.auth !== "string") {
    throw new PushRequestError(400, "올바른 iPhone 알림 구독정보가 필요합니다.");
  }
  let endpoint: URL;
  try {
    endpoint = new URL(value.endpoint);
  } catch {
    throw new PushRequestError(400, "알림 구독 주소가 올바르지 않습니다.");
  }
  if (endpoint.protocol !== "https:" || value.keys.p256dh.length < 32 || value.keys.auth.length < 8) {
    throw new PushRequestError(400, "안전하지 않은 알림 구독정보입니다.");
  }
  return { ...value, preferences: validatePreferences(value.preferences) };
}

function validatePreferences(value: PushAlertPreferences | undefined): PushAlertPreferences {
  if (!value || typeof value.clockIn !== "boolean" || typeof value.clockOut !== "boolean") {
    throw new PushRequestError(400, "출근·퇴근 알림 설정을 확인해 주세요.");
  }
  return value;
}

function requiredDeviceId(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) {
    throw new PushRequestError(400, "알림을 설정할 기기를 선택해 주세요.");
  }
  return value;
}

function cleanDeviceLabel(value: string) {
  const trimmed = value.replace(/[\r\n\t]/g, " ").trim().slice(0, 80);
  return trimmed || "iPhone";
}

function toPushDevice(row: PushSubscriptionRow): PushDevice {
  return {
    id: row.id,
    deviceLabel: row.device_label,
    enabled: row.enabled,
    createdAt: row.created_at,
    ...(row.last_success_at ? { lastSuccessAt: row.last_success_at } : {}),
    preferences: { clockIn: row.alert_clock_in, clockOut: row.alert_clock_out }
  };
}

function requireRow<T>(row: T | undefined): T {
  if (!row) throw new PushRequestError(404, "등록된 알림 기기를 찾지 못했습니다.");
  return row;
}

function assertSameOrigin(origin: string | undefined, host: string | undefined) {
  if (!origin || !host) throw new PushRequestError(403, "요청 출처를 확인할 수 없습니다.");
  try {
    if (new URL(origin).host !== host.split(",")[0]?.trim()) {
      throw new PushRequestError(403, "허용되지 않은 요청 출처입니다.");
    }
  } catch (error) {
    if (error instanceof PushRequestError) throw error;
    throw new PushRequestError(403, "요청 출처를 확인할 수 없습니다.");
  }
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseRequestBody(body: unknown) {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

class PushRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
