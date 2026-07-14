import type { IncomingMessage, ServerResponse } from "node:http";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAdminSession, type AuthSession } from "../src/api/auth.js";
import type { RegisterUploadedPayrollStatementInput } from "../src/api/types.js";
import { MAX_PAYROLL_FILE_BYTES, validatePayrollFilename, validatePayrollMonth } from "../src/api/payrollFileStorage.js";
import { createServerHrApi } from "../src/server/neonRepositoryFactory.js";
import {
  getAuthenticatedSessionFromCookie,
  type AuthAccountQuery,
  type AuthenticatedServerSession,
  type ServerAuthEnv
} from "../src/server/productionAuth.js";

const CLIENT_PAYLOAD_VERSION = 1;
const CLIENT_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

type VercelRequest = IncomingMessage & {
  method?: string;
  body?: unknown;
};

export type PayrollUploadEnv = ServerAuthEnv & {
  BLOB_READ_WRITE_TOKEN?: string;
};

export type PayrollUploadClientPayload = {
  version: typeof CLIENT_PAYLOAD_VERSION;
  employeeId: string;
  month: string;
  filename: string;
};

export type PayrollUploadTokenPayload = PayrollUploadClientPayload & {
  actorEmployeeId: string;
  actorRole: AuthSession["role"];
  actorAuthenticatedAt: string;
  pathname: string;
};

export type PayrollUploadHttpRequest = {
  method: string;
  body: unknown;
  cookie?: string;
  rawRequest: IncomingMessage;
};

export type PayrollUploadHttpResponse = {
  status: number;
  body: Record<string, unknown>;
};

export type PayrollUploadDependencies = {
  getAuthenticatedSession?: (cookie: string | undefined) => Promise<AuthenticatedServerSession | undefined>;
  handleUpload?: typeof handleUpload;
  now?: () => Date;
  registerUploadedPayrollStatement?: (input: RegisterUploadedPayrollStatementInput) => Promise<unknown>;
};

export default async function handler(request: VercelRequest, response: ServerResponse) {
  const result = await handlePayrollUploadHttpRequest(
    {
      method: request.method ?? "GET",
      body: parseRequestBody(request.body),
      cookie: request.headers.cookie,
      rawRequest: request
    },
    process.env
  );

  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(result.body));
}

/**
 * Testable HTTP core for Vercel Blob direct uploads. Completion callbacks are
 * authenticated by handleUpload's Vercel signature verification, not cookies.
 */
export async function handlePayrollUploadHttpRequest(
  request: PayrollUploadHttpRequest,
  env: PayrollUploadEnv = process.env,
  query?: AuthAccountQuery,
  dependencies: PayrollUploadDependencies = {}
): Promise<PayrollUploadHttpResponse> {
  if (request.method !== "POST") {
    return { status: 405, body: { error: "Method not allowed" } };
  }
  if (!isHandleUploadBody(request.body)) {
    return { status: 400, body: { error: "Invalid upload request." } };
  }
  if (!env.BLOB_READ_WRITE_TOKEN) {
    return { status: 500, body: { error: "Payroll upload service unavailable." } };
  }

  try {
    let authenticated: AuthenticatedServerSession | undefined;
    if (request.body.type === "blob.generate-client-token") {
      const getSession = dependencies.getAuthenticatedSession
        ?? ((cookie) => getAuthenticatedSessionFromCookie(cookie, env, query));
      authenticated = await getSession(request.cookie);
      if (!authenticated) {
        return { status: 401, body: { error: "Authentication required." } };
      }
      if (!isAdminSession(authenticated.session)) {
        return { status: 403, body: { error: "Administrator access required." } };
      }
    }

    const uploadResult = await (dependencies.handleUpload ?? handleUpload)({
      request: request.rawRequest,
      body: request.body,
      token: env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        if (multipart) {
          throw new Error("Payroll uploads must not use multipart upload.");
        }
        const payload = parseClientPayload(clientPayload);
        const basePathname = createPayrollUploadPath(payload);
        if (pathname !== basePathname) {
          throw new Error("Payroll upload pathname is invalid.");
        }
        // handleUpload signs this canonical payload into the short-lived client token.
        if (!authenticated) {
          throw new Error("Payroll upload authentication is invalid.");
        }
        const tokenPayload = createTokenPayload(payload, authenticated);
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_PAYROLL_FILE_BYTES,
          validUntil: (dependencies.now ?? (() => new Date()))().getTime() + CLIENT_TOKEN_LIFETIME_MS,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: serializeTokenPayload(tokenPayload)
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parseTokenPayload(tokenPayload ?? null);
        const pathname = payload.pathname;
        if (blob.pathname !== pathname || blob.contentType !== "application/pdf" || blob.size < 1 || blob.size > MAX_PAYROLL_FILE_BYTES) {
          throw new Error("Payroll upload completion is invalid.");
        }
        const session: AuthSession = {
          employeeId: payload.actorEmployeeId,
          role: payload.actorRole,
          authenticatedAt: payload.actorAuthenticatedAt,
          rememberLogin: false
        };
        const input: RegisterUploadedPayrollStatementInput = {
          employeeId: payload.employeeId,
          month: payload.month,
          filename: payload.filename,
          storagePath: blob.pathname,
          actorId: payload.actorEmployeeId,
          session
        };
        await (dependencies.registerUploadedPayrollStatement
          ?? ((registration) => createServerHrApi(env).registerUploadedPayrollStatement(registration)))(input);
      }
    });

    return uploadResult.type === "blob.generate-client-token"
      ? { status: 200, body: { clientToken: uploadResult.clientToken } }
      : { status: 200, body: { ok: true } };
  } catch {
    return { status: 400, body: { error: "Payroll upload request rejected." } };
  }
}

export function createPayrollUploadPath(payload: PayrollUploadClientPayload): string {
  const employeeId = validateEmployeeId(payload.employeeId);
  const month = validatePayrollMonth(payload.month);
  const filename = validatePayrollFilename(payload.filename);
  return `${employeeId}/${month}/${filename}`;
}

export function serializeClientPayload(payload: PayrollUploadClientPayload): string {
  return JSON.stringify({
    version: CLIENT_PAYLOAD_VERSION,
    employeeId: validateEmployeeId(payload.employeeId),
    month: validatePayrollMonth(payload.month),
    filename: validatePayrollFilename(payload.filename)
  });
}

export function parseClientPayload(value: string | null): PayrollUploadClientPayload {
  if (typeof value !== "string" || value.length > 1024) {
    throw new Error("Payroll upload payload is invalid.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Payroll upload payload is invalid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payroll upload payload is invalid.");
  }
  const candidate = parsed as Partial<PayrollUploadClientPayload>;
  if (candidate.version !== CLIENT_PAYLOAD_VERSION || typeof candidate.employeeId !== "string" || typeof candidate.month !== "string" || typeof candidate.filename !== "string") {
    throw new Error("Payroll upload payload is invalid.");
  }
  return {
    version: CLIENT_PAYLOAD_VERSION,
    employeeId: validateEmployeeId(candidate.employeeId),
    month: validatePayrollMonth(candidate.month),
    filename: validatePayrollFilename(candidate.filename)
  };
}

export function serializeTokenPayload(payload: PayrollUploadTokenPayload): string {
  return JSON.stringify({
    version: CLIENT_PAYLOAD_VERSION,
    actorEmployeeId: validateEmployeeId(payload.actorEmployeeId),
    actorRole: validateAdminRole(payload.actorRole),
    actorAuthenticatedAt: validateAuthenticatedAt(payload.actorAuthenticatedAt),
    employeeId: validateEmployeeId(payload.employeeId),
    month: validatePayrollMonth(payload.month),
    filename: validatePayrollFilename(payload.filename),
    pathname: createPayrollUploadPath(payload)
  });
}

export function parseTokenPayload(value: string | null): PayrollUploadTokenPayload {
  if (typeof value !== "string" || value.length > 1400) {
    throw new Error("Payroll upload token payload is invalid.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Payroll upload token payload is invalid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payroll upload token payload is invalid.");
  }
  const candidate = parsed as Partial<PayrollUploadTokenPayload>;
  if (candidate.version !== CLIENT_PAYLOAD_VERSION || typeof candidate.actorEmployeeId !== "string" || typeof candidate.actorAuthenticatedAt !== "string" || typeof candidate.employeeId !== "string" || typeof candidate.month !== "string" || typeof candidate.filename !== "string" || typeof candidate.pathname !== "string") {
    throw new Error("Payroll upload token payload is invalid.");
  }
  const payload: PayrollUploadTokenPayload = {
    version: CLIENT_PAYLOAD_VERSION,
    actorEmployeeId: validateEmployeeId(candidate.actorEmployeeId),
    actorRole: validateAdminRole(candidate.actorRole),
    actorAuthenticatedAt: validateAuthenticatedAt(candidate.actorAuthenticatedAt),
    employeeId: validateEmployeeId(candidate.employeeId),
    month: validatePayrollMonth(candidate.month),
    filename: validatePayrollFilename(candidate.filename),
    pathname: candidate.pathname
  };
  if (payload.pathname !== createPayrollUploadPath(payload)) {
    throw new Error("Payroll upload token payload is invalid.");
  }
  return payload;
}

function validateEmployeeId(employeeId: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(employeeId)) {
    throw new Error("Payroll employee ID is invalid.");
  }
  return employeeId;
}

function validateAdminRole(role: unknown): AuthSession["role"] {
  if (role !== "HR_ADMIN" && role !== "SYSTEM_ADMIN") {
    throw new Error("Payroll upload actor role is invalid.");
  }
  return role;
}

function validateAuthenticatedAt(value: string): string {
  if (!Number.isFinite(new Date(value).getTime())) {
    throw new Error("Payroll upload actor session is invalid.");
  }
  return value;
}

function createTokenPayload(payload: PayrollUploadClientPayload, authenticated: AuthenticatedServerSession): PayrollUploadTokenPayload {
  return {
    ...payload,
    actorEmployeeId: validateEmployeeId(authenticated.session.employeeId),
    actorRole: validateAdminRole(authenticated.session.role),
    actorAuthenticatedAt: validateAuthenticatedAt(authenticated.session.authenticatedAt),
    pathname: createPayrollUploadPath(payload)
  };
}

function isHandleUploadBody(body: unknown): body is HandleUploadBody {
  return Boolean(body && typeof body === "object" && !Array.isArray(body) && (
    (body as { type?: unknown }).type === "blob.generate-client-token" ||
    (body as { type?: unknown }).type === "blob.upload-completed"
  ));
}

function parseRequestBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}
