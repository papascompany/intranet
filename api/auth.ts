import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AuthenticationError,
  authenticateCredentials,
  clearSessionCookie,
  getAuthenticatedSessionFromCookie,
  type AuthAccountQuery,
  type ServerAuthEnv
} from "../src/server/productionAuth.js";

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
      const body = request.body as { action?: string; employeeNumber?: string; password?: string; rememberLogin?: boolean } | undefined;
      if (body?.action === "login") {
        const result = await authenticateCredentials(
          {
            employeeNumber: body.employeeNumber ?? "",
            password: body.password ?? "",
            rememberLogin: body.rememberLogin
          },
          env,
          query
        );
        return { status: 200, body: { session: result.authenticated.session }, setCookie: result.cookie };
      }
      if (body?.action === "logout") {
        return { status: 200, body: { ok: true }, setCookie: clearSessionCookie(env) };
      }
      return { status: 400, body: { error: `Unsupported auth action: ${body?.action ?? "missing"}` } };
    }

    return { status: 405, body: { error: "Method not allowed" } };
  } catch (error) {
    const isAuthenticationError = error instanceof AuthenticationError;
    return {
      status: isAuthenticationError ? 401 : 500,
      body: { error: isAuthenticationError ? error.message : "Authentication service unavailable." }
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
