import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { createSensitiveDataCrypto } from "./sensitiveDataCrypto";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64url");

describe("sensitiveDataCrypto", () => {
  it("round trips a synthetic value using authenticated AES-256-GCM encryption", () => {
    const crypto = createSensitiveDataCrypto(TEST_KEY);
    const encrypted = crypto.encodeSensitiveText("resident_registration_number_enc", "SYNTHETIC-IDENTIFIER-001");

    expect(encrypted).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(encrypted).not.toContain("SYNTHETIC-IDENTIFIER-001");
    expect(crypto.decodeSensitiveText("resident_registration_number_enc", encrypted)).toBe("SYNTHETIC-IDENTIFIER-001");
  });

  it("rejects malformed keys and ciphertext that is used with another column", () => {
    expect(() => createSensitiveDataCrypto(undefined)).toThrow("EMPLOYEE_DATA_ENCRYPTION_KEY is required");
    expect(() => createSensitiveDataCrypto("not-a-32-byte-key")).toThrow("base64url-encoded 32-byte key");

    const crypto = createSensitiveDataCrypto(TEST_KEY);
    const encrypted = crypto.encodeSensitiveText("payroll_account_enc", "SYNTHETIC-ACCOUNT-001");
    expect(() => crypto.decodeSensitiveText("resident_registration_number_enc", encrypted)).toThrow("Encrypted employee data is invalid");
    expect(() => crypto.decodeSensitiveText("payroll_account_enc", `${encrypted}x`)).toThrow("Encrypted employee data is invalid");
  });
});
