import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AuthenticationError,
  authenticateCredentials,
  changeAuthenticatedPassword,
  clearSessionCookie,
  getAuthenticatedSessionFromCookie,
  type AuthAccountQuery,
  type ServerAuthEnv
} from "../src/server/productionAuth.js";
import { PasswordValidationError } from "../src/server/sessionAuth.js";

type VercelRequest = IncomingMessage & {
  method?: string;
  body?: unknown;
};

type AuthRequest = {
  method: string;
  body?: unknown;
  cookie?: string;
};

type AuthResponse = {
  status: number;
  body: unknown;
  setCookie?: string;
};

export default async function handler(request: VercelRequest, response: ServerResponse) {
  const result = await handleAuthHttpRequest(
    { method: request.method ?? "GET", body: parseRequestBody(request.body), cookie: request.headers.cookie },
    process.env
  );

  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (result.setCookie) {
    response.setHeader("Set-Cookie", result.setCookie);
  }
  response.end(JSON.stringify(result.body));
}

export async function handleAuthHttpRequest(
  request: AuthRequest,
  env: ServerAuthEnv = process.env,
  query?: AuthAccountQuery
): Promise<AuthResponse> {
  try {
    if (request.method === "GET") {
      const authenticated = await getAuthenticatedSessionFromCookie(request.cookie, env, query);
      if (!authenticated) {
        throw new AuthenticationError();
      }
      return { status: 200, body: { session: authenticated.session } };
    }

    if (request.method === "POST") {
      const body = request.body as { action?: string; loginId?: string; password?: string; newPassword?: string; rememberLogin?: boolean } | undefined;
      if (body?.action === "login") {
        const result = await authenticateCredentials(
          {
            loginId: body.loginId ?? "",
            password: body.password ?? "",
            rememberLogin: body.rememberLogin
          },
          env,
          query
        );
        return { status: 200, body: { session: result.authenticated.session }, setCookie: result.cookie };
      }
      if (body?.action === "changePassword") {
        const authenticated = await changeAuthenticatedPassword(request.cookie, body.newPassword ?? "", env, query);
        return { status: 200, body: { session: authenticated.session } };
      }
      if (body?.action === "logout") {
        return { status: 200, body: { ok: true }, setCookie: clearSessionCookie(env) };
      }
      return { status: 400, body: { error: `Unsupported auth action: ${body?.action ?? "missing"}` } };
    }

    return { status: 405, body: { error: "Method not allowed" } };
  } catch (error) {
    const isAuthenticationError = error instanceof AuthenticationError;
    const isPasswordValidationError = error instanceof PasswordValidationError;
    return {
      status: isAuthenticationError ? 401 : isPasswordValidationError ? 400 : 500,
      body: { error: isAuthenticationError || isPasswordValidationError ? error.message : "Authentication service unavailable." }
    };
  }
}

function parseRequestBody(body: unknown) {
  if (typeof body !== "string") {
    return body;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}
