import { neon } from "@neondatabase/serverless";
import { createHrApi, type HrApi } from "../api/hrApi.js";
import { InMemoryDatabase } from "../api/inMemoryDatabase.js";
import { PostgresHrRepository, type PostgresQuery } from "../api/postgresRepository.js";
import type { HrRepository } from "../api/hrRepository.js";
import type { PersistenceStatus } from "../api/types.js";
import type { PayrollFileStorage } from "../api/payrollFileStorage.js";
import { createPayrollFileStorageFromEnv } from "./vercelBlobPayrollStorage.js";

export type HrServerEnv = {
  DATABASE_URL?: string;
  HR_REPOSITORY_MODE?: "memory" | "postgres";
  BLOB_READ_WRITE_TOKEN?: string;
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

export function createHrRepositoryFromEnv(
  env: HrServerEnv = process.env,
  options: HrRepositoryFactoryOptions = {}
): HrRepository {
  const status = getPersistenceStatusFromEnv(env);

  if (status.repositoryMode === "memory") {
    return options.fallbackRepository ?? new InMemoryDatabase();
  }

  if (env.DATABASE_URL) {
    return new PostgresHrRepository({
      query: options.query ?? createNeonQuery(env.DATABASE_URL)
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
