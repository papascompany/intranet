import type { HrApi } from "../api/hrApi.js";
import type { AuthSession } from "../api/auth.js";
import { createServerHrApi } from "./neonRepositoryFactory.js";

export type HrHttpRequest = {
  method: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type HrHttpResponse = {
  status: number;
  body: unknown;
};

export async function handleHrHttpRequest(request: HrHttpRequest, api: HrApi = createServerHrApi()): Promise<HrHttpResponse> {
  try {
    if (request.method === "GET") {
      return {
        status: 200,
        body: await handleGet(request, api)
      };
    }

    if (request.method === "POST") {
      return {
        status: 200,
        body: await handlePost(request, api)
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

async function handleGet(request: HrHttpRequest, api: HrApi) {
  const resource = singleQueryValue(request.query?.resource);

  switch (resource) {
    case "employees":
      return await api.getEmployeeDirectory();
    case "dashboard":
      return await api.getDashboard({ asOf: singleQueryValue(request.query?.asOf) });
    case "settings":
      return await api.getSettings();
    case "snapshot": {
      const employeeId = requireQueryValue(request.query?.employeeId, "employeeId");
      return await api.getEmployeeSnapshot(employeeId, singleQueryValue(request.query?.asOf));
    }
    default:
      throw new Error(`Unsupported GET resource: ${resource ?? "missing"}`);
  }
}

async function handlePost(request: HrHttpRequest, api: HrApi) {
  const body = request.body as { action?: string; payload?: unknown } | undefined;

  switch (body?.action) {
    case "getEmployees":
      return await api.getEmployees();
    case "getEmployeeDirectory":
      return await api.getEmployeeDirectory(body.payload as never);
    case "getDashboard":
      return await api.getDashboard(body.payload as never);
    case "getEmployeeSnapshot": {
      const payload = body.payload as { employeeId: string; asOf?: string; session?: AuthSession };
      return await api.getEmployeeSnapshot(payload.employeeId, payload.asOf, payload.session);
    }
    case "getDailyWorkTasks":
      return await api.getDailyWorkTasks(body.payload as never);
    case "updateDailyWorkTaskStatus":
      return await api.updateDailyWorkTaskStatus(body.payload as never);
    case "getSettings":
      return await api.getSettings(body.payload as never);
    case "getAuditLogs":
      return await api.getAuditLogs(body.payload as never);
    case "clockAttendance":
      return await api.clockAttendance(body.payload as never);
    case "submitLeaveRequest":
      return await api.submitLeaveRequest(body.payload as never);
    case "submitOvertimeRequest":
      return await api.submitOvertimeRequest(body.payload as never);
    case "updateRequestStatus":
      return await api.updateRequestStatus(body.payload as never);
    case "setOvertimePayApproval":
      return await api.setOvertimePayApproval(body.payload as never);
    case "createAttendanceCorrection":
      return await api.createAttendanceCorrection(body.payload as never);
    case "updateEmployeeCard":
      return await api.updateEmployeeCard(body.payload as never);
    case "uploadPayrollStatement":
      return await api.uploadPayrollStatement(body.payload as never);
    case "downloadPayrollStatement":
      return await api.downloadPayrollStatement(body.payload as never);
    case "softDeletePayrollStatement":
      return await api.softDeletePayrollStatement(body.payload as never);
    case "updateSettings":
      return await api.updateSettings(body.payload as never);
    default:
      throw new Error(`Unsupported POST action: ${body?.action ?? "missing"}`);
  }
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
