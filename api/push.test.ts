import { describe, expect, it, vi } from "vitest";

import type { AuthSession } from "../src/api/auth";
import type { PostgresQuery } from "../src/api/postgresRepository";
import { handlePushHttpRequest } from "./push";

const adminSession: AuthSession = {
  employeeId: "admin-1",
  role: "SYSTEM_ADMIN",
  authenticatedAt: "2026-07-24T00:00:00.000Z",
  passwordChangeRequired: false,
  rememberLogin: true
};

const env = {
  DATABASE_URL: "postgres://example",
  WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
  WEB_PUSH_VAPID_PRIVATE_KEY: "private-key",
  WEB_PUSH_SUBJECT: "https://intra.storige.kr"
};

const baseRequest = {
  method: "POST",
  origin: "https://intra.storige.kr",
  host: "intra.storige.kr",
  serverSession: adminSession
};

describe("push notification API", () => {
  it("rejects employee accounts", async () => {
    const result = await handlePushHttpRequest(
      { ...baseRequest, body: { action: "status" }, serverSession: { ...adminSession, role: "EMPLOYEE" } },
      env,
      vi.fn() as unknown as PostgresQuery
    );

    expect(result).toEqual({ status: 403, body: { error: "관리자 계정만 푸시 알림을 설정할 수 있습니다." } });
  });

  it("rejects cross-origin state requests", async () => {
    const result = await handlePushHttpRequest(
      { ...baseRequest, origin: "https://attacker.example", body: { action: "status" } },
      env,
      vi.fn() as unknown as PostgresQuery
    );

    expect(result.status).toBe(403);
  });

  it("returns the current administrator device", async () => {
    const query = vi.fn(async () => [{
      id: "7",
      endpoint: "https://push.example/device",
      p256dh: "p".repeat(65),
      auth_secret: "a".repeat(16),
      device_label: "iPhone",
      alert_clock_in: true,
      alert_clock_out: false,
      enabled: true,
      created_at: "2026-07-24T00:00:00.000Z",
      last_success_at: null
    }]) as unknown as PostgresQuery;

    const result = await handlePushHttpRequest(
      { ...baseRequest, body: { action: "status", currentEndpoint: "https://push.example/device" } },
      env,
      query
    );

    expect(result).toMatchObject({
      status: 200,
      body: {
        configured: true,
        currentDeviceId: "7",
        devices: [{ id: "7", deviceLabel: "iPhone", preferences: { clockIn: true, clockOut: false } }]
      }
    });
  });

  it("registers a validated iPhone subscription", async () => {
    const row = {
      id: "8",
      endpoint: "https://push.example/new-device",
      p256dh: "p".repeat(65),
      auth_secret: "a".repeat(16),
      device_label: "iPhone",
      alert_clock_in: true,
      alert_clock_out: true,
      enabled: true,
      created_at: "2026-07-24T00:00:00.000Z",
      last_success_at: null
    };
    const query = vi.fn(async (sql: string) => sql.includes("insert into web_push_subscriptions") ? [row] : [row]) as unknown as PostgresQuery;

    const result = await handlePushHttpRequest(
      {
        ...baseRequest,
        body: {
          action: "subscribe",
          subscription: {
            deviceLabel: "iPhone",
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth_secret },
            preferences: { clockIn: true, clockOut: true }
          }
        }
      },
      env,
      query
    );

    expect(result.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("insert into web_push_subscriptions"), expect.arrayContaining(["admin-1", row.endpoint]));
  });
});
