import type { IncomingMessage, ServerResponse } from "node:http";
import { createNeonQuery, type HrServerEnv, getPersistenceStatusFromEnv } from "../src/server/neonRepositoryFactory.js";
import { getRequiredSessionSecret } from "../src/server/sessionAuth.js";

type VercelRequest = IncomingMessage & { method?: string };
type HealthQuery = <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

export type ProductionHealth = {
  ok: boolean;
  checks: {
    database: "ok" | "missing" | "unreachable";
    schema: "ok" | "missing" | "unknown";
    session: "ok" | "missing";
    encryption: "ok" | "missing" | "not-required";
    blob: "ok" | "missing";
  };
  repository: ReturnType<typeof getPersistenceStatusFromEnv>;
};

export async function checkProductionHealth(
  env: HrServerEnv & { SESSION_SECRET?: string } = process.env,
  query?: HealthQuery
): Promise<ProductionHealth> {
  const persistent = env.HR_REPOSITORY_MODE !== "memory";
  const checks: ProductionHealth["checks"] = {
    database: env.DATABASE_URL ? "unreachable" : "missing",
    schema: env.DATABASE_URL ? "unknown" : "missing",
    session: "missing",
    encryption: persistent && env.NODE_ENV === "production" ? "missing" : "not-required",
    blob: env.BLOB_READ_WRITE_TOKEN ? "ok" : "missing"
  };

  if (env.SESSION_SECRET) {
    try {
      getRequiredSessionSecret(env);
      checks.session = "ok";
    } catch {
      checks.session = "missing";
    }
  }

  if (persistent && env.NODE_ENV === "production" && env.EMPLOYEE_DATA_ENCRYPTION_KEY) {
    checks.encryption = "ok";
  }

  if (env.DATABASE_URL) {
    try {
      const databaseQuery = query ?? createNeonQuery(env.DATABASE_URL);
      const rows = await databaseQuery<{ employees_table?: string | null }>(
        "select 1 as ok, to_regclass('public.employees') as employees_table"
      );
      checks.database = "ok";
      checks.schema = rows[0]?.employees_table ? "ok" : "missing";
    } catch {
      checks.database = "unreachable";
    }
  }

  const ok = checks.database === "ok"
    && checks.schema === "ok"
    && checks.session === "ok"
    && checks.encryption !== "missing"
    && checks.blob === "ok";

  return { ok, checks, repository: getPersistenceStatusFromEnv(env) };
}

export default async function handler(request: VercelRequest, response: ServerResponse) {
  if (request.method && request.method !== "GET") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET");
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const health = await checkProductionHealth();
  response.statusCode = health.ok ? 200 : 503;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(health));
}
