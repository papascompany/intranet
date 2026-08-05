import type { IncomingHttpHeaders, ServerResponse } from "node:http";

const PRODUCTION_ORIGIN = "https://intra.storige.kr";

const CONTENT_SECURITY_POLICY_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self'"
];

export function applySecurityHeaders(
  response: Pick<ServerResponse, "setHeader">,
  env: { NODE_ENV?: string } = process.env
) {
  const contentSecurityPolicy = env.NODE_ENV === "production"
    ? [...CONTENT_SECURITY_POLICY_DIRECTIVES, "upgrade-insecure-requests"]
    : CONTENT_SECURITY_POLICY_DIRECTIVES;
  response.setHeader("Content-Security-Policy", contentSecurityPolicy.join("; "));
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), geolocation=(self), microphone=(), payment=(), usb=()");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");

  if (env.NODE_ENV === "production") {
    response.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
}

export function getHttpsRedirectLocation(
  headers: IncomingHttpHeaders,
  requestUrl: string | undefined,
  env: { NODE_ENV?: string } = process.env
) {
  if (env.NODE_ENV !== "production" || externalProtocol(headers) !== "http") {
    return undefined;
  }

  const requestedUrl = new URL(requestUrl ?? "/", "http://internal.invalid");
  return new URL(`${requestedUrl.pathname}${requestedUrl.search}`, PRODUCTION_ORIGIN).toString();
}

function externalProtocol(headers: IncomingHttpHeaders) {
  const cloudflareScheme = cloudflareVisitorScheme(firstHeader(headers["cf-visitor"]));
  if (cloudflareScheme) return cloudflareScheme;

  return firstHeader(headers["x-forwarded-proto"])
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
}

function cloudflareVisitorScheme(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as { scheme?: unknown };
    return parsed.scheme === "http" || parsed.scheme === "https" ? parsed.scheme : undefined;
  } catch {
    return undefined;
  }
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
