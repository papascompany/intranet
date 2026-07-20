import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isNeonDatabaseUrl } from "./neonRepositoryFactory";
import { createPayrollFileStorageFromEnv, VercelBlobPayrollStorage } from "./vercelBlobPayrollStorage";
import { DiskPayrollStorage } from "./diskPayrollStorage";
import { UnavailablePayrollFileStorage } from "../api/payrollFileStorage";
import { checkProductionHealth } from "../../api/health";

describe("isNeonDatabaseUrl", () => {
  it("selects the Neon driver only for *.neon.tech hosts", () => {
    expect(isNeonDatabaseUrl("postgres://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require")).toBe(true);
    expect(isNeonDatabaseUrl("postgres://intranet:pw@fuyifvxuqbwa9cw761oi9n11:5432/intranet")).toBe(false);
    expect(isNeonDatabaseUrl("postgres://u:p@127.0.0.1:15432/db")).toBe(false);
    expect(isNeonDatabaseUrl("postgres://u:p@evil-neon.tech.attacker.com/db")).toBe(false);
    expect(isNeonDatabaseUrl("not a url")).toBe(false);
  });
});

describe("createPayrollFileStorageFromEnv", () => {
  it("prefers disk storage over the Blob token", () => {
    const storage = createPayrollFileStorageFromEnv({ PAYROLL_STORAGE_DIR: "/tmp/payroll", BLOB_READ_WRITE_TOKEN: "token" });
    expect(storage).toBeInstanceOf(DiskPayrollStorage);
  });

  it("falls back to Vercel Blob, then to unavailable", () => {
    expect(createPayrollFileStorageFromEnv({ BLOB_READ_WRITE_TOKEN: "token" })).toBeInstanceOf(VercelBlobPayrollStorage);
    expect(createPayrollFileStorageFromEnv({})).toBeInstanceOf(UnavailablePayrollFileStorage);
  });
});

describe("checkProductionHealth payroll storage check", () => {
  let writableDir: string;

  beforeEach(async () => {
    writableDir = await mkdtemp(path.join(tmpdir(), "payroll-health-"));
  });

  afterEach(async () => {
    await rm(writableDir, { recursive: true, force: true });
  });

  it("reports ok for a writable storage directory without a Blob token", async () => {
    const health = await checkProductionHealth({ PAYROLL_STORAGE_DIR: writableDir, SESSION_SECRET: "x".repeat(32) });
    expect(health.checks.blob).toBe("ok");
  });

  it("reports missing for an absent storage directory even when a Blob token exists", async () => {
    const health = await checkProductionHealth({
      PAYROLL_STORAGE_DIR: path.join(writableDir, "does-not-exist"),
      BLOB_READ_WRITE_TOKEN: "token",
      SESSION_SECRET: "x".repeat(32)
    });
    expect(health.checks.blob).toBe("missing");
  });
});
