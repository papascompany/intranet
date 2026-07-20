import { neon, types as neonTypes } from "@neondatabase/serverless";
import pg from "pg";
import { createHrApi, type HrApi } from "../api/hrApi.js";

// date (OID 1082) must stay a plain "YYYY-MM-DD" string: both drivers would
// otherwise parse it into a local-midnight Date, which shifts by a day the
// moment the process TZ is not UTC.
pg.types.setTypeParser(1082, (value) => value);
neonTypes.setTypeParser(1082, (value) => value);
import { InMemoryDatabase } from "../api/inMemoryDatabase.js";
import { PostgresHrRepository, type PostgresQuery } from "../api/postgresRepository.js";
import type { HrRepository } from "../api/hrRepository.js";
import type { PersistenceStatus } from "../api/types.js";
import type { PayrollFileStorage } from "../api/payrollFileStorage.js";
import { createPayrollFileStorageFromEnv } from "./vercelBlobPayrollStorage.js";
import { createSensitiveDataCrypto } from "./sensitiveDataCrypto.js";

export type HrServerEnv = {
  DATABASE_URL?: string;
  HR_REPOSITORY_MODE?: "memory" | "postgres";
  BLOB_READ_WRITE_TOKEN?: string;
  PAYROLL_STORAGE_DIR?: string;
  EMPLOYEE_DATA_ENCRYPTION_KEY?: string;
  NODE_ENV?: string;
};

export type HrRepositoryFactoryOptions = {
  query?: PostgresQuery;
  fallbackRepository?: HrRepository;
  payrollStorage?: PayrollFileStorage;
};

export function getPersistenceStatusFromEnv(env: HrServerEnv = process.env): PersistenceStatus {
  if (env.HR_REPOSITORY_MODE === "memory") {
    return {
      repositoryMode: "memory",
      persistence: "ephemeral",
      demoOnly: true,
      databaseConfigured: Boolean(env.DATABASE_URL),
      reason: "MEMORY_MODE_REQUESTED"
    };
  }

  if (env.DATABASE_URL) {
    return {
      repositoryMode: "postgres",
      persistence: "persistent",
      demoOnly: false,
      databaseConfigured: true,
      reason: "DATABASE_URL_CONFIGURED"
    };
  }

  return {
    repositoryMode: "memory",
    persistence: "ephemeral",
    demoOnly: true,
    databaseConfigured: false,
    reason: "DATABASE_URL_MISSING"
  };
}

export function createNeonQuery(databaseUrl: string): PostgresQuery {
  const sql = neon(databaseUrl);
  return async <T extends Record<string, unknown>>(query: string, params: unknown[] = []) => {
    return (await sql.query(query, params)) as T[];
  };
}

export function isNeonDatabaseUrl(databaseUrl: string): boolean {
  try {
    return new URL(databaseUrl).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

// node-postgres pools are cached per connection string: the factory is invoked
// per request in the self-hosted server, and a fresh Pool each time would leak
// connections.
const pgPools = new Map<string, pg.Pool>();

function getPgPool(databaseUrl: string): pg.Pool {
  const existing = pgPools.get(databaseUrl);
  if (existing) return existing;
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5000,
    query_timeout: 30_000,
    statement_timeout: 30_000
  });
  pool.on("error", (error) => {
    console.error("[db] idle postgres client error:", error.message);
  });
  pgPools.set(databaseUrl, pool);
  return pool;
}

export function createPgQuery(databaseUrl: string): PostgresQuery {
  const pool = getPgPool(databaseUrl);
  return async <T extends Record<string, unknown>>(query: string, params: unknown[] = []) => {
    const result = await pool.query(query, params);
    return result.rows as T[];
  };
}

/** Neon URLs use Neon's SQL-over-HTTP driver; any other Postgres URL uses node-postgres. */
export function createDatabaseQuery(databaseUrl: string): PostgresQuery {
  return isNeonDatabaseUrl(databaseUrl) ? createNeonQuery(databaseUrl) : createPgQuery(databaseUrl);
}

export function createHrRepositoryFromEnv(
  env: HrServerEnv = process.env,
  options: HrRepositoryFactoryOptions = {}
): HrRepository {
  const status = getPersistenceStatusFromEnv(env);

  if (status.repositoryMode === "memory") {
    return options.fallbackRepository ?? new InMemoryDatabase();
  }

  if (env.DATABASE_URL) {
    if (env.NODE_ENV === "production" && !env.EMPLOYEE_DATA_ENCRYPTION_KEY) {
      throw new Error("EMPLOYEE_DATA_ENCRYPTION_KEY is required when persistent HR data is enabled.");
    }
    const sensitiveDataCrypto = env.EMPLOYEE_DATA_ENCRYPTION_KEY
      ? createSensitiveDataCrypto(env.EMPLOYEE_DATA_ENCRYPTION_KEY)
      : undefined;
    return new PostgresHrRepository({
      query: options.query ?? createDatabaseQuery(env.DATABASE_URL),
      ...(sensitiveDataCrypto ?? {})
    });
  }

  // This branch is unreachable with the current status resolver, but keeps the
  // fallback explicit if a future persistence mode is introduced.
  return options.fallbackRepository ?? new InMemoryDatabase();
}

export function createServerHrApi(env: HrServerEnv = process.env, options: HrRepositoryFactoryOptions = {}): HrApi {
  return createHrApi(
    createHrRepositoryFromEnv(env, options),
    undefined,
    options.payrollStorage ?? createPayrollFileStorageFromEnv(env)
  );
}
