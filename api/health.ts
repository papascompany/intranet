import type { IncomingMessage, ServerResponse } from "node:http";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { createDatabaseQuery, type HrServerEnv, getPersistenceStatusFromEnv } from "../src/server/neonRepositoryFactory.js";
import { getRequiredSessionSecret } from "../src/server/sessionAuth.js";

type VercelRequest = IncomingMessage & { method?: string };
type HealthQuery = <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

export type ProductionHealth = {
  release: "self-hosted-2026-07-20";
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

async function checkPayrollStorage(env: HrServerEnv): Promise<"ok" | "missing"> {
  if (env.PAYROLL_STORAGE_DIR) {
    try {
      await access(env.PAYROLL_STORAGE_DIR, constants.W_OK);
      return "ok";
    } catch {
      return "missing";
    }
  }
  return env.BLOB_READ_WRITE_TOKEN ? "ok" : "missing";
}

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
    // The `blob` key is kept for wire compatibility; it reports whichever
    // payroll storage backend is configured (local disk or Vercel Blob).
    blob: await checkPayrollStorage(env)
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
      const databaseQuery = query ?? createDatabaseQuery(env.DATABASE_URL);
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

  return { release: "self-hosted-2026-07-20", ok, checks, repository: getPersistenceStatusFromEnv(env) };
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
