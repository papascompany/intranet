import { describe, expect, it, vi } from "vitest";

import type { PostgresQuery } from "../api/postgresRepository";
import { deliverAttendancePushes } from "./webPush";

const env = {
  DATABASE_URL: "postgres://example",
  WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
  WEB_PUSH_VAPID_PRIVATE_KEY: "private-key",
  WEB_PUSH_SUBJECT: "https://intra.storige.kr"
};

describe("web push delivery worker", () => {
  it("claims a clock-in audit event and sends one notification", async () => {
    const candidate = {
      audit_log_id: "audit-1",
      action: "ATTENDANCE_CLOCKED_IN",
      attendance_id: "attendance-1",
      employee_name: "김직원",
      clock_in_at: "2026-07-24T08:02:00+09:00",
      clock_out_at: null,
      subscription_id: "3",
      endpoint: "https://push.example/device",
      p256dh: "p".repeat(65),
      auth_secret: "a".repeat(16)
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("deliveries.id is null")) return [candidate];
      if (sql.includes("insert into web_push_deliveries")) return [{ id: "11" }];
      if (sql.includes("from web_push_deliveries deliveries")) return [];
      return [];
    }) as unknown as PostgresQuery;
    const send = vi.fn(async () => ({ statusCode: 201, body: "", headers: {} }));

    await deliverAttendancePushes(query, env, send);

    expect(send).toHaveBeenCalledWith(
      { endpoint: candidate.endpoint, p256dh: candidate.p256dh, auth: candidate.auth_secret },
      expect.objectContaining({
        title: "더스토리지 근태",
        body: "김직원님 출근 · 08:02",
        url: "/?section=attendance&attendanceId=attendance-1"
      }),
      env
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining("set status = 'SENT'"), ["11"]);
  });
});
