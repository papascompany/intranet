import type { IncomingMessage, ServerResponse } from "node:http";
import { createServerHrApi } from "../src/server/neonRepositoryFactory.js";
import { createPayrollFileStorageFromEnv } from "../src/server/vercelBlobPayrollStorage.js";
import { getAuthenticatedSessionFromCookie } from "../src/server/productionAuth.js";

type VercelRequest = IncomingMessage & {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

export default async function handler(request: VercelRequest, response: ServerResponse) {
  try {
    if (request.method !== "GET") {
      response.statusCode = 405;
      response.setHeader("Allow", "GET");
      response.end("Method not allowed");
      return;
    }
    const statementId = firstValue(request.query?.statementId);
    if (!statementId) {
      response.statusCode = 400;
      response.end("Missing statementId");
      return;
    }
    const authenticated = await getAuthenticatedSessionFromCookie(request.headers.cookie);
    if (!authenticated) {
      response.statusCode = 401;
      response.end("Authentication required.");
      return;
    }

    const storage = createPayrollFileStorageFromEnv();
    const api = createServerHrApi(process.env, { payrollStorage: storage });
    const result = await api.downloadPayrollStatement({
      statementId,
      actorId: authenticated.session.employeeId,
      session: authenticated.session
    });
    const file = await storage.get(result.storagePath);
    response.statusCode = 200;
    response.setHeader("Content-Type", file.contentType);
    response.setHeader("Content-Disposition", file.contentDisposition);
    response.setHeader("Cache-Control", "private, no-store");
    const reader = file.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(value);
    }
    response.end();
  } catch (error) {
    response.statusCode = 400;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "Payroll download failed." }));
  }
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
