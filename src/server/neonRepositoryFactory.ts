import { neon } from "@neondatabase/serverless";
import { createHrApi, type HrApi } from "../api/hrApi";
import { InMemoryDatabase } from "../api/inMemoryDatabase";
import { PostgresHrRepository, type PostgresQuery } from "../api/postgresRepository";
import type { HrRepository } from "../api/hrRepository";

export type HrServerEnv = {
  DATABASE_URL?: string;
  HR_REPOSITORY_MODE?: "memory" | "postgres";
};

export type HrRepositoryFactoryOptions = {
  query?: PostgresQuery;
  fallbackRepository?: HrRepository;
};

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
  if (env.HR_REPOSITORY_MODE === "memory") {
    return options.fallbackRepository ?? new InMemoryDatabase();
  }

  if (env.DATABASE_URL) {
    return new PostgresHrRepository({
      query: options.query ?? createNeonQuery(env.DATABASE_URL)
    });
  }

  return options.fallbackRepository ?? new InMemoryDatabase();
}

export function createServerHrApi(env: HrServerEnv = process.env, options: HrRepositoryFactoryOptions = {}): HrApi {
  return createHrApi(createHrRepositoryFromEnv(env, options));
}
