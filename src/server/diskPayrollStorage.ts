import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import type {
  DownloadedPayrollFile,
  PayrollFileStorage,
  PayrollFileUpload,
  StoredPayrollFile
} from "../api/payrollFileStorage.js";

export const DISK_PAYROLL_STORAGE_BUCKET = "local-disk";

/** RFC 8187 ext-value: percent-encode everything outside attr-char, including ' ( ) *. */
function encodeRfc8187(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Stores payroll PDFs on a server-local directory (PAYROLL_STORAGE_DIR).
 * Used by the self-hosted deployment with a persistent volume mount; the
 * original documents remain archived off-server by the operator.
 */
export class DiskPayrollStorage implements PayrollFileStorage {
  constructor(private readonly rootDir: string) {}

  async put(file: PayrollFileUpload): Promise<StoredPayrollFile> {
    // Unique suffix mirrors the old Blob addRandomSuffix behavior: a re-upload
    // after a soft delete must never overwrite the audited previous file.
    const extension = path.extname(file.pathname);
    const uniquePathname = `${file.pathname.slice(0, file.pathname.length - extension.length)}-${randomUUID().slice(0, 8)}${extension}`;
    const target = this.resolveInsideRoot(uniquePathname);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, { flag: "wx" });
    return { bucket: DISK_PAYROLL_STORAGE_BUCKET, pathname: uniquePathname, url: `file://${target}` };
  }

  async get(pathname: string): Promise<DownloadedPayrollFile> {
    const target = this.resolveInsideRoot(pathname);
    const stats = await stat(target).catch(() => undefined);
    if (!stats?.isFile()) {
      throw new Error(`Payroll file not found: ${pathname}`);
    }
    const filename = pathname.split("/").at(-1) ?? "payroll.pdf";
    const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "payroll.pdf";
    return {
      contentType: "application/pdf",
      contentDisposition: `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc8187(filename)}`,
      stream: Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>
    };
  }

  private resolveInsideRoot(pathname: string): string {
    if (path.isAbsolute(pathname) || pathname.includes("\0")) {
      throw new Error("Payroll storage path is invalid.");
    }
    const root = path.resolve(this.rootDir);
    const resolved = path.resolve(root, pathname);
    if (resolved === root || !resolved.startsWith(root + path.sep)) {
      throw new Error("Payroll storage path is invalid.");
    }
    return resolved;
  }
}
