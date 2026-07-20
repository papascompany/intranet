import { describe, expect, it } from "vitest";
import {
  decodePayrollPdf,
  InMemoryPayrollFileStorage,
  UnavailablePayrollFileStorage,
  validatePayrollFilename,
  validatePayrollMonth
} from "./payrollFileStorage";

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);

describe("payroll file storage", () => {
  it("validates and decodes a PDF payload", () => {
    expect(decodePayrollPdf("JVBERi0xLjQK", 9)).toEqual(pdf);
    expect(validatePayrollFilename("2026-07-payroll.pdf")).toBe("2026-07-payroll.pdf");
    expect(validatePayrollMonth("2026-07")).toBe("2026-07");
  });

  it("rejects unsafe filenames and non-PDF payloads", () => {
    expect(() => validatePayrollFilename("../payroll.pdf")).toThrow("Payroll filename is invalid");
    expect(() => validatePayrollMonth("2026-13")).toThrow("Payroll month must use YYYY-MM");
    expect(() => decodePayrollPdf("bm90IGEgcGRm")).toThrow("Payroll file must be a PDF");
  });

  it("keeps the fake adapter usable in tests and reports missing Blob configuration", async () => {
    const storage = new InMemoryPayrollFileStorage();
    await storage.put({ pathname: "emp-ops-1/2026-07/payroll.pdf", content: pdf, contentType: "application/pdf" });
    const file = await storage.get("emp-ops-1/2026-07/payroll.pdf");
    expect(file.contentType).toBe("application/pdf");
    await expect(new UnavailablePayrollFileStorage().put({ pathname: "x", content: pdf, contentType: "application/pdf" }))
      .rejects.toThrow("PAYROLL_STORAGE_DIR (or BLOB_READ_WRITE_TOKEN) is required");
  });
});
