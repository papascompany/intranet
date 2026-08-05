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
      password_change_required: true, session_version: 1, role: "EMPLOYEE", disabled_at: null, locked_until: null
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

  it("renews a remembered device cookie when the app restores its session", async () => {
    const passwordHash = await hashPassword("correct-password");
    const query: AuthAccountQuery = async <T extends Record<string, unknown>>(sql: string) => (sql.includes("select") ? [{
      account_id: "account-1", employee_id: "emp-ops-1", employee_number: "EMP-0002", login_id: "operations.lee", password_hash: passwordHash,
      password_change_required: false, session_version: 1, role: "EMPLOYEE", disabled_at: null, locked_until: null
    }] : []) as unknown as T[];
    const login = await handleAuthHttpRequest(
      { method: "POST", body: { action: "login", loginId: "operations.lee", password: "correct-password", rememberLogin: true } },
      env,
      query
    );
    const restored = await handleAuthHttpRequest({ method: "GET", cookie: login.setCookie }, env, query);

    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ session: { rememberLogin: true } });
    expect(restored.setCookie).toContain("HttpOnly");
    expect(restored.setCookie).toContain("Max-Age=2592000");
  });

  it("changes an authenticated password and reports validation errors", async () => {
    const passwordHash = await hashPassword("correct-password");
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    let sessionVersion = 1;
    const query: AuthAccountQuery = async <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("returning session_version")) {
        sessionVersion += 1;
        return [{ session_version: sessionVersion }] as unknown as T[];
      }
      if (sql.includes("auth_accounts.session_version = $4") && Number(params?.[3]) !== sessionVersion) {
        return [] as T[];
      }
      return (sql.includes("select") ? [{
        account_id: "account-1", employee_id: "emp-ops-1", employee_number: "EMP-0002", login_id: "operations.lee", password_hash: passwordHash,
        password_change_required: true, session_version: sessionVersion, role: "EMPLOYEE", disabled_at: null, locked_until: null
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
      { method: "POST", cookie: changed.setCookie, body: { action: "changePassword", newPassword: "too-short" } },
      env,
      query
    );

    expect(changed).toMatchObject({ status: 200, body: { session: { passwordChangeRequired: false } }, setCookie: expect.stringContaining("HttpOnly") });
    expect(calls.some((call) => call.sql.includes("password_change_required = false"))).toBe(true);
    expect(invalid).toMatchObject({ status: 400, body: { error: expect.stringContaining("at least 12") } });
  });
});
