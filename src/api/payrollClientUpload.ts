import { upload } from "@vercel/blob/client";
import { MAX_PAYROLL_FILE_BYTES, validatePayrollFilename, validatePayrollMonth } from "./payrollFileStorage.js";

const PAYROLL_UPLOAD_ENDPOINT = "/api/payroll-upload";

export type DirectPayrollUploadInput = {
  employeeId: string;
  month: string;
  file: File;
  handleUploadUrl?: string;
  abortSignal?: AbortSignal;
  onUploadProgress?: (progress: { loaded: number; total: number; percentage: number }) => void;
};

export type PayrollDirectUploadResult = Awaited<ReturnType<typeof upload>>;
export type DirectPayrollUpload = (pathname: string, body: File, options: Parameters<typeof upload>[2]) => Promise<PayrollDirectUploadResult>;

export async function uploadPayrollPdfDirect(
  input: DirectPayrollUploadInput,
  uploadImplementation: DirectPayrollUpload = upload
): Promise<PayrollDirectUploadResult> {
  const filename = await validatePayrollPdfFile(input.file);
  const payload = {
    version: 1,
    employeeId: validateEmployeeId(input.employeeId),
    month: validatePayrollMonth(input.month),
    filename
  } as const;
  const pathname = createPayrollUploadPath(payload);

  return await uploadImplementation(pathname, input.file, {
    access: "private",
    contentType: "application/pdf",
    handleUploadUrl: input.handleUploadUrl ?? PAYROLL_UPLOAD_ENDPOINT,
    clientPayload: JSON.stringify(payload),
    multipart: false,
    abortSignal: input.abortSignal,
    onUploadProgress: input.onUploadProgress
  });
}

export async function validatePayrollPdfFile(file: File): Promise<string> {
  const filename = validatePayrollFilename(file.name);
  if (file.type !== "application/pdf") {
    throw new Error("Payroll file must be a PDF.");
  }
  if (file.size < 1 || file.size > MAX_PAYROLL_FILE_BYTES) {
    throw new Error(`Payroll file must be between 1 byte and ${MAX_PAYROLL_FILE_BYTES} bytes.`);
  }
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (header.length !== 5 || String.fromCharCode(...header) !== "%PDF-") {
    throw new Error("Payroll file must be a PDF.");
  }
  return filename;
}

export function createPayrollUploadPath(input: { employeeId: string; month: string; filename: string }): string {
  return `${validateEmployeeId(input.employeeId)}/${validatePayrollMonth(input.month)}/${validatePayrollFilename(input.filename)}`;
}

function validateEmployeeId(employeeId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(employeeId)) {
    throw new Error("Payroll employee ID is invalid.");
  }
  return employeeId;
}
