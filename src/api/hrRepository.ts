import type {
  AttendanceCorrection,
  AttendanceRecord,
  AuditLog,
  DailyWorkTask,
  EarlyLeaveLedger,
  Employee,
  LeaveRequest,
  OvertimeRequest,
  PayrollStatement,
  VerificationAttempt,
  Workplace
} from "../domain/types";
import type { SystemPolicy } from "./types";

export type MaybePromise<T> = T | Promise<T>;

export interface HrRepository {
  listEmployees(): MaybePromise<Employee[]>;
  updateEmployee(employee: Employee): MaybePromise<Employee>;
  listWorkplaces(): MaybePromise<Workplace[]>;
  listAttendanceRecords(): MaybePromise<AttendanceRecord[]>;
  findAttendanceByEmployeeDate(employeeId: string, date: string): MaybePromise<AttendanceRecord | undefined>;
  upsertAttendanceRecord(record: AttendanceRecord): MaybePromise<AttendanceRecord>;
  addVerificationAttempt(attempt: VerificationAttempt): MaybePromise<VerificationAttempt>;
  listLeaveRequests(): MaybePromise<LeaveRequest[]>;
  addLeaveRequest(request: LeaveRequest): MaybePromise<LeaveRequest>;
  updateLeaveRequest(request: LeaveRequest): MaybePromise<LeaveRequest>;
  listEarlyLeaveLedger(): MaybePromise<EarlyLeaveLedger[]>;
  upsertEarlyLeaveLedger(entry: EarlyLeaveLedger): MaybePromise<EarlyLeaveLedger>;
  listOvertimeRequests(): MaybePromise<OvertimeRequest[]>;
  addOvertimeRequest(request: OvertimeRequest): MaybePromise<OvertimeRequest>;
  updateOvertimeRequest(request: OvertimeRequest): MaybePromise<OvertimeRequest>;
  listCorrections(): MaybePromise<AttendanceCorrection[]>;
  addCorrection(correction: AttendanceCorrection): MaybePromise<AttendanceCorrection>;
  listPayrollStatements(includeDeleted?: boolean): MaybePromise<PayrollStatement[]>;
  addPayrollStatement(statement: PayrollStatement): MaybePromise<PayrollStatement>;
  updatePayrollStatement(statement: PayrollStatement): MaybePromise<PayrollStatement>;
  listDailyWorkTasks(): MaybePromise<DailyWorkTask[]>;
  addDailyWorkTask(task: DailyWorkTask): MaybePromise<DailyWorkTask>;
  updateDailyWorkTask(task: DailyWorkTask): MaybePromise<DailyWorkTask>;
  getSettings(): MaybePromise<SystemPolicy>;
  updateSettings(settings: Partial<SystemPolicy>): MaybePromise<SystemPolicy>;
  listAuditLogs(): MaybePromise<AuditLog[]>;
  addAuditLog(log: AuditLog): MaybePromise<AuditLog>;
  nextId(prefix: string): MaybePromise<string>;
}
