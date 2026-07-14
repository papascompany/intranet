import type { HrApi } from "../api/hrApi.js";
import type { AuthSession } from "../api/auth.js";
import type { PersistenceStatus } from "../api/types.js";
import { createServerHrApi, getPersistenceStatusFromEnv } from "./neonRepositoryFactory.js";

export type HrHttpRequest = {
  method: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  /** Set only by the server entry point after signed-cookie verification. */
  serverSession?: AuthSession;
};

export type HrHttpResponse = {
  status: number;
  body: unknown;
};

export async function handleHrHttpRequest(
  request: HrHttpRequest,
  api: HrApi = createServerHrApi(),
  persistenceStatus: PersistenceStatus = getPersistenceStatusFromEnv()
): Promise<HrHttpResponse> {
  try {
    const isPublicStatusRequest =
      (request.method === "GET" && singleQueryValue(request.query?.resource) === "status") ||
      (request.method === "POST" && (request.body as { action?: string } | undefined)?.action === "getSystemStatus");
    if (!isPublicStatusRequest && !request.serverSession) {
      return { status: 401, body: { error: "Authentication required." } };
    }
    if (!isPublicStatusRequest && request.serverSession?.passwordChangeRequired) {
      return { status: 403, body: { error: "Password change is required before using intranet services." } };
    }

    if (request.method === "GET") {
      return {
        status: 200,
        body: await handleGet(request, api, persistenceStatus)
      };
    }

    if (request.method === "POST") {
      return {
        status: 200,
        body: await handlePost(request, api, persistenceStatus)
      };
    }

    return {
      status: 405,
      body: { error: "Method not allowed" }
    };
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : "Unknown API error" }
    };
  }
}

async function handleGet(request: HrHttpRequest, api: HrApi, persistenceStatus: PersistenceStatus) {
  const resource = singleQueryValue(request.query?.resource);

  if (resource === "status") {
    return persistenceStatus;
  }
  const session = requireServerSession(request.serverSession);

  switch (resource) {
    case "employees":
      return await api.getEmployeeDirectory({ session });
    case "dashboard":
      return await api.getDashboard({ asOf: singleQueryValue(request.query?.asOf), session });
    case "settings":
      return await api.getSettings({ session });
    case "snapshot": {
      const employeeId = requireQueryValue(request.query?.employeeId, "employeeId");
      return await api.getEmployeeSnapshot(employeeId, singleQueryValue(request.query?.asOf), session);
    }
    default:
      throw new Error(`Unsupported GET resource: ${resource ?? "missing"}`);
  }
}

async function handlePost(request: HrHttpRequest, api: HrApi, persistenceStatus: PersistenceStatus) {
  const body = request.body as { action?: string; payload?: unknown } | undefined;
  if (body?.action === "getSystemStatus") {
    return persistenceStatus;
  }
  const session = requireServerSession(request.serverSession);
  const payload = withTrustedSession(body?.payload, session);

  switch (body?.action) {
    case "getEmployees":
      return await api.getEmployeeDirectory({ session });
    case "getEmployeeDirectory":
      return await api.getEmployeeDirectory(payload as never);
    case "getDashboard":
      return await api.getDashboard(payload as never);
    case "getEmployeeSnapshot": {
      const payload = withTrustedSession(body.payload, session) as unknown as { employeeId: string; asOf?: string; session: AuthSession };
      return await api.getEmployeeSnapshot(payload.employeeId, payload.asOf, payload.session);
    }
    case "getDailyWorkTasks":
      return await api.getDailyWorkTasks(payload as never);
    case "updateDailyWorkTaskStatus":
      return await api.updateDailyWorkTaskStatus(payload as never);
    case "createDailyWorkTaskPlan":
      return await api.createDailyWorkTaskPlan(payload as never);
    case "updateDailyWorkTaskPlan":
      return await api.updateDailyWorkTaskPlan(payload as never);
    case "getSettings":
      return await api.getSettings(payload as never);
    case "getAuditLogs":
      return await api.getAuditLogs(payload as never);
    case "clockAttendance":
      return await api.clockAttendance(payload as never);
    case "submitLeaveRequest":
      return await api.submitLeaveRequest(payload as never);
    case "submitOvertimeRequest":
      return await api.submitOvertimeRequest(payload as never);
    case "updateRequestStatus":
      return await api.updateRequestStatus(payload as never);
    case "setOvertimePayApproval":
      return await api.setOvertimePayApproval(payload as never);
    case "createAttendanceCorrection":
      return await api.createAttendanceCorrection(payload as never);
    case "updateEmployeeCard":
      return await api.updateEmployeeCard(payload as never);
    case "revealEmployeeSensitiveData":
      return await api.revealEmployeeSensitiveData(payload as never);
    case "createEmployeeAccount":
      return await api.createEmployeeAccount(payload as never);
    case "resetEmployeeAccountPassword":
      return await api.resetEmployeeAccountPassword(payload as never);
    case "setEmployeeAccountAccess":
      return await api.setEmployeeAccountAccess(payload as never);
    case "getEmployeeAccountStates":
      return await api.getEmployeeAccountStates(payload as never);
    case "uploadPayrollStatement":
      return await api.uploadPayrollStatement(payload as never);
    case "registerUploadedPayrollStatement":
      return await api.registerUploadedPayrollStatement(payload as never);
    case "downloadPayrollStatement":
      return await api.downloadPayrollStatement(payload as never);
    case "softDeletePayrollStatement":
      return await api.softDeletePayrollStatement(payload as never);
    case "updateSettings":
      return await api.updateSettings(payload as never);
    default:
      throw new Error(`Unsupported POST action: ${body?.action ?? "missing"}`);
  }
}

function requireServerSession(session: AuthSession | undefined) {
  if (!session) {
    throw new Error("Authentication required.");
  }
  return session;
}

function withTrustedSession(payload: unknown, session: AuthSession) {
  const input = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  return {
    ...input,
    session,
    // The browser may name a target employee, but it never supplies the actor.
    actorId: session.employeeId,
    correctedById: session.employeeId
  };
}

function singleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function requireQueryValue(value: string | string[] | undefined, key: string) {
  const single = singleQueryValue(value);
  if (!single) {
    throw new Error(`Missing query parameter: ${key}`);
  }

  return single;
}
