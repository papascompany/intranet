import { describe, expect, it } from "vitest";
import {
  createSignedSessionToken,
  getRequiredSessionSecret,
  hashPassword,
  parseCookieHeader,
  serializeSessionCookie,
  verifyPassword,
  verifySignedSessionToken
} from "./sessionAuth";

const secret = "a-session-secret-that-is-at-least-thirty-two-characters";
const sessionInput = {
  accountId: "account-001",
  employeeId: "employee-001",
  employeeNumber: "PAPA-001"
};

describe("sessionAuth", () => {
  it("hashes and verifies a password with PBKDF2", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");

    expect(hash).toMatch(/^pbkdf2_sha256\$310000\$/);
    await expect(verifyPassword("correct-horse-battery-staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("not-the-password", hash)).resolves.toBe(false);
  });

  it("rejects weak passwords and malformed stored hashes", async () => {
    await expect(hashPassword("too-short")).rejects.toThrow("at least 12");
    await expect(verifyPassword("correct-horse-battery-staple", "not-a-hash")).resolves.toBe(false);
  });

  it("creates and verifies a non-role-bearing signed session", () => {
    const token = createSignedSessionToken(sessionInput, secret, 1_000, 10_000);

    expect(verifySignedSessionToken(token, secret, 2_000)).toEqual({
      ...sessionInput,
      issuedAt: 1_000,
      expiresAt: 11_000
    });
    expect(token).not.toContain("HR_ADMIN");
  });

  it("rejects tampered, expired, and wrong-secret session tokens", () => {
    const token = createSignedSessionToken(sessionInput, secret, 1_000, 1_000);
    const [payload, signature] = token.split(".");

    expect(verifySignedSessionToken(`${payload}x.${signature}`, secret, 1_100)).toBeUndefined();
    expect(verifySignedSessionToken(token, "another-session-secret-that-is-at-least-32", 1_100)).toBeUndefined();
    expect(verifySignedSessionToken(token, secret, 2_001)).toBeUndefined();
  });

  it("parses cookies and serializes a secure HttpOnly session cookie", () => {
    expect(parseCookieHeader("theme=dark; intranet_session=token%2Eone; ignored")).toEqual({
      theme: "dark",
      intranet_session: "token.one"
    });

    expect(serializeSessionCookie("signed.token", { maxAgeSeconds: 600 })).toBe(
      "intranet_session=signed.token; HttpOnly; Path=/; SameSite=Lax; Max-Age=600; Secure"
    );
  });

  it("requires a sufficiently strong server secret", () => {
    expect(() => getRequiredSessionSecret({})).toThrow("SESSION_SECRET");
    expect(() => getRequiredSessionSecret({ SESSION_SECRET: "short" })).toThrow("at least 32");
    expect(getRequiredSessionSecret({ SESSION_SECRET: secret })).toBe(secret);
  });
});
