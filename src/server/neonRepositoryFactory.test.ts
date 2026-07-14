import { describe, expect, it } from "vitest";
import { InMemoryDatabase } from "../api/inMemoryDatabase";
import { PostgresHrRepository, type PostgresQuery } from "../api/postgresRepository";
import { createHrRepositoryFromEnv, createServerHrApi, getPersistenceStatusFromEnv } from "./neonRepositoryFactory";
import { createSensitiveDataCrypto } from "./sensitiveDataCrypto";

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64url");

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

  it("wires sensitive data encryption only when an encryption key is configured", async () => {
    const encryptedIdentifier = createSensitiveDataCrypto(TEST_ENCRYPTION_KEY)
      .encodeSensitiveText("resident_registration_number_enc", "SYNTHETIC-IDENTIFIER-002")!;
    const employeeRow = {
      id: "emp-1", name: "Synthetic Employee", role: "EMPLOYEE", department: "운영팀", hire_date: "2026-07-14",
      resident_registration_number_enc: encryptedIdentifier, pilot: false
    };
    const query: PostgresQuery = async <T extends Record<string, unknown>>() => [employeeRow] as unknown as T[];
    const repository = createHrRepositoryFromEnv(
      { DATABASE_URL: "postgres://example", EMPLOYEE_DATA_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY },
      { query }
    );

    await expect(repository.listEmployees()).resolves.toMatchObject([
      { residentRegistrationNumber: "SYNTHETIC-IDENTIFIER-002" }
    ]);

    const repositoryWithoutKey = createHrRepositoryFromEnv(
      { DATABASE_URL: "postgres://example" },
      { query }
    );
    await expect(repositoryWithoutKey.listEmployees()).resolves.toMatchObject([
      { residentRegistrationNumber: undefined }
    ]);
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
