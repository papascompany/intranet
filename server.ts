import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import authHandler from "./api/auth.js";
import healthHandler from "./api/health.js";
import hrHandler from "./api/hr.js";
import payrollHandler from "./api/payroll.js";

// Self-hosted entry point. Reproduces the two Vercel Node runtime behaviors the
// api/ handlers rely on — parsed URL query on request.query and the raw body on
// request.body (handlers JSON-parse strings themselves) — then serves dist/ as
// the SPA with an index.html fallback.

type AugmentedRequest = IncomingMessage & {
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ApiHandler = (request: AugmentedRequest, response: ServerResponse) => unknown;

const API_ROUTES: Record<string, ApiHandler> = {
  "/api/auth": authHandler,
  "/api/health": healthHandler,
  "/api/hr": hrHandler,
  "/api/payroll": payrollHandler
};

// Payroll PDFs upload through /api/hr as base64 JSON (10MB PDF ≈ 13.4MB
// encoded), so the body cap must stay comfortably above that.
const MAX_BODY_BYTES = 16 * 1024 * 1024;

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(rootDir, "dist");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json"
};

class PayloadTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the allowed size.");
  }
}

async function readRequestBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError();
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseQuery(url: URL): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    const [first] = values;
    query[key] = values.length === 1 && first !== undefined ? first : values;
  }
  return query;
}

function respondJson(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function respondText(response: ServerResponse, status: number, message: string) {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(message);
}

async function serveIndexHtml(response: ServerResponse, method: string) {
  let html: Buffer;
  try {
    html = await fs.readFile(path.join(distDir, "index.html"));
  } catch {
    respondText(response, 503, "Frontend build is missing. Run `npm run build` first.");
    return;
  }
  response.statusCode = 200;
  response.setHeader("Content-Type", CONTENT_TYPES[".html"] ?? "text/html");
  response.setHeader("Cache-Control", "no-cache");
  response.end(method === "HEAD" ? undefined : html);
}

async function serveStatic(pathname: string, response: ServerResponse, method: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    respondText(response, 400, "Bad request");
    return;
  }
  if (decoded.includes("\0")) {
    respondText(response, 400, "Bad request");
    return;
  }

  const candidate = path.normalize(path.join(distDir, decoded));
  const insideDist = candidate === distDir || candidate.startsWith(distDir + path.sep);
  if (insideDist && candidate !== distDir) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) {
        response.statusCode = 200;
        response.setHeader(
          "Content-Type",
          CONTENT_TYPES[path.extname(candidate).toLowerCase()] ?? "application/octet-stream"
        );
        // Vite emits content-hashed filenames under assets/.
        if (decoded.startsWith("/assets/")) {
          response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
        response.end(method === "HEAD" ? undefined : await fs.readFile(candidate));
        return;
      }
    } catch {
      // Fall through to the SPA fallback.
    }
  }
  await serveIndexHtml(response, method);
}

async function routeRequest(request: IncomingMessage, response: ServerResponse) {
  const method = request.method ?? "GET";
  response.setHeader("X-Content-Type-Options", "nosniff");

  let url: URL;
  try {
    url = new URL(request.url ?? "/", "http://localhost");
  } catch {
    respondText(response, 400, "Bad request");
    return;
  }

  const handler = API_ROUTES[url.pathname];
  if (handler) {
    try {
      const augmented = request as AugmentedRequest;
      augmented.query = parseQuery(url);
      if (method !== "GET" && method !== "HEAD") {
        augmented.body = await readRequestBody(request);
      }
      await handler(augmented, response);
      if (!response.writableEnded) {
        response.end();
      }
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        if (!response.headersSent) {
          respondJson(response, 413, { error: "Request body too large." });
        }
        request.destroy();
        return;
      }
      console.error(`[server] ${method} ${url.pathname} failed:`, error);
      if (!response.headersSent) {
        respondJson(response, 500, { error: "Internal server error." });
      } else {
        response.end();
      }
    }
    return;
  }

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    respondJson(response, 404, { error: "Not found." });
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    respondText(response, 405, "Method not allowed");
    return;
  }

  await serveStatic(url.pathname, response, method);
}

const server = createServer((request, response) => {
  void routeRequest(request, response).catch((error) => {
    console.error("[server] unhandled request error:", error);
    if (!response.headersSent) {
      respondJson(response, 500, { error: "Internal server error." });
    } else {
      response.end();
    }
  });
});

// The health endpoint checks W_OK on this directory, so ensure it exists even
// outside the container image (local smoke runs, fresh volumes).
if (process.env.PAYROLL_STORAGE_DIR) {
  await fs.mkdir(process.env.PAYROLL_STORAGE_DIR, { recursive: true });
}

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`[server] listening on 0.0.0.0:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
