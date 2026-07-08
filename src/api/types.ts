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
} from "../domain/types";

export type CoordinateInput = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

export type ClockAttendanceInput = {
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

export type SubmitLeaveRequestInput = {
  employeeId: string;
  type: LeaveType;
  startsOn: string;
  endsOn: string;
  days: number;
  reason: string;
  actorId?: string;
  status?: Extract<RequestStatus, "DRAFT" | "PENDING">;
};

export type UpdateRequestStatusInput = {
  targetType: "LeaveRequest" | "OvertimeRequest";
  requestId: string;
  status: Extract<RequestStatus, "APPROVED" | "REJECTED" | "PENDING">;
  actorId: string;
  detail?: string;
};

export type CreateAttendanceCorrectionInput = {
  attendanceId: string;
  employeeId: string;
  correctedById: string;
  type: CorrectionType;
  beforeValue?: string;
  afterValue: string;
  reason: string;
  createdAt?: string;
};

export type UploadPayrollStatementInput = {
  employeeId: string;
  month: string;
  filename: string;
  actorId: string;
  uploadedAt?: string;
};

export type SoftDeletePayrollStatementInput = {
  statementId: string;
  actorId: string;
  deletedAt?: string;
};

export type AuditLogFilter = {
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
  pendingLeaveRequests: LeaveRequest[];
  gpsFailedAttendance: AttendanceRecord[];
  activePayrollStatements: PayrollStatement[];
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
  recentAuditLogs: AuditLog[];
};
