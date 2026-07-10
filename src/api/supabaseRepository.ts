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
import type { HrRepository } from "./hrRepository";
import type { SystemPolicy } from "./types";

export type SupabaseRepositoryConfig = {
  url: string;
  anonKey?: string;
  serviceRoleKey?: string;
};

export class SupabaseHrRepository implements HrRepository {
  constructor(private readonly config: SupabaseRepositoryConfig) {}

  listEmployees(): Employee[] {
    return this.notImplemented("listEmployees");
  }

  updateEmployee(_employee: Employee): Employee {
    return this.notImplemented("updateEmployee");
  }

  listWorkplaces(): Workplace[] {
    return this.notImplemented("listWorkplaces");
  }

  listAttendanceRecords(): AttendanceRecord[] {
    return this.notImplemented("listAttendanceRecords");
  }

  findAttendanceByEmployeeDate(_employeeId: string, _date: string): AttendanceRecord | undefined {
    return this.notImplemented("findAttendanceByEmployeeDate");
  }

  upsertAttendanceRecord(_record: AttendanceRecord): AttendanceRecord {
    return this.notImplemented("upsertAttendanceRecord");
  }

  addVerificationAttempt(_attempt: VerificationAttempt): VerificationAttempt {
    return this.notImplemented("addVerificationAttempt");
  }

  listLeaveRequests(): LeaveRequest[] {
    return this.notImplemented("listLeaveRequests");
  }

  addLeaveRequest(_request: LeaveRequest): LeaveRequest {
    return this.notImplemented("addLeaveRequest");
  }

  updateLeaveRequest(_request: LeaveRequest): LeaveRequest {
    return this.notImplemented("updateLeaveRequest");
  }

  listEarlyLeaveLedger(): EarlyLeaveLedger[] {
    return this.notImplemented("listEarlyLeaveLedger");
  }

  upsertEarlyLeaveLedger(_entry: EarlyLeaveLedger): EarlyLeaveLedger {
    return this.notImplemented("upsertEarlyLeaveLedger");
  }

  listOvertimeRequests(): OvertimeRequest[] {
    return this.notImplemented("listOvertimeRequests");
  }

  addOvertimeRequest(_request: OvertimeRequest): OvertimeRequest {
    return this.notImplemented("addOvertimeRequest");
  }

  updateOvertimeRequest(_request: OvertimeRequest): OvertimeRequest {
    return this.notImplemented("updateOvertimeRequest");
  }

  listCorrections(): AttendanceCorrection[] {
    return this.notImplemented("listCorrections");
  }

  addCorrection(_correction: AttendanceCorrection): AttendanceCorrection {
    return this.notImplemented("addCorrection");
  }

  listPayrollStatements(_includeDeleted = false): PayrollStatement[] {
    return this.notImplemented("listPayrollStatements");
  }

  addPayrollStatement(_statement: PayrollStatement): PayrollStatement {
    return this.notImplemented("addPayrollStatement");
  }

  updatePayrollStatement(_statement: PayrollStatement): PayrollStatement {
    return this.notImplemented("updatePayrollStatement");
  }

  getSettings(): SystemPolicy {
    return this.notImplemented("getSettings");
  }

  updateSettings(_settings: Partial<SystemPolicy>): SystemPolicy {
    return this.notImplemented("updateSettings");
  }

  listAuditLogs(): AuditLog[] {
    return this.notImplemented("listAuditLogs");
  }

  addAuditLog(_log: AuditLog): AuditLog {
    return this.notImplemented("addAuditLog");
  }

  nextId(_prefix: string): string {
    return this.notImplemented("nextId");
  }

  private notImplemented(method: keyof HrRepository): never {
    throw new Error(
      `SupabaseHrRepository.${String(method)} is not implemented yet for ${this.config.url}. Wire this method to Supabase tables before using it in production.`
    );
  }
}
