import { describe, expect, it } from "vitest";
import { uploadPayrollPdfDirect } from "./payrollClientUpload.js";

describe("direct payroll client upload", () => {
  it("uses the protected endpoint and a private PDF-only upload", async () => {
    const file = testFile("%PDF-1.7\nbody");
    let received: { pathname?: string; options?: object } = {};

    await uploadPayrollPdfDirect(
      { employeeId: "emp-ops-1", month: "2026-07", file },
      async (pathname, _file, options) => {
        received = { pathname, options };
        return { url: "https://blob.example/statement.pdf", downloadUrl: "https://blob.example/download", pathname, contentType: "application/pdf", contentDisposition: "inline", size: file.size, etag: "etag" };
      }
    );

    expect(received.pathname).toBe("emp-ops-1/2026-07/statement.pdf");
    expect(received.options).toMatchObject({
      access: "private",
      contentType: "application/pdf",
      handleUploadUrl: "/api/payroll-upload",
      multipart: false
    });
  });

  it("rejects an invalid PDF before requesting a token", async () => {
    const file = testFile("not a pdf");
    await expect(uploadPayrollPdfDirect(
      { employeeId: "emp-ops-1", month: "2026-07", file },
      async () => { throw new Error("should not upload"); }
    )).rejects.toThrow("Payroll file must be a PDF.");
  });
});

function testFile(content: string): File {
  const bytes = new TextEncoder().encode(content);
  return {
    name: "statement.pdf",
    type: "application/pdf",
    size: bytes.byteLength,
    slice: (start?: number, end?: number) => ({ arrayBuffer: async () => bytes.slice(start, end).buffer })
  } as File;
}
