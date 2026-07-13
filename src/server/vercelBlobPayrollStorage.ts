import { get, put } from "@vercel/blob";
import type {
  DownloadedPayrollFile,
  PayrollFileStorage,
  PayrollFileUpload,
  StoredPayrollFile
} from "../api/payrollFileStorage.js";
import { PAYROLL_STORAGE_BUCKET, UnavailablePayrollFileStorage } from "../api/payrollFileStorage.js";

export type PayrollStorageEnv = {
  BLOB_READ_WRITE_TOKEN?: string;
};

export class VercelBlobPayrollStorage implements PayrollFileStorage {
  constructor(private readonly token: string) {}

  async put(file: PayrollFileUpload): Promise<StoredPayrollFile> {
    const result = await put(file.pathname, Buffer.from(file.content), {
      access: "private",
      addRandomSuffix: true,
      contentType: file.contentType,
      token: this.token
    });
    return { bucket: PAYROLL_STORAGE_BUCKET, pathname: result.pathname, url: result.url };
  }

  async get(pathname: string): Promise<DownloadedPayrollFile> {
    const result = await get(pathname, { access: "private", token: this.token });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error(`Payroll file not found: ${pathname}`);
    }
    return {
      contentType: result.blob.contentType,
      contentDisposition: result.blob.contentDisposition,
      stream: result.stream
    };
  }
}

export function createPayrollFileStorageFromEnv(env: PayrollStorageEnv = process.env): PayrollFileStorage {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    return new UnavailablePayrollFileStorage();
  }
  return new VercelBlobPayrollStorage(env.BLOB_READ_WRITE_TOKEN);
}
