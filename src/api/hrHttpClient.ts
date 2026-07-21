import type { AuthSession } from "./auth";
import type {
  AuditLogFilter,
  CancelRequestInput,
  ClockAttendanceInput,
  ClockAttendanceResult,
  CreateAttendanceCorrectionResult,
  CreateEmployeeAccountInput,
  CreateDailyWorkTaskPlanInput,
  CreateAttendanceCorrectionInput,
  ReviewAttendanceInput,
  ReviewAttendanceResult,
  CreateWorkplaceInput,
  ImportEmployeeAccountsInput,
  ImportEmployeeAccountsResult,
  Dashboard,
  DashboardInput,
  DownloadPayrollStatementInput,
  DownloadPayrollStatementResult,
  EmployeeSnapshot,
  EmployeeAccountState,
  GetDailyWorkTasksInput,
  RegisterUploadedPayrollStatementInput,
  RevealEmployeeSensitiveDataInput,
  ResetEmployeeAccountPasswordInput,
  SetEmployeeAccountAccessInput,
  SetOvertimePayApprovalInput,
  SubmitAttendanceCorrectionRequestInput,
  SoftDeletePayrollStatementInput,
  SubmitLeaveRequestInput,
  SubmitOvertimeRequestInput,
  UpdateEmployeeCardInput,
  UpdateDailyWorkTaskPlanInput,
  UpdateDailyWorkTaskStatusInput,
  UpdateSettingsInput,
  PersistenceStatus,
  UpdateRequestStatusInput,
  UpdateAttendanceCorrectionRequestStatusInput,
  UpdateAttendanceCorrectionRequestStatusResult,
  UpdateWorkplaceInput,
  DeleteWorkplaceInput,
  UploadPayrollStatementInput
} from "./types";
import type { AppBootstrap } from "./types";
import type {
  AttendanceCorrection,
  AttendanceCorrectionRequest,
  AuditLog,
  DailyWorkTask,
  Employee,
  LeaveRequest,
  OvertimeRequest,
  PayrollStatement,
  Workplace
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

export async function getAppBootstrap(employeeId: string, asOf?: string, session?: AuthSession) {
  return await post<AppBootstrap>("getAppBootstrap", { employeeId, asOf, session });
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

export async function getDailyWorkTasks(input: GetDailyWorkTasksInput) {
  return await post<DailyWorkTask[]>("getDailyWorkTasks", input);
}

export async function updateDailyWorkTaskStatus(input: UpdateDailyWorkTaskStatusInput) {
  return await post<{ task: DailyWorkTask; auditLog: AuditLog }>("updateDailyWorkTaskStatus", input);
}

export async function createDailyWorkTaskPlan(input: CreateDailyWorkTaskPlanInput) {
  return await post<{ task: DailyWorkTask; auditLog: AuditLog }>("createDailyWorkTaskPlan", input);
}

export async function updateDailyWorkTaskPlan(input: UpdateDailyWorkTaskPlanInput) {
  return await post<{ task: DailyWorkTask; auditLog: AuditLog }>("updateDailyWorkTaskPlan", input);
}

export async function getSettings(input: { session?: AuthSession } = {}) {
  return await post<SystemPolicy>("getSettings", input);
}

export async function getSystemStatus() {
  return await post<PersistenceStatus>("getSystemStatus");
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

export async function cancelRequest(input: CancelRequestInput) {
  return await post<{ request: LeaveRequest | OvertimeRequest | AttendanceCorrectionRequest; auditLog: AuditLog }>("cancelRequest", input);
}

export async function createWorkplace(input: CreateWorkplaceInput) {
  return await post<{ workplace: Workplace; auditLog: AuditLog }>("createWorkplace", input);
}

export async function updateWorkplace(input: UpdateWorkplaceInput) {
  return await post<{ workplace: Workplace; auditLog: AuditLog }>("updateWorkplace", input);
}

export async function deleteWorkplace(input: DeleteWorkplaceInput) {
  return await post<{ workplace: Workplace; auditLog: AuditLog }>("deleteWorkplace", input);
}

export async function setOvertimePayApproval(input: SetOvertimePayApprovalInput) {
  return await post<{ request: OvertimeRequest; auditLog: AuditLog }>("setOvertimePayApproval", input);
}

export async function createAttendanceCorrection(input: CreateAttendanceCorrectionInput) {
  return await post<CreateAttendanceCorrectionResult>("createAttendanceCorrection", input);
}

export async function reviewAttendance(input: ReviewAttendanceInput) {
  return await post<ReviewAttendanceResult>("reviewAttendance", input);
}

export async function submitAttendanceCorrectionRequest(input: SubmitAttendanceCorrectionRequestInput) {
  return await post<{ request: AttendanceCorrectionRequest; auditLog: AuditLog }>("submitAttendanceCorrectionRequest", input);
}

export async function updateAttendanceCorrectionRequestStatus(input: UpdateAttendanceCorrectionRequestStatusInput) {
  return await post<UpdateAttendanceCorrectionRequestStatusResult>("updateAttendanceCorrectionRequestStatus", input);
}

export async function updateEmployeeCard(input: UpdateEmployeeCardInput) {
  return await post<{ employee: Employee; auditLog: AuditLog }>("updateEmployeeCard", input);
}

export async function revealEmployeeSensitiveData(input: Omit<RevealEmployeeSensitiveDataInput, "actorId" | "session">) {
  return await post<{ employee: Employee; auditLog: AuditLog }>("revealEmployeeSensitiveData", input);
}

export async function createEmployeeAccount(input: Omit<CreateEmployeeAccountInput, "actorId" | "session">) {
  return await post<{ employee: Employee; temporaryPassword: string; auditLog: AuditLog }>("createEmployeeAccount", input);
}

export async function importEmployeeAccounts(input: Omit<ImportEmployeeAccountsInput, "actorId" | "session">) {
  return await post<ImportEmployeeAccountsResult>("importEmployeeAccounts", input);
}

export async function resetEmployeeAccountPassword(employeeId: string, temporaryPassword: string) {
  return await post<{ employeeId: string; auditLog: AuditLog }>("resetEmployeeAccountPassword", { employeeId, temporaryPassword });
}

export async function setEmployeeAccountAccess(employeeId: string, enabled: boolean) {
  return await post<{ employeeId: string; enabled: boolean; auditLog: AuditLog }>("setEmployeeAccountAccess", { employeeId, enabled });
}

export async function getEmployeeAccountStates() {
  return await post<EmployeeAccountState[]>("getEmployeeAccountStates");
}

export async function uploadPayrollStatement(input: UploadPayrollStatementInput) {
  return await post<{ statement: PayrollStatement; auditLog: AuditLog }>("uploadPayrollStatement", input);
}

export async function registerUploadedPayrollStatement(input: Omit<RegisterUploadedPayrollStatementInput, "actorId" | "session">) {
  return await post<{ statement: PayrollStatement; auditLog: AuditLog }>("registerUploadedPayrollStatement", input);
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
  const viteEnv = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  if (response.status === 404 && viteEnv?.DEV) {
    return await postToLocalDemoApi<T>(action, payload);
  }

  const bodyText = await response.text();
  const body = parseResponseBody<T | HrHttpError>(bodyText);

  if (!response.ok) {
    throw new Error(isHrHttpError(body) && body.error ? body.error : `API request failed: ${action} (${response.status})`);
  }

  return body as T;
}

function parseResponseBody<T>(bodyText: string): T | string {
  try {
    return JSON.parse(bodyText) as T;
  } catch {
    return bodyText;
  }
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
    case "getAppBootstrap":
      return (await api.getAppBootstrap(payload as never)) as T;
    case "getDashboard":
      return (await api.getDashboard(payload as never)) as T;
    case "getEmployeeSnapshot": {
      const snapshotPayload = payload as { employeeId: string; asOf?: string; session?: never };
      return (await api.getEmployeeSnapshot(snapshotPayload.employeeId, snapshotPayload.asOf, snapshotPayload.session)) as T;
    }
    case "getDailyWorkTasks":
      return (await api.getDailyWorkTasks(payload as never)) as T;
    case "updateDailyWorkTaskStatus":
      return (await api.updateDailyWorkTaskStatus(payload as never)) as T;
    case "createDailyWorkTaskPlan":
      return (await api.createDailyWorkTaskPlan(payload as never)) as T;
    case "updateDailyWorkTaskPlan":
      return (await api.updateDailyWorkTaskPlan(payload as never)) as T;
    case "getSettings":
      return (await api.getSettings(payload as never)) as T;
    case "getSystemStatus":
      return {
        repositoryMode: "memory",
        persistence: "ephemeral",
        demoOnly: true,
        databaseConfigured: false,
        reason: "LOCAL_DEMO_FALLBACK"
      } as T;
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
    case "cancelRequest":
      return (await api.cancelRequest(payload as never)) as T;
    case "setOvertimePayApproval":
      return (await api.setOvertimePayApproval(payload as never)) as T;
    case "createAttendanceCorrection":
      return (await api.createAttendanceCorrection(payload as never)) as T;
    case "reviewAttendance":
      return (await api.reviewAttendance(payload as never)) as T;
    case "submitAttendanceCorrectionRequest":
      return (await api.submitAttendanceCorrectionRequest(payload as never)) as T;
    case "updateAttendanceCorrectionRequestStatus":
      return (await api.updateAttendanceCorrectionRequestStatus(payload as never)) as T;
    case "updateEmployeeCard":
      return (await api.updateEmployeeCard(payload as never)) as T;
    case "revealEmployeeSensitiveData":
      return (await api.revealEmployeeSensitiveData(payload as never)) as T;
    case "createEmployeeAccount":
      return (await api.createEmployeeAccount(payload as never)) as T;
    case "importEmployeeAccounts":
      return (await api.importEmployeeAccounts(payload as never)) as T;
    case "resetEmployeeAccountPassword":
      return (await api.resetEmployeeAccountPassword(payload as never)) as T;
    case "setEmployeeAccountAccess":
      return (await api.setEmployeeAccountAccess(payload as never)) as T;
    case "getEmployeeAccountStates":
      return (await api.getEmployeeAccountStates(payload as never)) as T;
    case "uploadPayrollStatement":
      return (await api.uploadPayrollStatement(payload as never)) as T;
    case "registerUploadedPayrollStatement":
      return (await api.registerUploadedPayrollStatement(payload as never)) as T;
    case "downloadPayrollStatement":
      return (await api.downloadPayrollStatement(payload as never)) as T;
    case "softDeletePayrollStatement":
      return (await api.softDeletePayrollStatement(payload as never)) as T;
    case "updateSettings":
      return (await api.updateSettings(payload as never)) as T;
    case "createWorkplace":
      return (await api.createWorkplace(payload as never)) as T;
    case "updateWorkplace":
      return (await api.updateWorkplace(payload as never)) as T;
    case "deleteWorkplace":
      return (await api.deleteWorkplace(payload as never)) as T;
    default:
      throw new Error(`Unsupported local demo action: ${action}`);
  }
}
