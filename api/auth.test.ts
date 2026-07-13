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
  it("issues an HttpOnly cookie only after successful login", async () => {
    const passwordHash = await hashPassword("correct-password");
    const query: AuthAccountQuery = async <T extends Record<string, unknown>>(sql: string) => (sql.includes("select") ? [{
      account_id: "account-1", employee_id: "emp-ops-1", employee_number: "EMP-0002", password_hash: passwordHash,
      role: "EMPLOYEE", disabled_at: null, locked_until: null
    }] : []) as unknown as T[];

    const response = await handleAuthHttpRequest(
      { method: "POST", body: { action: "login", employeeNumber: "EMP-0002", password: "correct-password" } },
      env,
      query
    );

    expect(response.status).toBe(200);
    expect(response.setCookie).toContain("HttpOnly");
    expect(response.body).toMatchObject({ session: { employeeId: "emp-ops-1", role: "EMPLOYEE" } });
  });
});
