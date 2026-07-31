import * as webpush from "web-push";

import type { PushNotificationPayload } from "../api/pushTypes.js";
import type { PostgresQuery } from "../api/postgresRepository.js";
import { createDatabaseQuery } from "./neonRepositoryFactory.js";

export type WebPushEnv = {
  DATABASE_URL?: string;
  WEB_PUSH_VAPID_PRIVATE_KEY?: string;
  WEB_PUSH_VAPID_PUBLIC_KEY?: string;
  WEB_PUSH_SUBJECT?: string;
};

export type StoredPushSubscription = {
  auth: string;
  endpoint: string;
  p256dh: string;
};

type PushSender = typeof sendWebPushNotification;

type AttendancePushCandidate = Record<string, unknown> & {
  action: "ATTENDANCE_CLOCKED_IN" | "ATTENDANCE_CLOCKED_OUT";
  attendance_id: string;
  audit_log_id: string;
  auth_secret: string;
  clock_in_at?: string | null;
  clock_out_at?: string | null;
  employee_name: string;
  endpoint: string;
  p256dh: string;
  subscription_id: string;
};

type DeliveryClaim = Record<string, unknown> & { id: string };

const POLL_INTERVAL_MS = 5_000;
const MAX_ATTEMPTS = 5;

export function getWebPushConfiguration(env: WebPushEnv = process.env) {
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = env.WEB_PUSH_SUBJECT?.trim();
  return {
    configured: Boolean(env.DATABASE_URL && publicKey && privateKey && subject),
    privateKey,
    publicKey,
    subject
  };
}

export async function sendWebPushNotification(
  subscription: StoredPushSubscription,
  payload: PushNotificationPayload,
  env: WebPushEnv = process.env
) {
  const config = getWebPushConfiguration(env);
  if (!config.configured || !config.publicKey || !config.privateKey || !config.subject) {
    throw new Error("Web Push is not configured.");
  }

  return await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { auth: subscription.auth, p256dh: subscription.p256dh }
    },
    JSON.stringify(payload),
    {
      TTL: 120,
      urgency: "high",
      vapidDetails: {
        subject: config.subject,
        publicKey: config.publicKey,
        privateKey: config.privateKey
      }
    }
  );
}

export function startWebPushWorker(env: WebPushEnv = process.env, options: { query?: PostgresQuery; pollIntervalMs?: number } = {}) {
  const config = getWebPushConfiguration(env);
  if (!config.configured || !env.DATABASE_URL) {
    console.warn("[push] worker disabled: VAPID or DATABASE_URL configuration is missing");
    return () => undefined;
  }

  const query = options.query ?? createDatabaseQuery(env.DATABASE_URL);
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  let stopped = false;
  let running = false;

  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await deliverAttendancePushes(query, env);
    } catch (error) {
      console.error("[push] delivery cycle failed:", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void run(), pollIntervalMs);
  timer.unref();
  void run();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export async function deliverAttendancePushes(
  query: PostgresQuery,
  env: WebPushEnv = process.env,
  send: PushSender = sendWebPushNotification
) {
  const candidates = await query<AttendancePushCandidate>(
    `select
       audit_logs.id as audit_log_id,
       audit_logs.action,
       attendance_records.id as attendance_id,
       attendance_records.clock_in_at,
       attendance_records.clock_out_at,
       employees.name as employee_name,
       subscriptions.id::text as subscription_id,
       subscriptions.endpoint,
       subscriptions.p256dh,
       subscriptions.auth_secret
     from audit_logs
     join attendance_records
       on audit_logs.target_type = 'AttendanceRecord'
      and audit_logs.target_id = attendance_records.id
     join employees on employees.id = attendance_records.employee_id
     join web_push_subscriptions subscriptions on subscriptions.enabled = true
     join employees administrators
       on administrators.id = subscriptions.employee_id
      and administrators.role in ('HR_ADMIN', 'SYSTEM_ADMIN')
      and administrators.employment_status <> 'TERMINATED'
     left join web_push_deliveries deliveries
       on deliveries.audit_log_id = audit_logs.id
      and deliveries.subscription_id = subscriptions.id
     where audit_logs.action in ('ATTENDANCE_CLOCKED_IN', 'ATTENDANCE_CLOCKED_OUT')
       and audit_logs.created_at >= subscriptions.deliver_from
       and deliveries.id is null
     order by audit_logs.created_at asc
     limit 50`
  );

  for (const candidate of candidates) {
    await deliverCandidate(query, candidate, env, send);
  }

  const retries = await query<AttendancePushCandidate>(
    `select
       audit_logs.id as audit_log_id,
       audit_logs.action,
       attendance_records.id as attendance_id,
       attendance_records.clock_in_at,
       attendance_records.clock_out_at,
       employees.name as employee_name,
       subscriptions.id::text as subscription_id,
       subscriptions.endpoint,
       subscriptions.p256dh,
       subscriptions.auth_secret
     from web_push_deliveries deliveries
     join audit_logs on audit_logs.id = deliveries.audit_log_id
     join attendance_records on attendance_records.id = audit_logs.target_id
     join employees on employees.id = attendance_records.employee_id
     join web_push_subscriptions subscriptions on subscriptions.id = deliveries.subscription_id
     join employees administrators
       on administrators.id = subscriptions.employee_id
      and administrators.role in ('HR_ADMIN', 'SYSTEM_ADMIN')
      and administrators.employment_status <> 'TERMINATED'
     where (
         (deliveries.status = 'FAILED' and deliveries.next_attempt_at <= now())
         or (deliveries.status = 'PROCESSING' and deliveries.updated_at <= now() - interval '10 minutes')
       )
       and deliveries.attempt_count < $1
       and subscriptions.enabled = true
     order by deliveries.next_attempt_at asc
     limit 25`,
    [MAX_ATTEMPTS]
  );

  for (const candidate of retries) {
    await deliverCandidate(query, candidate, env, send, true);
  }
}

async function deliverCandidate(
  query: PostgresQuery,
  candidate: AttendancePushCandidate,
  env: WebPushEnv,
  send: PushSender,
  retry = false
) {
  let claim: DeliveryClaim | undefined;
  if (retry) {
    const rows = await query<DeliveryClaim>(
      `update web_push_deliveries
       set status = 'PROCESSING', updated_at = now()
       where audit_log_id = $1 and subscription_id = $2
         and (status = 'FAILED' or (status = 'PROCESSING' and updated_at <= now() - interval '10 minutes'))
       returning id::text as id`,
      [candidate.audit_log_id, candidate.subscription_id]
    );
    claim = rows[0];
  } else {
    const rows = await query<DeliveryClaim>(
      `insert into web_push_deliveries (audit_log_id, subscription_id)
       values ($1, $2)
       on conflict (audit_log_id, subscription_id) do nothing
       returning id::text as id`,
      [candidate.audit_log_id, candidate.subscription_id]
    );
    claim = rows[0];
  }
  if (!claim) return;

  const isClockIn = candidate.action === "ATTENDANCE_CLOCKED_IN";
  const occurredAt = isClockIn ? candidate.clock_in_at : candidate.clock_out_at;
  const label = isClockIn ? "출근" : "퇴근";
  const payload: PushNotificationPayload = {
    title: "더스토리지 근태",
    body: `${candidate.employee_name}님 ${label} · ${formatKoreaTime(occurredAt)}`,
    tag: `attendance-${candidate.audit_log_id}`,
    icon: "/pwa-icon-192.png",
    url: `/?section=attendance&attendanceId=${encodeURIComponent(candidate.attendance_id)}`
  };

  try {
    await send(
      { endpoint: candidate.endpoint, p256dh: candidate.p256dh, auth: candidate.auth_secret },
      payload,
      env
    );
    await query(
      `update web_push_deliveries
       set status = 'SENT', attempt_count = attempt_count + 1, sent_at = now(), next_attempt_at = null,
           last_error = null, updated_at = now()
       where id = $1`,
      [claim.id]
    );
    await query(
      `update web_push_subscriptions
       set failure_count = 0, last_success_at = now(), updated_at = now()
       where id = $1`,
      [candidate.subscription_id]
    );
  } catch (error) {
    const statusCode = error instanceof webpush.WebPushError ? error.statusCode : undefined;
    const expired = statusCode === 404 || statusCode === 410;
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown push delivery error";
    await query(
      `update web_push_deliveries
       set status = $2, attempt_count = attempt_count + 1,
           next_attempt_at = case when $2 = 'FAILED' then now() + interval '5 minutes' else null end,
           last_error = $3, updated_at = now()
       where id = $1`,
      [claim.id, expired ? "EXPIRED" : "FAILED", message]
    );
    await query(
      `update web_push_subscriptions
       set enabled = case when $2 then false else enabled end,
           failure_count = failure_count + 1, updated_at = now()
       where id = $1`,
      [candidate.subscription_id, expired]
    );
  }
}

function formatKoreaTime(value?: string | null) {
  if (!value) return "시간 미확인";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "시간 미확인";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Seoul"
  }).format(parsed);
}
