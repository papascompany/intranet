import type {
  AttendanceCorrection,
  AttendanceRecord,
  AuditLog,
  ClockType,
  CorrectionType,
  EarlyLeaveLedger,
  Employee,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  OvertimeOffsetResult,
  OvertimeRequest,
  PayrollStatement,
  RequestStatus,
  VerificationAttempt,
  VerificationMethod,
  Workplace
} from "../domain/types.js";
import type { AuthSession } from "./auth.js";
import type { EmployeeCardUpdateInput } from "../features/employeeCardUpdate.js";

export type AuthenticatedInput = {
  session?: AuthSession;
};

export type CoordinateInput = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

export type ClockAttendanceInput = AuthenticatedInput & {
  employeeId: string;
  type: ClockType;
  method: VerificationMethod;
  actorId?: string;
  now?: string;
  coordinate?: CoordinateInput;
  gpsError?: boolean;
  scheduledEndHour?: number;
};

export type ClockAttendanceResult = {
  attendance: AttendanceRecord;
  verification: VerificationAttempt;
  auditLog: AuditLog;
  earlyLeaveLedger?: EarlyLeaveLedger;
};

export type SubmitLeaveRequestInput = AuthenticatedInput & {
  employeeId: string;
  type: LeaveType;
  startsOn: string;
  endsOn: string;
  days: number;
  reason: string;
  actorId?: string;
  status?: Extract<RequestStatus, "DRAFT" | "PENDING">;
};

export type SubmitOvertimeRequestInput = AuthenticatedInput & {
  employeeId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  minutes: number;
  reason: string;
  actorId?: string;
  status?: RequestStatus;
};

export type UpdateRequestStatusInput = AuthenticatedInput & {
  targetType: "LeaveRequest" | "OvertimeRequest";
  requestId: string;
  status: Extract<RequestStatus, "APPROVED" | "REJECTED" | "PENDING">;
  actorId: string;
  detail?: string;
};

export type SetOvertimePayApprovalInput = AuthenticatedInput & {
  requestId: string;
  payApproved: boolean;
  actorId: string;
  detail?: string;
};

export type CreateAttendanceCorrectionInput = AuthenticatedInput & {
  attendanceId: string;
  employeeId: string;
  correctedById: string;
  type: CorrectionType;
  beforeValue?: string;
  afterValue: string;
  reason: string;
  createdAt?: string;
};

export type UploadPayrollStatementInput = AuthenticatedInput & {
  employeeId: string;
  month: string;
  filename: string;
  actorId: string;
  file?: {
    contentBase64: string;
    contentType: "application/pdf";
    sizeBytes?: number;
  };
  uploadedAt?: string;
};

export type RegisterUploadedPayrollStatementInput = AuthenticatedInput & {
  employeeId: string;
  month: string;
  filename: string;
  storagePath: string;
  actorId: string;
  uploadedAt?: string;
};

export type CreateEmployeeAccountInput = AuthenticatedInput & {
  actorId: string;
  employee: Omit<Employee, "id">;
  loginId: string;
};

export type ResetEmployeeAccountPasswordInput = AuthenticatedInput & {
  actorId: string;
  employeeId: string;
  temporaryPassword: string;
};

export type SetEmployeeAccountAccessInput = AuthenticatedInput & {
  actorId: string;
  employeeId: string;
  enabled: boolean;
};

export type RevealEmployeeSensitiveDataInput = AuthenticatedInput & {
  actorId: string;
  employeeId: string;
};

export type GetEmployeeAccountStatesInput = AuthenticatedInput & {
  actorId?: string;
};

export type EmployeeAccountState = {
  employeeId: string;
  loginId: string;
  enabled: boolean;
  passwordChangedAt: string;
  lastSignedInAt?: string;
};

export type EmployeeAuthAccount = {
  id: string;
  employeeId: string;
  employeeNumber: string;
  loginId: string;
  passwordHash: string;
  passwordChangedAt: string;
  passwordChangeRequired: boolean;
  failedSignInCount: number;
  lockedUntil?: string;
  lastSignedInAt?: string;
  disabledAt?: string;
};

export type DownloadPayrollStatementInput = AuthenticatedInput & {
  statementId: string;
  actorId?: string;
};

export type DownloadPayrollStatementResult = {
  statement: PayrollStatement;
  storageBucket: string;
  storagePath: string;
  signedUrl: string;
  auditLog: AuditLog;
};

export type SoftDeletePayrollStatementInput = AuthenticatedInput & {
  statementId: string;
  actorId: string;
  deleteReason: string;
  deletedAt?: string;
};

export type SystemPolicy = {
  gpsAllowedRadiusMeters: number;
  timezone: "Asia/Seoul";
  workStartTime: string;
  workEndTime: string;
  breakStartTime: string;
  breakEndTime: string;
  workDays: Array<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN">;
  annualLeaveAutoAccrual: boolean;
  annualLeaveUnit: 0.5 | 1;
  partialLeaveAllowed: boolean;
  annualLeaveOveruseAllowed: boolean;
  gpsFailureFallback: "QR_OR_MANUAL_EQUAL";
  payrollEmployeeAccess: "VIEW_ONLY";
  payrollDeleteMode: "ADMIN_ONLY_SOFT_DELETE";
  overtimePayApproverRole: "ADMIN_ONLY";
  advanceLeaveExceptionHandling: "HR_CORRECTION";
};

export const defaultSystemPolicy: SystemPolicy = {
  gpsAllowedRadiusMeters: 300,
  timezone: "Asia/Seoul",
  workStartTime: "08:00",
  workEndTime: "17:00",
  breakStartTime: "12:00",
  breakEndTime: "13:00",
  workDays: ["MON", "TUE", "WED", "THU", "FRI"],
  annualLeaveAutoAccrual: true,
  annualLeaveUnit: 0.5,
  partialLeaveAllowed: true,
  annualLeaveOveruseAllowed: false,
  gpsFailureFallback: "QR_OR_MANUAL_EQUAL",
  payrollEmployeeAccess: "VIEW_ONLY",
  payrollDeleteMode: "ADMIN_ONLY_SOFT_DELETE",
  overtimePayApproverRole: "ADMIN_ONLY",
  advanceLeaveExceptionHandling: "HR_CORRECTION"
};

export type PersistenceStatus = {
  repositoryMode: "postgres" | "memory";
  persistence: "persistent" | "ephemeral";
  demoOnly: boolean;
  databaseConfigured: boolean;
  reason: "DATABASE_URL_CONFIGURED" | "DATABASE_URL_MISSING" | "MEMORY_MODE_REQUESTED" | "LOCAL_DEMO_FALLBACK";
};

export type DashboardInput = AuthenticatedInput & {
  asOf?: string;
};

export type UpdateSettingsInput = AuthenticatedInput & {
  actorId: string;
  settings: Partial<SystemPolicy>;
};

export type UpdateEmployeeCardInput = AuthenticatedInput & {
  employeeId: string;
  actorId: string;
  patch: EmployeeCardUpdateInput;
  reason?: string;
};

export type GetDailyWorkTasksInput = AuthenticatedInput & {
  employeeId: string;
  date?: string;
};

export type UpdateDailyWorkTaskStatusInput = AuthenticatedInput & {
  taskId: string;
  status: import("../domain/types.js").DailyWorkTaskStatus;
  actorId?: string;
  completedAt?: string;
};

export type CreateDailyWorkTaskPlanInput = AuthenticatedInput & {
  actorId?: string;
  employeeId: string;
  date: string;
  title: string;
  dueLabel?: string;
  displayOrder?: number;
  status?: import("../domain/types.js").DailyWorkTaskStatus;
  completedAt?: string;
};

export type UpdateDailyWorkTaskPlanInput = AuthenticatedInput & {
  actorId?: string;
  taskId: string;
  employeeId?: string;
  date?: string;
  title?: string;
  dueLabel?: string | null;
  displayOrder?: number;
  status?: import("../domain/types.js").DailyWorkTaskStatus;
  completedAt?: string | null;
};

export type AuditLogFilter = AuthenticatedInput & {
  actorId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  limit?: number;
};

export type Dashboard = {
  asOf: string;
  employeesTotal: number;
  pilotEmployees: number;
  todayAttendance: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  pendingLeaveRequests: LeaveRequest[];
  overtimeRequests: OvertimeRequest[];
  corrections: AttendanceCorrection[];
  gpsFailedAttendance: AttendanceRecord[];
  activePayrollStatements: PayrollStatement[];
  settings?: SystemPolicy;
  recentAuditLogs: AuditLog[];
};

export type EmployeeSnapshot = {
  asOf: string;
  employee: Employee;
  workplaceOptions: Workplace[];
  todayAttendance?: AttendanceRecord;
  attendanceRecords: AttendanceRecord[];
  leaveBalance: LeaveBalance;
  leaveRequests: LeaveRequest[];
  earlyLeaveLedger: EarlyLeaveLedger[];
  overtimeRequests: OvertimeRequest[];
  overtimeOffset?: OvertimeOffsetResult;
  attendanceCorrections: AttendanceCorrection[];
  payrollStatements: PayrollStatement[];
  dailyWorkTasks: import("../domain/types.js").DailyWorkTask[];
  recentAuditLogs: AuditLog[];
};

export type AppBootstrap = {
  employees: Employee[];
  dashboard: Dashboard;
  employeeSnapshot: EmployeeSnapshot;
  employeeAccountStates: EmployeeAccountState[];
};
