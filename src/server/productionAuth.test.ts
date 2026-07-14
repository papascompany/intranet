import { describe, expect, it } from "vitest";
import { hashPassword } from "./sessionAuth";
import { authenticateCredentials, changeAuthenticatedPassword, getAuthenticatedSessionFromCookie, type AuthAccountQuery } from "./productionAuth";

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

  it("does not authenticate a bad password", async () => {
    const passwordHash = await hashPassword("correct-password");
    const query = accountQuery(passwordHash);

    await expect(authenticateCredentials({ loginId: "operations.lee", password: "wrong-password" }, env, query)).rejects.toThrow(
      "Invalid login ID or password."
    );
  });

  it("changes the authenticated account password and clears the required flag", async () => {
    const passwordHash = await hashPassword("correct-password");
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const query = accountQuery(passwordHash, calls);
    const login = await authenticateCredentials({ loginId: "operations.lee", password: "correct-password" }, env, query);

    const changed = await changeAuthenticatedPassword(login.cookie, "new-correct-password", env, query);

    expect(changed.session.passwordChangeRequired).toBe(false);
    expect(calls).toContainEqual({
      sql: expect.stringContaining("password_change_required = false"),
      params: [expect.stringMatching(/^pbkdf2_sha256\$/), "account-1"]
    });
  });

  it("rejects a short replacement password", async () => {
    const passwordHash = await hashPassword("correct-password");
    const query = accountQuery(passwordHash);
    const login = await authenticateCredentials({ loginId: "operations.lee", password: "correct-password" }, env, query);

    await expect(changeAuthenticatedPassword(login.cookie, "too-short", env, query)).rejects.toThrow("at least 12");
  });
});

function accountQuery(passwordHash: string, calls: Array<{ sql: string; params?: unknown[] }> = []): AuthAccountQuery {
  return async <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const rows = sql.includes("select") ? [{
      account_id: "account-1", employee_id: "emp-ops-1", employee_number: "EMP-0002", login_id: "operations.lee", password_hash: passwordHash,
      password_change_required: true, role: "EMPLOYEE", disabled_at: null, locked_until: null
    }] : [];
    return rows as unknown as T[];
  };
}
