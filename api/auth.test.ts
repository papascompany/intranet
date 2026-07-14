import { describe, expect, it } from "vitest";
import { hashPassword } from "../src/server/sessionAuth.js";
import type { AuthAccountQuery } from "../src/server/productionAuth.js";
import { handleAuthHttpRequest } from "./auth.js";

const env = {
  DATABASE_URL: "postgres://test",
  SESSION_SECRET: "a-very-long-test-session-secret-at-least-32-chars",
  NODE_ENV: "test"
};

describe("auth API", () => {
  it("issues an HttpOnly cookie only after successful login with a login ID", async () => {
    const passwordHash = await hashPassword("correct-password");
    const query: AuthAccountQuery = async <T extends Record<string, unknown>>(sql: string) => (sql.includes("select") ? [{
      account_id: "account-1", employee_id: "emp-ops-1", employee_number: "EMP-0002", login_id: "operations.lee", password_hash: passwordHash,
      password_change_required: true, role: "EMPLOYEE", disabled_at: null, locked_until: null
    }] : []) as unknown as T[];

    const response = await handleAuthHttpRequest(
      { method: "POST", body: { action: "login", loginId: "operations.lee", password: "correct-password" } },
      env,
      query
    );

    expect(response.status).toBe(200);
    expect(response.setCookie).toContain("HttpOnly");
    expect(response.body).toMatchObject({ session: { employeeId: "emp-ops-1", role: "EMPLOYEE", passwordChangeRequired: true } });
  });

  it("changes an authenticated password and reports validation errors", async () => {
    const passwordHash = await hashPassword("correct-password");
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const query: AuthAccountQuery = async <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return (sql.includes("select") ? [{
        account_id: "account-1", employee_id: "emp-ops-1", employee_number: "EMP-0002", login_id: "operations.lee", password_hash: passwordHash,
        password_change_required: true, role: "EMPLOYEE", disabled_at: null, locked_until: null
      }] : []) as unknown as T[];
    };
    const login = await handleAuthHttpRequest(
      { method: "POST", body: { action: "login", loginId: "operations.lee", password: "correct-password" } },
      env,
      query
    );

    const changed = await handleAuthHttpRequest(
      { method: "POST", cookie: login.setCookie, body: { action: "changePassword", newPassword: "new-correct-password" } },
      env,
      query
    );
    const invalid = await handleAuthHttpRequest(
      { method: "POST", cookie: login.setCookie, body: { action: "changePassword", newPassword: "too-short" } },
      env,
      query
    );

    expect(changed).toMatchObject({ status: 200, body: { session: { passwordChangeRequired: false } } });
    expect(calls.some((call) => call.sql.includes("password_change_required = false"))).toBe(true);
    expect(invalid).toMatchObject({ status: 400, body: { error: expect.stringContaining("at least 12") } });
  });
});
