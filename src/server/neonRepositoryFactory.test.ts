import { describe, expect, it } from "vitest";
import { InMemoryDatabase } from "../api/inMemoryDatabase";
import { PostgresHrRepository } from "../api/postgresRepository";
import { createHrRepositoryFromEnv, createServerHrApi } from "./neonRepositoryFactory";

describe("neonRepositoryFactory", () => {
  it("uses the memory repository when DATABASE_URL is missing", () => {
    const repository = createHrRepositoryFromEnv({});

    expect(repository).toBeInstanceOf(InMemoryDatabase);
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

  it("creates a server API with the selected repository", async () => {
    const api = createServerHrApi({});

    await expect(api.getEmployees()).resolves.not.toHaveLength(0);
  });
});
