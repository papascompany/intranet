import { createHmac, pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

const HASH_ALGORITHM = "sha256";
const HASH_ITERATIONS = 310_000;
const HASH_KEY_LENGTH = 32;
const SESSION_TOKEN_VERSION = 1;
const MIN_SESSION_SECRET_LENGTH = 32;

export type ServerAuthSession = {
  accountId: string;
  employeeId: string;
  employeeNumber: string;
  issuedAt: number;
  expiresAt: number;
};

export type CreateSessionInput = Omit<ServerAuthSession, "issuedAt" | "expiresAt"> & {
  expiresAt?: number;
};

export type SessionCookieOptions = {
  name?: string;
  maxAgeSeconds?: number;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
};

type StoredPasswordHash = {
  algorithm: typeof HASH_ALGORITHM;
  iterations: number;
  salt: string;
  hash: string;
};

type SignedSessionPayload = ServerAuthSession & {
  version: typeof SESSION_TOKEN_VERSION;
};

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string): string | undefined {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return undefined;
  }
}

function isValidSessionValue(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function isSignedSessionPayload(value: unknown): value is SignedSessionPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<SignedSessionPayload>;
  return (
    payload.version === SESSION_TOKEN_VERSION &&
    isValidSessionValue(payload.accountId) &&
    isValidSessionValue(payload.employeeId) &&
    isValidSessionValue(payload.employeeNumber) &&
    typeof payload.issuedAt === "number" &&
    Number.isFinite(payload.issuedAt) &&
    typeof payload.expiresAt === "number" &&
    Number.isFinite(payload.expiresAt)
  );
}

function parseStoredPasswordHash(encoded: string): StoredPasswordHash | undefined {
  const parts = encoded.split("$");
  if (parts.length !== 4 || parts[0] !== `pbkdf2_${HASH_ALGORITHM}`) {
    return undefined;
  }

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || !parts[2] || !parts[3]) {
    return undefined;
  }

  return {
    algorithm: HASH_ALGORITHM,
    iterations,
    salt: parts[2],
    hash: parts[3]
  };
}

function sign(value: string, secret: string): string {
  return createHmac(HASH_ALGORITHM, secret).update(value).digest("base64url");
}

function hasMatchingSignature(value: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(sign(value, secret));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Hash a password for the auth_accounts.password_hash column. */
export async function hashPassword(password: string, salt = randomBytes(16).toString("base64url")): Promise<string> {
  if (password.length < 12) {
    throw new Error("Password must be at least 12 characters long.");
  }

  const derivedKey = await pbkdf2Async(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM);
  return `pbkdf2_${HASH_ALGORITHM}$${HASH_ITERATIONS}$${salt}$${derivedKey.toString("base64url")}`;
}

/** Verify a supplied password against an encoded PBKDF2 hash. */
export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const stored = parseStoredPasswordHash(encodedHash);
  if (!stored) {
    return false;
  }

  const derivedKey = await pbkdf2Async(password, stored.salt, stored.iterations, HASH_KEY_LENGTH, stored.algorithm);
  const expected = Buffer.from(stored.hash, "base64url");
  return expected.length === derivedKey.length && timingSafeEqual(expected, derivedKey);
}

/**
 * Creates a self-contained, HMAC-signed server session token. The token never
 * carries a role; authorization must look up the employee role server-side.
 */
export function createSignedSessionToken(
  input: CreateSessionInput,
  secret: string,
  now = Date.now(),
  defaultLifetimeMs = 8 * 60 * 60 * 1000
): string {
  assertSessionSecret(secret);
  const payload: SignedSessionPayload = {
    version: SESSION_TOKEN_VERSION,
    accountId: input.accountId,
    employeeId: input.employeeId,
    employeeNumber: input.employeeNumber,
    issuedAt: now,
    expiresAt: input.expiresAt ?? now + defaultLifetimeMs
  };

  if (!isSignedSessionPayload(payload) || payload.expiresAt <= payload.issuedAt) {
    throw new Error("Invalid session payload.");
  }

  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

/** Return a trusted server session only when the HMAC and expiry are valid. */
export function verifySignedSessionToken(token: string | undefined, secret: string, now = Date.now()): ServerAuthSession | undefined {
  if (!token || !secret) {
    return undefined;
  }

  const [encodedPayload, signature, ...extraParts] = token.split(".");
  if (!encodedPayload || !signature || extraParts.length > 0 || !hasMatchingSignature(encodedPayload, signature, secret)) {
    return undefined;
  }

  const decodedPayload = decodeBase64Url(encodedPayload);
  if (!decodedPayload) {
    return undefined;
  }

  try {
    const payload: unknown = JSON.parse(decodedPayload);
    if (!isSignedSessionPayload(payload) || payload.expiresAt <= now || payload.issuedAt > now + 60_000) {
      return undefined;
    }

    const { version: _version, ...session } = payload;
    return session;
  } catch {
    return undefined;
  }
}

/** Parse a request Cookie header without interpreting values as credentials. */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  return header.split(";").reduce<Record<string, string>>((cookies, entry) => {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) {
      return cookies;
    }

    const name = entry.slice(0, separatorIndex).trim();
    const rawValue = entry.slice(separatorIndex + 1).trim();
    if (!name || !rawValue) {
      return cookies;
    }

    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      // Ignore malformed cookie values rather than treating them as a session.
    }
    return cookies;
  }, {});
}

/** Serialize the HttpOnly cookie used to transport a signed session token. */
export function serializeSessionCookie(token: string, options: SessionCookieOptions = {}): string {
  const name = options.name ?? "intranet_session";
  const maxAgeSeconds = options.maxAgeSeconds ?? 8 * 60 * 60;
  const secure = options.secure ?? true;
  const sameSite = options.sameSite ?? "Lax";
  const path = options.path ?? "/";

  if (!name || /[=;\s]/.test(name) || !token) {
    throw new Error("Invalid session cookie.");
  }

  const attributes = [`${name}=${encodeURIComponent(token)}`, "HttpOnly", `Path=${path}`, `SameSite=${sameSite}`, `Max-Age=${maxAgeSeconds}`];
  if (secure) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

/** Read and validate the required production secret without exposing its value. */
export function getRequiredSessionSecret(env: { SESSION_SECRET?: string } = process.env): string {
  const secret = env.SESSION_SECRET;
  assertSessionSecret(secret);
  return secret;
}

function assertSessionSecret(secret: string | undefined): asserts secret is string {
  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error("SESSION_SECRET must be set to a random value of at least 32 characters.");
  }
}
