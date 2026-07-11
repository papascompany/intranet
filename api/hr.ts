import type { IncomingMessage, ServerResponse } from "node:http";
import { handleHrHttpRequest } from "../src/server/hrHttpHandler";

type VercelRequest = IncomingMessage & {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export default async function handler(request: VercelRequest, response: ServerResponse) {
  const result = await handleHrHttpRequest({
    method: request.method ?? "GET",
    query: request.query,
    body: request.body
  });

  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(result.body));
}
