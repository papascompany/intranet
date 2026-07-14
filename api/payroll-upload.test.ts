import { describe, expect, it } from "vitest";
import type { HandleUploadBody } from "@vercel/blob/client";
import { handlePayrollUploadHttpRequest, serializeTokenPayload } from "./payroll-upload.js";

const env = {
  DATABASE_URL: "postgres://test",
  SESSION_SECRET: "a-very-long-test-session-secret-at-least-32-chars",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test"
};

const tokenRequest: HandleUploadBody = {
  type: "blob.generate-client-token",
  payload: {
    pathname: "emp-ops-1/2026-07/statement.pdf",
    clientPayload: JSON.stringify({ version: 1, employeeId: "emp-ops-1", month: "2026-07", filename: "statement.pdf" }),
    multipart: false
  }
};

function rawRequest() {
  return { headers: {} } as never;
}

describe("payroll direct upload API", () => {
  it("only issues a constrained token to an authenticated admin", async () => {
    let receivedOptions: Parameters<NonNullable<Parameters<typeof handlePayrollUploadHttpRequest>[3]>["handleUpload"]>[0] | undefined;
    const response = await handlePayrollUploadHttpRequest(
      { method: "POST", body: tokenRequest, cookie: "intranet_session=signed", rawRequest: rawRequest() },
      env,
      undefined,
      {
        getAuthenticatedSession: async () => ({
          accountId: "account-1",
          employeeNumber: "EMP-0001",
          session: { employeeId: "admin-1", role: "HR_ADMIN", authenticatedAt: "2026-07-14T00:00:00.000Z", rememberLogin: false }
        }),
        now: () => new Date("2026-07-14T00:00:00.000Z"),
        handleUpload: async (options) => {
          receivedOptions = options;
          const constraints = await options.onBeforeGenerateToken(
            tokenRequest.payload.pathname,
            tokenRequest.payload.clientPayload,
            false
          );
          expect(constraints).toMatchObject({
            allowedContentTypes: ["application/pdf"],
            maximumSizeInBytes: 10 * 1024 * 1024,
            addRandomSuffix: false,
            allowOverwrite: false,
            validUntil: new Date("2026-07-14T00:15:00.000Z").getTime()
          });
          expect(JSON.parse(constraints.tokenPayload ?? "{}")).toMatchObject({
            actorEmployeeId: "admin-1",
            actorRole: "HR_ADMIN",
            employeeId: "emp-ops-1",
            month: "2026-07",
            filename: "statement.pdf",
            pathname: "emp-ops-1/2026-07/statement.pdf"
          });
          return { type: "blob.generate-client-token", clientToken: "issued-token" };
        }
      }
    );

    expect(response).toEqual({ status: 200, body: { clientToken: "issued-token" } });
    expect(receivedOptions?.token).toBe(env.BLOB_READ_WRITE_TOKEN);
  });

  it("registers a completed blob with the issuing admin reconstructed from the signed token payload", async () => {
    const tokenPayload = serializeTokenPayload({
      version: 1,
      actorEmployeeId: "admin-1",
      actorRole: "HR_ADMIN",
      actorAuthenticatedAt: "2026-07-14T00:00:00.000Z",
      employeeId: "emp-ops-1",
      month: "2026-07",
      filename: "statement.pdf",
      pathname: "emp-ops-1/2026-07/statement.pdf"
    });
    let registration: Record<string, unknown> | undefined;

    const response = await handlePayrollUploadHttpRequest(
      {
        method: "POST",
        body: { type: "blob.upload-completed", payload: { blob: {}, tokenPayload } },
        rawRequest: rawRequest()
      },
      env,
      undefined,
      {
        handleUpload: async (options) => {
          await options.onUploadCompleted?.({
            blob: {
              pathname: "emp-ops-1/2026-07/statement.pdf",
              url: "https://blob.example/statement.pdf",
              downloadUrl: "https://blob.example/statement.pdf?download=1",
              contentType: "application/pdf",
              contentDisposition: "inline",
              size: 128
            },
            tokenPayload
          });
          return { type: "blob.upload-completed", response: "ok" };
        },
        registerUploadedPayrollStatement: async (input) => {
          registration = input as unknown as Record<string, unknown>;
        }
      }
    );

    expect(response).toEqual({ status: 200, body: { ok: true } });
    expect(registration).toMatchObject({
      employeeId: "emp-ops-1",
      month: "2026-07",
      filename: "statement.pdf",
      storagePath: "emp-ops-1/2026-07/statement.pdf",
      actorId: "admin-1",
      session: { employeeId: "admin-1", role: "HR_ADMIN", authenticatedAt: "2026-07-14T00:00:00.000Z", rememberLogin: false }
    });
  });

  it("rejects missing authentication and non-admin sessions before token issuance", async () => {
    const request = { method: "POST", body: tokenRequest, rawRequest: rawRequest() };
    const unauthenticated = await handlePayrollUploadHttpRequest(request, env, undefined, {
      getAuthenticatedSession: async () => undefined
    });
    const employee = await handlePayrollUploadHttpRequest(request, env, undefined, {
      getAuthenticatedSession: async () => ({
        accountId: "account-2",
        employeeNumber: "EMP-0002",
        session: { employeeId: "emp-ops-1", role: "EMPLOYEE", authenticatedAt: "2026-07-14T00:00:00.000Z", rememberLogin: false }
      })
    });

    expect(unauthenticated.status).toBe(401);
    expect(employee.status).toBe(403);
  });

  it("rejects a pathname that does not match the signed payroll payload", async () => {
    const response = await handlePayrollUploadHttpRequest(
      {
        method: "POST",
        body: { ...tokenRequest, payload: { ...tokenRequest.payload, pathname: "outside/payroll.pdf" } },
        rawRequest: rawRequest()
      },
      env,
      undefined,
      {
        getAuthenticatedSession: async () => ({
          accountId: "account-1",
          employeeNumber: "EMP-0001",
          session: { employeeId: "admin-1", role: "SYSTEM_ADMIN", authenticatedAt: "2026-07-14T00:00:00.000Z", rememberLogin: false }
        }),
        handleUpload: async (options) => {
          await options.onBeforeGenerateToken("outside/payroll.pdf", tokenRequest.payload.clientPayload, false);
          return { type: "blob.generate-client-token", clientToken: "unexpected" };
        }
      }
    );

    expect(response).toEqual({ status: 400, body: { error: "Payroll upload request rejected." } });
  });
});
