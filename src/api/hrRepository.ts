import type {
  AttendanceCorrection,
  AttendanceRecord,
  AuditLog,
  EarlyLeaveLedger,
  Employee,
  LeaveRequest,
  OvertimeRequest,
  PayrollStatement,
  VerificationAttempt,
  Workplace
} from "../domain/types";
import type { SystemPolicy } from "./types";

export interface HrRepository {
  listEmployees(): Employee[];
  updateEmployee(employee: Employee): Employee;
  listWorkplaces(): Workplace[];
  listAttendanceRecords(): AttendanceRecord[];
  findAttendanceByEmployeeDate(employeeId: string, date: string): AttendanceRecord | undefined;
  upsertAttendanceRecord(record: AttendanceRecord): AttendanceRecord;
  addVerificationAttempt(attempt: VerificationAttempt): VerificationAttempt;
  listLeaveRequests(): LeaveRequest[];
  addLeaveRequest(request: LeaveRequest): LeaveRequest;
  updateLeaveRequest(request: LeaveRequest): LeaveRequest;
  listEarlyLeaveLedger(): EarlyLeaveLedger[];
  upsertEarlyLeaveLedger(entry: EarlyLeaveLedger): EarlyLeaveLedger;
  listOvertimeRequests(): OvertimeRequest[];
  addOvertimeRequest(request: OvertimeRequest): OvertimeRequest;
  updateOvertimeRequest(request: OvertimeRequest): OvertimeRequest;
  listCorrections(): AttendanceCorrection[];
  addCorrection(correction: AttendanceCorrection): AttendanceCorrection;
  listPayrollStatements(includeDeleted?: boolean): PayrollStatement[];
  addPayrollStatement(statement: PayrollStatement): PayrollStatement;
  updatePayrollStatement(statement: PayrollStatement): PayrollStatement;
  getSettings(): SystemPolicy;
  updateSettings(settings: Partial<SystemPolicy>): SystemPolicy;
  listAuditLogs(): AuditLog[];
  addAuditLog(log: AuditLog): AuditLog;
  nextId(prefix: string): string;
}
