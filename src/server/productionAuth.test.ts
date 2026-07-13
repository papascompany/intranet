import { describe, expect, it } from "vitest";
import { hashPassword } from "./sessionAuth";
import { authenticateCredentials, getAuthenticatedSessionFromCookie, type AuthAccountQuery } from "./productionAuth";

const env = {
  DATABASE_URL: "postgres://test",
  SESSION_SECRET: "a-very-long-test-session-secret-at-least-32-chars",
  NODE_ENV: "test"
};

describe("productionAuth", () => {
  it("verifies credentials and restores a signed-cookie session from the server account", async () => {
    const passwordHash = await hashPassword("correct-password");
    const query = accountQuery(passwordHash);

    const login = await authenticateCredentials({ employeeNumber: "EMP-0002", password: "correct-password" }, env, query);
    const session = await getAuthenticatedSessionFromCookie(login.cookie, env, query);

    expect(login.cookie).toContain("HttpOnly");
    expect(login.cookie).not.toContain("Secure");
    expect(session?.session).toMatchObject({ employeeId: "emp-ops-1", role: "EMPLOYEE" });
  });

  it("does not authenticate a bad password", async () => {
    const passwordHash = await hashPassword("correct-password");
    const query = accountQuery(passwordHash);

    await expect(authenticateCredentials({ employeeNumber: "EMP-0002", password: "wrong-password" }, env, query)).rejects.toThrow(
      "Invalid employee number or password."
    );
  });
});

function accountQuery(passwordHash: string): AuthAccountQuery {
  return async <T extends Record<string, unknown>>(sql: string) => {
    const rows = sql.includes("select") ? [{
      account_id: "account-1", employee_id: "emp-ops-1", employee_number: "EMP-0002", password_hash: passwordHash,
      role: "EMPLOYEE", disabled_at: null, locked_until: null
    }] : [];
    return rows as unknown as T[];
  };
}
