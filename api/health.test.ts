import { describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { checkProductionHealth, createHealthHandler, type ProductionHealth } from "./health";

type CapturedResponse = { statusCode: number; headers: Record<string, string>; body: string | undefined };

async function callHandler(method: string, health: Pick<ProductionHealth, "ok">): Promise<CapturedResponse> {
  const captured: CapturedResponse = { statusCode: 0, headers: {}, body: undefined };
  const response = {
    set statusCode(value: number) { captured.statusCode = value; },
    get statusCode() { return captured.statusCode; },
    setHeader(name: string, value: string) { captured.headers[name.toLowerCase()] = value; },
    end(chunk?: string) { captured.body = chunk; }
  } as unknown as ServerResponse;
  const handler = createHealthHandler(async () => ({ ...health } as ProductionHealth));
  await handler({ method } as IncomingMessage, response);
  return captured;
}

const baseEnv = {
  DATABASE_URL: "postgres://example",
  SESSION_SECRET: "01234567890123456789012345678901",
  EMPLOYEE_DATA_ENCRYPTION_KEY: "0123456789012345678901234567890123456789012345678901234567890123",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test",
  NODE_ENV: "production" as const,
  WEB_PUSH_VAPID_PUBLIC_KEY: "public-key",
  WEB_PUSH_VAPID_PRIVATE_KEY: "private-key",
  WEB_PUSH_SUBJECT: "https://intra.storige.kr"
};

describe("production health", () => {
  it("reports all production dependencies when database and schema checks pass", async () => {
    const health = await checkProductionHealth(baseEnv, async () => [{
      employees_table: "public.employees",
      auth_session_version_column: true,
      push_subscriptions_table: "public.web_push_subscriptions",
      push_deliveries_table: "public.web_push_deliveries"
    }]);

    expect(health).toMatchObject({
      ok: true,
      checks: {
        database: "ok",
        schema: "ok",
        session: "ok",
        encryption: "ok",
        blob: "ok",
        push: "ok"
      },
      repository: { repositoryMode: "postgres", persistence: "persistent" }
    });
  });

  it("fails closed when required production secrets are absent", async () => {
    const health = await checkProductionHealth({ DATABASE_URL: "postgres://example", NODE_ENV: "production" }, async () => [{
      employees_table: "public.employees",
      auth_session_version_column: true,
      push_subscriptions_table: "public.web_push_subscriptions",
      push_deliveries_table: "public.web_push_deliveries"
    }]);

    expect(health.ok).toBe(false);
    expect(health.checks).toMatchObject({ session: "missing", encryption: "missing", blob: "missing", push: "missing" });
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

describe("health handler methods", () => {
  it("answers HEAD with the GET status code and no body", async () => {
    const head = await callHandler("HEAD", { ok: true });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBeUndefined();
    expect(head.headers["cache-control"]).toBe("no-store");

    const headDown = await callHandler("HEAD", { ok: false });
    expect(headDown.statusCode).toBe(503);
  });

  it("returns the JSON body for GET", async () => {
    const get = await callHandler("GET", { ok: true });
    expect(get.statusCode).toBe(200);
    expect(JSON.parse(get.body ?? "{}")).toMatchObject({ ok: true });
  });

  it("rejects other methods with Allow: GET, HEAD", async () => {
    const post = await callHandler("POST", { ok: true });
    expect(post.statusCode).toBe(405);
    expect(post.headers.allow).toBe("GET, HEAD");
  });
});
