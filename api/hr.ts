import type { IncomingMessage, ServerResponse } from "node:http";
import { handleHrHttpRequest } from "../src/server/hrHttpHandler.js";
import { getAuthenticatedSessionFromCookie } from "../src/server/productionAuth.js";

type VercelRequest = IncomingMessage & {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export default async function handler(request: VercelRequest, response: ServerResponse) {
  const authenticated = await getAuthenticatedSessionFromCookie(request.headers.cookie).catch(() => undefined);
  const result = await handleHrHttpRequest({
    method: request.method ?? "GET",
    query: request.query,
    body: parseRequestBody(request.body),
    serverSession: authenticated?.session
  });

  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(result.body));
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
