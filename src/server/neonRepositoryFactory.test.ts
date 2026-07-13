import { describe, expect, it } from "vitest";
import { InMemoryDatabase } from "../api/inMemoryDatabase";
import { PostgresHrRepository } from "../api/postgresRepository";
import { createHrRepositoryFromEnv, createServerHrApi, getPersistenceStatusFromEnv } from "./neonRepositoryFactory";

describe("neonRepositoryFactory", () => {
  it("uses the memory repository when DATABASE_URL is missing", () => {
    const repository = createHrRepositoryFromEnv({});

    expect(repository).toBeInstanceOf(InMemoryDatabase);
  });

  it("reports the missing database fallback as demo-only without exposing configuration values", () => {
    expect(getPersistenceStatusFromEnv({})).toEqual({
      repositoryMode: "memory",
      persistence: "ephemeral",
      demoOnly: true,
      databaseConfigured: false,
      reason: "DATABASE_URL_MISSING"
    });
  });

  it("uses the memory repository when explicitly requested", () => {
    const repository = createHrRepositoryFromEnv({
      DATABASE_URL: "postgres://example",
      HR_REPOSITORY_MODE: "memory"
    });

    expect(repository).toBeInstanceOf(InMemoryDatabase);
  });

  it("uses PostgresHrRepository when DATABASE_URL is present", async () => {
    const repository = createHrRepositoryFromEnv(
      { DATABASE_URL: "postgres://example" },
      {
        query: async () => []
      }
    );

    expect(repository).toBeInstanceOf(PostgresHrRepository);
  });

  it("reports configured Postgres without exposing DATABASE_URL", () => {
    const status = getPersistenceStatusFromEnv({ DATABASE_URL: "postgres://user:secret@db.example/app" });

    expect(status).toEqual({
      repositoryMode: "postgres",
      persistence: "persistent",
      demoOnly: false,
      databaseConfigured: true,
      reason: "DATABASE_URL_CONFIGURED"
    });
    expect(JSON.stringify(status)).not.toContain("secret");
  });

  it("reports an explicit memory override as demo-only", () => {
    expect(getPersistenceStatusFromEnv({ DATABASE_URL: "postgres://example", HR_REPOSITORY_MODE: "memory" })).toMatchObject({
      repositoryMode: "memory",
      demoOnly: true,
      databaseConfigured: true,
      reason: "MEMORY_MODE_REQUESTED"
    });
  });

  it("creates a server API with the selected repository", async () => {
    const api = createServerHrApi({});

    await expect(api.getEmployees()).resolves.not.toHaveLength(0);
  });
});
