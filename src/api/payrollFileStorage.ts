export const PAYROLL_STORAGE_BUCKET = "vercel-blob";
export const MAX_PAYROLL_FILE_BYTES = 10 * 1024 * 1024;

export type PayrollFileUpload = {
  pathname: string;
  content: Uint8Array;
  contentType: "application/pdf";
};

export type StoredPayrollFile = {
  bucket: string;
  pathname: string;
  url: string;
};

export type DownloadedPayrollFile = {
  contentType: string;
  contentDisposition: string;
  stream: ReadableStream<Uint8Array>;
};

export interface PayrollFileStorage {
  put(file: PayrollFileUpload): Promise<StoredPayrollFile>;
  get(pathname: string): Promise<DownloadedPayrollFile>;
}

/** In-process storage is intentionally limited to tests and local demo execution. */
export class InMemoryPayrollFileStorage implements PayrollFileStorage {
  private readonly files = new Map<string, PayrollFileUpload>();

  async put(file: PayrollFileUpload): Promise<StoredPayrollFile> {
    this.files.set(file.pathname, { ...file, content: file.content.slice() });
    return {
      bucket: "memory-payroll",
      pathname: file.pathname,
      url: `memory:///${file.pathname}`
    };
  }

  async get(pathname: string): Promise<DownloadedPayrollFile> {
    const file = this.files.get(pathname);
    if (!file) {
      throw new Error(`Payroll file not found: ${pathname}`);
    }

    return {
      contentType: file.contentType,
      contentDisposition: `attachment; filename="${file.pathname.split("/").slice(-1)[0] ?? "payroll.pdf"}"`,
      stream: streamFromBytes(file.content)
    };
  }
}

export class UnavailablePayrollFileStorage implements PayrollFileStorage {
  constructor(private readonly message = "PAYROLL_STORAGE_DIR (or BLOB_READ_WRITE_TOKEN) is required for payroll file storage.") {}

  async put(_file: PayrollFileUpload): Promise<StoredPayrollFile> {
    throw new Error(this.message);
  }

  async get(_pathname: string): Promise<DownloadedPayrollFile> {
    throw new Error(this.message);
  }
}

export function decodePayrollPdf(contentBase64: string | undefined, declaredSizeBytes?: number): Uint8Array {
  if (typeof contentBase64 !== "string" || !contentBase64.trim()) {
    throw new Error("Payroll file content is required.");
  }
  if (declaredSizeBytes !== undefined && (!Number.isInteger(declaredSizeBytes) || declaredSizeBytes < 1 || declaredSizeBytes > MAX_PAYROLL_FILE_BYTES)) {
    throw new Error(`Payroll file must be between 1 byte and ${MAX_PAYROLL_FILE_BYTES} bytes.`);
  }

  const normalized = contentBase64.replace(/\s/g, "");
  // Linear-time validation: the previous grouped-repetition regex exhausted the
  // regex stack on multi-megabyte inputs (RangeError on ~3.5MB+ payloads).
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error("Payroll file content must be valid base64.");
  }

  const bytes = base64ToBytes(normalized);
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_PAYROLL_FILE_BYTES) {
    throw new Error(`Payroll file must be between 1 byte and ${MAX_PAYROLL_FILE_BYTES} bytes.`);
  }
  if (declaredSizeBytes !== undefined && declaredSizeBytes !== bytes.byteLength) {
    throw new Error("Payroll file size does not match its content.");
  }
  if (!hasPdfSignature(bytes)) {
    throw new Error("Payroll file must be a PDF.");
  }

  return bytes;
}

export function validatePayrollFilename(filename: string): string {
  // NFC first: macOS supplies NFD names whose UTF-8 form is 2-3x larger.
  const normalized = filename.trim().normalize("NFC");
  if (!normalized || normalized.length > 180 || normalized !== normalized.replace(/[\\/]/g, "") || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error("Payroll filename is invalid.");
  }
  // Disk storage appends a 9-char suffix and ext4 caps names at 255 bytes.
  if (new TextEncoder().encode(normalized).byteLength > 200) {
    throw new Error("Payroll filename is too long.");
  }
  if (!normalized.toLowerCase().endsWith(".pdf")) {
    throw new Error("Payroll filename must end with .pdf.");
  }
  return normalized;
}

export function validatePayrollMonth(month: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Payroll month must use YYYY-MM.");
  }
  return month;
}

function base64ToBytes(value: string): Uint8Array {
  // Prefer Buffer: on the server a 10MB PDF decodes in one native call instead
  // of atob + a per-character callback over ~14M characters.
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }

  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function hasPdfSignature(bytes: Uint8Array) {
  return bytes.byteLength >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
}
