import { describe, expect, it } from "vitest";
import { hashPassword } from "./sessionAuth";
import { authenticateCredentials, changeAuthenticatedPassword, getAuthenticatedSessionFromCookie, refreshRememberedSessionCookie, type AuthAccountQuery } from "./productionAuth";

const env = {
  DATABASE_URL: "postgres://test",
  SESSION_SECRET: "a-very-long-test-session-secret-at-least-32-chars",
  NODE_ENV: "test"
};

describe("productionAuth", () => {
  it("verifies credentials and restores a signed-cookie session from the server account", async () => {
    const passwordHash = await hashPassword("correct-password");
    const query = accountQuery(passwordHash);

    const login = await authenticateCredentials({ loginId: "operations.lee", password: "correct-password" }, env, query);
    const session = await getAuthenticatedSessionFromCookie(login.cookie, env, query);

    expect(login.cookie).toContain("HttpOnly");
    expect(login.cookie).not.toContain("Secure");
    expect(session?.session).toMatchObject({ employeeId: "emp-ops-1", role: "EMPLOYEE", passwordChangeRequired: true });
  });

  it("keeps a remembered personal-device session alive when the intranet is reopened", async () => {
    const passwordHash = await hashPassword("correct-password");
    const query = accountQuery(passwordHash);
    const loggedInAt = new Date("2026-08-03T09:00:00.000Z");
    const login = await authenticateCredentials({ loginId: "operations.lee", password: "correct-password", rememberLogin: true }, env, query, loggedInAt);
    const restored = await getAuthenticatedSessionFromCookie(login.cookie, env, query, new Date("2026-08-20T09:00:00.000Z"));
    const renewed = refreshRememberedSessionCookie(restored!, env, new Date("2026-08-20T09:00:00.000Z"));

    expect(login.cookie).toContain("Max-Age=2592000");
    expect(restored?.session.rememberLogin).toBe(true);
    expect(renewed).toContain("Max-Age=2592000");
    expect(getAuthenticatedSessionFromCookie(renewed, env, query, new Date("2026-09-18T09:00:00.000Z"))).resolves.toBeDefined();
  });

  it("does not renew a session when login retention was not chosen", async () => {
    const passwordHash = await hashPassword("correct-password");
    const query = accountQuery(passwordHash);
    const login = await authenticateCredentials({ loginId: "operations.lee", password: "correct-password", rememberLogin: false }, env, query);
    const restored = await getAuthenticatedSessionFromCookie(login.cookie, env, query);

    expect(restored?.session.rememberLogin).toBe(false);
    expect(refreshRememberedSessionCookie(restored!, env)).toBeUndefined();
  });

  it("does not authenticate a bad password", async () => {
    const passwordHash = await hashPassword("correct-password");
    const query = accountQuery(passwordHash);

    await expect(authenticateCredentials({ loginId: "operations.lee", password: "wrong-password" }, env, query)).rejects.toThrow(
      "Invalid login ID or password."
    );
  });

  it("locks an account after repeated failures and resets the counter after a successful login", async () => {
    const passwordHash = await hashPassword("correct-password");
    const state = { failedSignInCount: 0, lockedUntil: null as string | null };
    const query = statefulAccountQuery(passwordHash, state);
    const now = new Date("2026-07-17T00:00:00.000Z");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(authenticateCredentials({ loginId: "operations.lee", password: "wrong-password" }, env, query, now))
        .rejects.toThrow("Invalid login ID or password.");
    }

    expect(state.failedSignInCount).toBe(5);
    expect(state.lockedUntil).toBe(new Date(now.getTime() + 15 * 60 * 1000).toISOString());
    await expect(authenticateCredentials({ loginId: "operations.lee", password: "correct-password" }, env, query, now))
      .rejects.toThrow("Invalid login ID or password.");

    const afterExpiry = new Date(now.getTime() + 16 * 60 * 1000);
    await expect(authenticateCredentials({ loginId: "operations.lee", password: "correct-password" }, env, query, afterExpiry))
      .resolves.toMatchObject({ authenticated: { accountId: "account-1" } });
    expect(state.failedSignInCount).toBe(0);
    expect(state.lockedUntil).toBeNull();
  });

  it("clears failed attempts after a successful login before the lock threshold", async () => {
    const passwordHash = await hashPassword("correct-password");
    const state = { failedSignInCount: 3, lockedUntil: null as string | null };
    const query = statefulAccountQuery(passwordHash, state);

    await expect(authenticateCredentials({ loginId: "operations.lee", password: "wrong-password" }, env, query))
      .rejects.toThrow("Invalid login ID or password.");
    await expect(authenticateCredentials({ loginId: "operations.lee", password: "correct-password" }, env, query))
      .resolves.toMatchObject({ authenticated: { accountId: "account-1" } });

    expect(state.failedSignInCount).toBe(0);
    expect(state.lockedUntil).toBeNull();
  });

  it("does not authenticate a terminated employee even when credentials are valid", async () => {
    const passwordHash = await hashPassword("correct-password");
    const query = accountQuery(passwordHash, [], "TERMINATED");

    await expect(authenticateCredentials({ loginId: "operations.lee", password: "correct-password" }, env, query)).rejects.toThrow(
      "Invalid login ID or password."
    );
  });

  it("changes the authenticated account password and clears the required flag", async () => {
    const passwordHash = await hashPassword("correct-password");
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const query = accountQuery(passwordHash, calls);
    const login = await authenticateCredentials({ loginId: "operations.lee", password: "correct-password" }, env, query);

    const changed = await changeAuthenticatedPassword(login.cookie, "new-correct-password", env, query);

    expect(changed.authenticated.session.passwordChangeRequired).toBe(false);
    expect(changed.authenticated.sessionVersion).toBe(2);
    expect(changed.cookie).toContain("HttpOnly");
    expect(calls).toContainEqual({
      sql: expect.stringContaining("password_change_required = false"),
      params: [expect.stringMatching(/^pbkdf2_sha256\$/), "account-1", 1]
    });
    await expect(getAuthenticatedSessionFromCookie(login.cookie, env, query)).resolves.toBeUndefined();
    await expect(getAuthenticatedSessionFromCookie(changed.cookie, env, query)).resolves.toBeDefined();
  });

  it("rejects a short replacement password", async () => {
    const passwordHash = await hashPassword("correct-password");
    const query = accountQuery(passwordHash);
    const login = await authenticateCredentials({ loginId: "operations.lee", password: "correct-password" }, env, query);

    await expect(changeAuthenticatedPassword(login.cookie, "too-short", env, query)).rejects.toThrow("at least 12");
  });
});

function accountQuery(
  passwordHash: string,
  calls: Array<{ sql: string; params?: unknown[] }> = [],
  employmentStatus: "ACTIVE" | "LEAVE" | "TERMINATED" = "ACTIVE"
): AuthAccountQuery {
  let sessionVersion = 1;
  return async <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes("returning session_version")) {
      sessionVersion += 1;
      return [{ session_version: sessionVersion }] as unknown as T[];
    }
    if (sql.includes("auth_accounts.session_version = $4") && Number(params?.[3]) !== sessionVersion) {
      return [] as T[];
    }
    const rows = sql.includes("select") ? [{
      account_id: "account-1", employee_id: "emp-ops-1", employee_number: "EMP-0002", login_id: "operations.lee", password_hash: passwordHash,
      password_change_required: true, session_version: sessionVersion, role: "EMPLOYEE", employment_status: employmentStatus, disabled_at: null, locked_until: null
    }] : [];
    return rows as unknown as T[];
  };
}

function statefulAccountQuery(
  passwordHash: string,
  state: { failedSignInCount: number; lockedUntil: string | null }
): AuthAccountQuery {
  return async <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => {
    if (sql.includes("select")) {
      return [{
        account_id: "account-1", employee_id: "emp-ops-1", employee_number: "EMP-0002", login_id: "operations.lee", password_hash: passwordHash,
        password_change_required: true, session_version: 1, failed_sign_in_count: state.failedSignInCount, role: "EMPLOYEE", employment_status: "ACTIVE", disabled_at: null,
        locked_until: state.lockedUntil
      }] as unknown as T[];
    }

    if (sql.includes("failed_sign_in_count = failed_sign_in_count + 1") || sql.includes("failed_sign_in_count = coalesce(failed_sign_in_count, 0) + 1")) {
      state.failedSignInCount += 1;
      if (state.failedSignInCount >= Number(params?.[1])) {
        state.lockedUntil = String(params?.[2]);
      }
    } else if (sql.includes("failed_sign_in_count = 0") && sql.includes("locked_until = null")) {
      state.failedSignInCount = 0;
      state.lockedUntil = null;
    }
    return [] as T[];
  };
}
