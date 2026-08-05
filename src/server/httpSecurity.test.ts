import { describe, expect, it, vi } from "vitest";
import { applySecurityHeaders, getHttpsRedirectLocation } from "./httpSecurity";

describe("HTTP security", () => {
  it("redirects only externally forwarded production HTTP requests", () => {
    expect(getHttpsRedirectLocation(
      { "cf-visitor": '{"scheme":"http"}' },
      "/api/health?full=1",
      { NODE_ENV: "production" }
    )).toBe("https://intra.storige.kr/api/health?full=1");
    expect(getHttpsRedirectLocation(
      { "cf-visitor": '{"scheme":"http"}' },
      "//attacker.example/redirect",
      { NODE_ENV: "production" }
    )).toBe("https://intra.storige.kr/redirect");
    expect(getHttpsRedirectLocation(
      { "cf-visitor": '{"scheme":"https"}', "x-forwarded-proto": "http" },
      "/",
      { NODE_ENV: "production" }
    )).toBeUndefined();
    expect(getHttpsRedirectLocation(
      { "x-forwarded-proto": "http" },
      "/",
      { NODE_ENV: "test" }
    )).toBeUndefined();
    expect(getHttpsRedirectLocation({}, "/", { NODE_ENV: "production" })).toBeUndefined();
  });

  it("applies browser protections and production HSTS", () => {
    const setHeader = vi.fn();
    applySecurityHeaders({ setHeader }, { NODE_ENV: "production" });

    expect(setHeader).toHaveBeenCalledWith("Strict-Transport-Security", "max-age=31536000");
    expect(setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
    expect(setHeader).toHaveBeenCalledWith("Content-Security-Policy", expect.stringContaining("frame-ancestors 'none'"));
    expect(setHeader).toHaveBeenCalledWith("Permissions-Policy", expect.stringContaining("geolocation=(self)"));
  });
});
