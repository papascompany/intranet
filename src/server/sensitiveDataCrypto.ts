import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export type SensitiveDataCrypto = {
  encodeSensitiveText(column: string, value: string | undefined): string | undefined;
  decodeSensitiveText(column: string, value: unknown): string | undefined;
};

export function createSensitiveDataCrypto(encodedKey: string | undefined): SensitiveDataCrypto {
  const key = decodeEncryptionKey(encodedKey);

  return {
    encodeSensitiveText(column, value) {
      if (value === undefined) return undefined;

      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv);
      cipher.setAAD(Buffer.from(column, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      const authTag = cipher.getAuthTag();
      return [VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), authTag.toString("base64url")].join(".");
    },
    decodeSensitiveText(column, value) {
      if (value === undefined || value === null) return undefined;
      if (typeof value !== "string") throw new Error("Encrypted employee data is invalid.");

      try {
        const [version, encodedIv, encodedCiphertext, encodedAuthTag, extra] = value.split(".");
        if (version !== VERSION || !encodedIv || encodedCiphertext === undefined || !encodedAuthTag || extra !== undefined) {
          throw new Error("invalid encrypted payload");
        }

        const iv = decodeBase64Url(encodedIv);
        const ciphertext = decodeBase64Url(encodedCiphertext);
        const authTag = decodeBase64Url(encodedAuthTag);
        if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) throw new Error("invalid encrypted payload");

        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAAD(Buffer.from(column, "utf8"));
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      } catch {
        throw new Error("Encrypted employee data is invalid.");
      }
    }
  };
}

function decodeEncryptionKey(encodedKey: string | undefined): Buffer {
  if (!encodedKey) throw new Error("EMPLOYEE_DATA_ENCRYPTION_KEY is required.");

  try {
    const key = decodeBase64Url(encodedKey);
    if (key.length !== 32 || key.toString("base64url") !== encodedKey) throw new Error("invalid key");
    return key;
  } catch {
    throw new Error("EMPLOYEE_DATA_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.");
  }
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("invalid base64url");
  return Buffer.from(value, "base64url");
}
