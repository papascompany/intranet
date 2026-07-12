import type { AuthSession } from "./auth";
import type {
  AuditLogFilter,
  ClockAttendanceInput,
  ClockAttendanceResult,
  CreateAttendanceCorrectionInput,
  Dashboard,
  DashboardInput,
  DownloadPayrollStatementInput,
  DownloadPayrollStatementResult,
  EmployeeSnapshot,
  SetOvertimePayApprovalInput,
  SoftDeletePayrollStatementInput,
  SubmitLeaveRequestInput,
  SubmitOvertimeRequestInput,
  UpdateEmployeeCardInput,
  UpdateSettingsInput,
  UpdateRequestStatusInput,
  UploadPayrollStatementInput
} from "./types";
import type {
  AttendanceCorrection,
  AuditLog,
  Employee,
  LeaveRequest,
  OvertimeRequest,
  PayrollStatement
} from "../domain/types";
import type { SystemPolicy } from "./types";

type HrHttpError = {
  error?: string;
};

export async function getEmployees() {
  return await post<Employee[]>("getEmployees");
}

export async function getEmployeeDirectory(input: { session?: AuthSession } = {}) {
  return await post<Employee[]>("getEmployeeDirectory", input);
}

export async function getDashboard(input: string | DashboardInput) {
  return await post<Dashboard>("getDashboard", input);
}

export async function getEmployeeSnapshot(employeeId: string, asOf?: string, session?: AuthSession) {
  return await post<EmployeeSnapshot>("getEmployeeSnapshot", {
    employeeId,
    asOf,
    session
  });
}

export async function getSettings(input: { session?: AuthSession } = {}) {
  return await post<SystemPolicy>("getSettings", input);
}

export async function updateSettings(input: UpdateSettingsInput) {
  return await post<{ settings: SystemPolicy; auditLog: AuditLog }>("updateSettings", input);
}

export async function clockAttendance(input: ClockAttendanceInput) {
  return await post<ClockAttendanceResult>("clockAttendance", input);
}

export async function submitLeaveRequest(input: SubmitLeaveRequestInput) {
  return await post<{ request: LeaveRequest; auditLog: AuditLog }>("submitLeaveRequest", input);
}

export async function submitOvertimeRequest(input: SubmitOvertimeRequestInput) {
  return await post<{ request: OvertimeRequest; auditLog: AuditLog }>("submitOvertimeRequest", input);
}

export async function updateRequestStatus(input: UpdateRequestStatusInput) {
  return await post<{ request: LeaveRequest | OvertimeRequest; auditLog: AuditLog }>("updateRequestStatus", input);
}

export async function setOvertimePayApproval(input: SetOvertimePayApprovalInput) {
  return await post<{ request: OvertimeRequest; auditLog: AuditLog }>("setOvertimePayApproval", input);
}

export async function createAttendanceCorrection(input: CreateAttendanceCorrectionInput) {
  return await post<{ correction: AttendanceCorrection; auditLog: AuditLog }>("createAttendanceCorrection", input);
}

export async function updateEmployeeCard(input: UpdateEmployeeCardInput) {
  return await post<{ employee: Employee; auditLog: AuditLog }>("updateEmployeeCard", input);
}

export async function uploadPayrollStatement(input: UploadPayrollStatementInput) {
  return await post<{ statement: PayrollStatement; auditLog: AuditLog }>("uploadPayrollStatement", input);
}

export async function downloadPayrollStatement(input: DownloadPayrollStatementInput) {
  return await post<DownloadPayrollStatementResult>("downloadPayrollStatement", input);
}

export async function softDeletePayrollStatement(input: SoftDeletePayrollStatementInput) {
  return await post<{ statement: PayrollStatement; auditLog: AuditLog }>("softDeletePayrollStatement", input);
}

export async function getAuditLogs(input: AuditLogFilter = {}) {
  return await post<AuditLog[]>("getAuditLogs", input);
}

async function post<T>(action: string, payload?: unknown) {
  const response = await fetch("/api/hr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action, payload })
  });
  if (response.status === 404) {
    return await postToLocalDemoApi<T>(action, payload);
  }

  const body = (await response.json()) as T | HrHttpError;

  if (!response.ok) {
    throw new Error(isHrHttpError(body) && body.error ? body.error : `API request failed: ${action}`);
  }

  return body as T;
}

function isHrHttpError(body: unknown): body is HrHttpError {
  return typeof body === "object" && body !== null && "error" in body;
}

async function postToLocalDemoApi<T>(action: string, payload?: unknown) {
  const api = await import("./hrApi");

  switch (action) {
    case "getEmployees":
      return (await api.getEmployees()) as T;
    case "getEmployeeDirectory":
      return (await api.getEmployeeDirectory(payload as never)) as T;
    case "getDashboard":
      return (await api.getDashboard(payload as never)) as T;
    case "getEmployeeSnapshot": {
      const snapshotPayload = payload as { employeeId: string; asOf?: string; session?: never };
      return (await api.getEmployeeSnapshot(snapshotPayload.employeeId, snapshotPayload.asOf, snapshotPayload.session)) as T;
    }
    case "getSettings":
      return (await api.getSettings(payload as never)) as T;
    case "getAuditLogs":
      return (await api.getAuditLogs(payload as never)) as T;
    case "clockAttendance":
      return (await api.clockAttendance(payload as never)) as T;
    case "submitLeaveRequest":
      return (await api.submitLeaveRequest(payload as never)) as T;
    case "submitOvertimeRequest":
      return (await api.submitOvertimeRequest(payload as never)) as T;
    case "updateRequestStatus":
      return (await api.updateRequestStatus(payload as never)) as T;
    case "setOvertimePayApproval":
      return (await api.setOvertimePayApproval(payload as never)) as T;
    case "createAttendanceCorrection":
      return (await api.createAttendanceCorrection(payload as never)) as T;
    case "updateEmployeeCard":
      return (await api.updateEmployeeCard(payload as never)) as T;
    case "uploadPayrollStatement":
      return (await api.uploadPayrollStatement(payload as never)) as T;
    case "downloadPayrollStatement":
      return (await api.downloadPayrollStatement(payload as never)) as T;
    case "softDeletePayrollStatement":
      return (await api.softDeletePayrollStatement(payload as never)) as T;
    case "updateSettings":
      return (await api.updateSettings(payload as never)) as T;
    default:
      throw new Error(`Unsupported local demo action: ${action}`);
  }
}
