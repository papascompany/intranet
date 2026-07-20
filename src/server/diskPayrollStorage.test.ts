import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DiskPayrollStorage, DISK_PAYROLL_STORAGE_BUCKET } from "./diskPayrollStorage";

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 test payroll content");

describe("DiskPayrollStorage", () => {
  let rootDir: string;
  let storage: DiskPayrollStorage;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "payroll-disk-"));
    storage = new DiskPayrollStorage(rootDir);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("stores and retrieves a payroll file byte-for-byte", async () => {
    const stored = await storage.put({
      pathname: "emp-1/2026-07/명세서.pdf",
      content: PDF_BYTES,
      contentType: "application/pdf"
    });
    expect(stored.bucket).toBe(DISK_PAYROLL_STORAGE_BUCKET);
    expect(stored.pathname).toMatch(/^emp-1\/2026-07\/명세서-[0-9a-f]{8}\.pdf$/);

    const downloaded = await storage.get(stored.pathname);
    expect(downloaded.contentType).toBe("application/pdf");
    expect(downloaded.contentDisposition).toContain("filename*=UTF-8''");

    const chunks: Uint8Array[] = [];
    const reader = downloaded.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const merged = Buffer.concat(chunks);
    expect(Array.from(merged)).toEqual(Array.from(PDF_BYTES));
  });

  it("rejects a missing file", async () => {
    await expect(storage.get("emp-1/2026-07/none.pdf")).rejects.toThrow("Payroll file not found");
  });

  it("never overwrites an existing file on re-upload", async () => {
    const upload = { pathname: "emp-1/2026-07/명세서.pdf", content: PDF_BYTES, contentType: "application/pdf" as const };
    const first = await storage.put(upload);
    const second = await storage.put(upload);
    expect(second.pathname).not.toBe(first.pathname);
    await expect(storage.get(first.pathname)).resolves.toBeTruthy();
    await expect(storage.get(second.pathname)).resolves.toBeTruthy();
  });

  it("rejects path traversal on read and write", async () => {
    await expect(storage.get("../outside.pdf")).rejects.toThrow("Payroll storage path is invalid.");
    await expect(storage.get("emp-1/../../outside.pdf")).rejects.toThrow("Payroll storage path is invalid.");
    await expect(
      storage.put({ pathname: "/etc/passwd", content: PDF_BYTES, contentType: "application/pdf" })
    ).rejects.toThrow("Payroll storage path is invalid.");
  });
});
