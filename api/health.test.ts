import { describe, expect, it } from "vitest";
import { checkProductionHealth } from "./health";

const baseEnv = {
  DATABASE_URL: "postgres://example",
  SESSION_SECRET: "01234567890123456789012345678901",
  EMPLOYEE_DATA_ENCRYPTION_KEY: "0123456789012345678901234567890123456789012345678901234567890123",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test",
  NODE_ENV: "production" as const
};

describe("production health", () => {
  it("reports all production dependencies when database and schema checks pass", async () => {
    const health = await checkProductionHealth(baseEnv, async () => [{ employees_table: "public.employees" }]);

    expect(health).toMatchObject({
      ok: true,
      checks: {
        database: "ok",
        schema: "ok",
        session: "ok",
        encryption: "ok",
        blob: "ok"
      },
      repository: { repositoryMode: "postgres", persistence: "persistent" }
    });
  });

  it("fails closed when required production secrets are absent", async () => {
    const health = await checkProductionHealth({ DATABASE_URL: "postgres://example", NODE_ENV: "production" }, async () => [{ employees_table: "public.employees" }]);

    expect(health.ok).toBe(false);
    expect(health.checks).toMatchObject({ session: "missing", encryption: "missing", blob: "missing" });
  });

  it("marks a database outage without exposing connection details", async () => {
    const health = await checkProductionHealth(baseEnv, async () => {
      throw new Error("connection string must not be returned");
    });

    expect(health.ok).toBe(false);
    expect(health.checks.database).toBe("unreachable");
    expect(JSON.stringify(health)).not.toContain("connection string");
  });
});
