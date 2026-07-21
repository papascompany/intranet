import type {
  AttendanceCorrection,
  AttendanceCorrectionRequest,
  AttendanceRecord,
  AuditLog,
  DailyWorkTask,
  EarlyLeaveLedger,
  Employee,
  EmployeeCustomAdminFields,
  LeaveBalanceAdjustment,
  LeaveRequest,
  OvertimeRequest,
  PayrollStatement,
  VerificationAttempt,
  Workplace
} from "../domain/types.js";
import type { HrRepository } from "./hrRepository.js";
import { defaultSystemPolicy, type EmployeeAuthAccount, type SystemPolicy } from "./types.js";

export type PostgresQuery = <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

export type PostgresRepositoryConfig = {
  query: PostgresQuery;
  decodeSensitiveText?: (column: string, value: unknown) => string | undefined;
  encodeSensitiveText?: (column: string, value: string | undefined) => unknown;
};

type DbRow = Record<string, unknown>;

export class PostgresHrRepository implements HrRepository {
  constructor(private readonly config: PostgresRepositoryConfig) {}

  async listEmployees() {
    const rows = await this.query<EmployeeRow>("select * from employees order by department asc, name asc");
    return rows.map((row) => this.employeeFromRow(row));
  }

  async findEmployee(employeeId: string) {
    const [row] = await this.query<EmployeeRow>("select * from employees where id = $1 limit 1", [employeeId]);
    return row ? this.employeeFromRow(row) : undefined;
  }

  async updateEmployee(employee: Employee) {
    const [row] = await this.update<EmployeeRow>("employees", employeeToRow(employee, this.config), "id", employee.id);
    return this.employeeFromRow(requireRow(row, "employees", employee.id));
  }

  async createEmployeeWithAccount(employee: Employee, account: EmployeeAuthAccount) {
    const employeeRow = compactRow(employeeToRow(employee, this.config));
    const employeeColumns = Object.keys(employeeRow);
    const employeeValues = Object.values(employeeRow);
    const accountRow = compactRow(employeeAccountToRow(account));
    const accountColumns = Object.keys(accountRow);
    const accountParameters = Object.entries(accountRow).filter(([column]) => column !== "employee_id");
    const accountParameterIndex = new Map(accountParameters.map(([column], index) => [column, employeeValues.length + index + 1]));
    const sql = [
      `with new_employee as (insert into employees (${employeeColumns.join(", ")}) values (${employeeColumns.map((_, index) => `$${index + 1}`).join(", ")}) returning id)`,
      `, new_account as (insert into auth_accounts (${accountColumns.join(", ")}) select ${accountColumns.map((column) => column === "employee_id" ? "new_employee.id" : `$${accountParameterIndex.get(column)}`).join(", ")} from new_employee returning id)`,
      "select new_employee.id as employee_id, new_account.id as account_id from new_employee cross join new_account"
    ].join(" ");
    const rows = await this.query<DbRow>(sql, [...employeeValues, ...accountParameters.map(([, value]) => value)]);
    requireRow(rows[0], "employees/auth_accounts", employee.id);
    return { employee, account };
  }

  async findEmployeeAccount(employeeId: string) {
    const rows = await this.query<AuthAccountRow>("select * from auth_accounts where employee_id = $1 limit 1", [employeeId]);
    return rows[0] ? employeeAccountFromRow(rows[0]) : undefined;
  }

  async listEmployeeAccounts() {
    const rows = await this.query<AuthAccountRow>("select * from auth_accounts order by employee_id asc");
    return rows.map(employeeAccountFromRow);
  }

  async updateEmployeeAccount(account: EmployeeAuthAccount) {
    const row = compactRow(employeeAccountToRow(account));
    delete row.id;
    const columns = Object.keys(row);
    const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
    const rows = await this.query<AuthAccountRow>(
      `update auth_accounts set ${assignments.join(", ")}, updated_at = now() where id = $1 returning *`,
      [account.id, ...Object.values(row)]
    );
    const [saved] = rows;
    return employeeAccountFromRow(requireRow(saved, "auth_accounts", account.id));
  }

  async listWorkplaces() {
    const rows = await this.query<WorkplaceRow>("select * from workplaces order by name asc");
    return rows.map(workplaceFromRow);
  }

  async addWorkplace(workplace: Workplace) {
    const [row] = await this.insert<WorkplaceRow>("workplaces", workplaceToRow(workplace));
    return workplaceFromRow(requireRow(row, "workplaces", workplace.id));
  }

  async updateWorkplace(workplace: Workplace) {
    const [row] = await this.update<WorkplaceRow>("workplaces", workplaceToRow(workplace), "id", workplace.id);
    return workplaceFromRow(requireRow(row, "workplaces", workplace.id));
  }

  async deleteWorkplace(workplaceId: string) {
    const [row] = await this.query<WorkplaceRow>("delete from workplaces where id = $1 returning *", [workplaceId]);
    return workplaceFromRow(requireRow(row, "workplaces", workplaceId));
  }

  async listAttendanceRecords() {
    const rows = await this.query<AttendanceRow>("select * from attendance_records order by work_date desc");
    return rows.map(attendanceFromRow);
  }

  async findAttendanceByEmployeeDate(employeeId: string, date: string) {
    const rows = await this.query<AttendanceRow>(
      "select * from attendance_records where employee_id = $1 and work_date = $2 limit 1",
      [employeeId, date]
    );
    return rows[0] ? attendanceFromRow(rows[0]) : undefined;
  }

  async upsertAttendanceRecord(record: AttendanceRecord) {
    const [row] = await this.upsert<AttendanceRow>("attendance_records", attendanceToRow(record), ["id"]);
    return attendanceFromRow(requireRow(row, "attendance_records", record.id));
  }

  async addVerificationAttempt(attempt: VerificationAttempt) {
    const [row] = await this.insert<VerificationRow>("verification_attempts", verificationToRow(attempt));
    return verificationFromRow(requireRow(row, "verification_attempts", attempt.id));
  }

  async listLeaveRequests() {
    const rows = await this.query<LeaveRequestRow>("select * from leave_requests order by created_at desc");
    return rows.map(leaveRequestFromRow);
  }

  async addLeaveRequest(request: LeaveRequest) {
    const [row] = await this.insert<LeaveRequestRow>("leave_requests", leaveRequestToRow(request));
    return leaveRequestFromRow(requireRow(row, "leave_requests", request.id));
  }

  async updateLeaveRequest(request: LeaveRequest) {
    const [row] = await this.update<LeaveRequestRow>("leave_requests", leaveRequestToRow(request), "id", request.id);
    return leaveRequestFromRow(requireRow(row, "leave_requests", request.id));
  }

  async listLeaveBalanceAdjustments() {
    const rows = await this.query<LeaveBalanceAdjustmentRow>("select * from leave_balance_adjustments order by created_at desc");
    return rows.map(leaveBalanceAdjustmentFromRow);
  }

  async addLeaveBalanceAdjustment(adjustment: LeaveBalanceAdjustment) {
    const [row] = await this.insert<LeaveBalanceAdjustmentRow>("leave_balance_adjustments", leaveBalanceAdjustmentToRow(adjustment));
    return leaveBalanceAdjustmentFromRow(requireRow(row, "leave_balance_adjustments", adjustment.id));
  }

  async listEarlyLeaveLedger() {
    const rows = await this.query<EarlyLeaveRow>("select * from early_leave_ledger order by work_date desc");
    return rows.map(earlyLeaveFromRow);
  }

  async upsertEarlyLeaveLedger(entry: EarlyLeaveLedger) {
    const [row] = await this.upsert<EarlyLeaveRow>("early_leave_ledger", earlyLeaveToRow(entry), ["id"]);
    return earlyLeaveFromRow(requireRow(row, "early_leave_ledger", entry.id));
  }

  async listOvertimeRequests() {
    const rows = await this.query<OvertimeRow>("select * from overtime_requests order by created_at desc");
    return rows.map(overtimeFromRow);
  }

  async addOvertimeRequest(request: OvertimeRequest) {
    const [row] = await this.insert<OvertimeRow>("overtime_requests", overtimeToRow(request));
    return overtimeFromRow(requireRow(row, "overtime_requests", request.id));
  }

  async updateOvertimeRequest(request: OvertimeRequest) {
    const [row] = await this.update<OvertimeRow>("overtime_requests", overtimeToRow(request), "id", request.id);
    return overtimeFromRow(requireRow(row, "overtime_requests", request.id));
  }

  async listCorrections() {
    const rows = await this.query<CorrectionRow>("select * from attendance_corrections order by created_at desc");
    return rows.map(correctionFromRow);
  }

  async addCorrection(correction: AttendanceCorrection) {
    const [row] = await this.insert<CorrectionRow>("attendance_corrections", correctionToRow(correction));
    return correctionFromRow(requireRow(row, "attendance_corrections", correction.id));
  }

  async listCorrectionRequests() {
    const rows = await this.query<CorrectionRequestRow>("select * from attendance_correction_requests order by created_at desc");
    return rows.map(correctionRequestFromRow);
  }

  async addCorrectionRequest(request: AttendanceCorrectionRequest) {
    const [row] = await this.insert<CorrectionRequestRow>("attendance_correction_requests", correctionRequestToRow(request));
    return correctionRequestFromRow(requireRow(row, "attendance_correction_requests", request.id));
  }

  async updateCorrectionRequest(request: AttendanceCorrectionRequest) {
    const [row] = await this.update<CorrectionRequestRow>("attendance_correction_requests", correctionRequestToRow(request), "id", request.id);
    return correctionRequestFromRow(requireRow(row, "attendance_correction_requests", request.id));
  }

  async listPayrollStatements(includeDeleted = false) {
    const where = includeDeleted ? "" : " where deleted_at is null";
    const rows = await this.query<PayrollRow>(
      `select * from payroll_statements${where} order by payroll_month desc, uploaded_at desc`
    );
    return rows.map(payrollFromRow);
  }

  async addPayrollStatement(statement: PayrollStatement) {
    const [row] = await this.insert<PayrollRow>("payroll_statements", payrollToRow(statement));
    return payrollFromRow(requireRow(row, "payroll_statements", statement.id));
  }

  async updatePayrollStatement(statement: PayrollStatement) {
    const [row] = await this.update<PayrollRow>("payroll_statements", payrollToRow(statement), "id", statement.id);
    return payrollFromRow(requireRow(row, "payroll_statements", statement.id));
  }

  async listDailyWorkTasks() {
    const rows = await this.query<DailyWorkTaskRow>(
      "select * from daily_work_tasks order by work_date desc, display_order asc, id asc"
    );
    return rows.map(dailyWorkTaskFromRow);
  }

  async addDailyWorkTask(task: DailyWorkTask) {
    const [row] = await this.insert<DailyWorkTaskRow>("daily_work_tasks", dailyWorkTaskToRow(task));
    return dailyWorkTaskFromRow(requireRow(row, "daily_work_tasks", task.id));
  }

  async updateDailyWorkTask(task: DailyWorkTask) {
    const [row] = await this.update<DailyWorkTaskRow>("daily_work_tasks", dailyWorkTaskToRow(task), "id", task.id);
    return dailyWorkTaskFromRow(requireRow(row, "daily_work_tasks", task.id));
  }

  async getSettings() {
    const rows = await this.query<SystemPolicyRow>("select * from system_policies where id = 'system-policy' limit 1");
    return rows[0] ? policyFromRow(rows[0]) : defaultSystemPolicy;
  }

  async updateSettings(settings: Partial<SystemPolicy>) {
    const [row] = await this.update<SystemPolicyRow>("system_policies", policyToRow(settings), "id", "system-policy");
    return policyFromRow(requireRow(row, "system_policies", "system-policy"));
  }

  async listAuditLogs() {
    const rows = await this.query<AuditLogRow>("select * from audit_logs order by created_at desc");
    return rows.map(auditLogFromRow);
  }

  async addAuditLog(log: AuditLog) {
    const [row] = await this.insert<AuditLogRow>("audit_logs", auditLogToRow(log));
    return auditLogFromRow(requireRow(row, "audit_logs", log.id));
  }

  async nextId(prefix: string) {
    const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 14);
    return `${prefix}-${random}`;
  }

  private async query<T extends DbRow>(sql: string, params: unknown[] = []) {
    return await this.config.query<T>(sql, params);
  }

  private async insert<T extends DbRow>(table: string, row: DbRow) {
    const compact = compactRow(row);
    const columns = Object.keys(compact);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const sql = `insert into ${table} (${columns.join(", ")}) values (${placeholders.join(", ")}) returning *`;

    return await this.query<T>(sql, Object.values(compact));
  }

  private async update<T extends DbRow>(table: string, row: DbRow, keyColumn: string, keyValue: unknown) {
    const compact = compactRow(row);
    delete compact[keyColumn];

    const columns = Object.keys(compact);
    if (columns.length === 0) {
      return await this.query<T>(`select * from ${table} where ${keyColumn} = $1 limit 1`, [keyValue]);
    }

    const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
    const sql = `update ${table} set ${assignments.join(", ")} where ${keyColumn} = $1 returning *`;

    return await this.query<T>(sql, [keyValue, ...Object.values(compact)]);
  }

  private async upsert<T extends DbRow>(table: string, row: DbRow, conflictColumns: string[]) {
    const compact = compactRow(row);
    const columns = Object.keys(compact);
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    const updates = columns
      .filter((column) => !conflictColumns.includes(column))
      .map((column) => `${column} = excluded.${column}`);
    const sql = [
      `insert into ${table} (${columns.join(", ")}) values (${placeholders.join(", ")})`,
      `on conflict (${conflictColumns.join(", ")}) do update set ${updates.join(", ")}`,
      "returning *"
    ].join(" ");

    return await this.query<T>(sql, Object.values(compact));
  }

  private employeeFromRow(row: EmployeeRow): Employee {
    return {
      id: stringValue(row.id),
      name: stringValue(row.name),
      role: row.role,
      department: row.department,
      hireDate: dateValue(row.hire_date),
      employeeNumber: optionalString(row.employee_number),
      position: optionalString(row.position),
      employmentStatus: optionalString(row.employment_status) as Employee["employmentStatus"],
      employmentType: optionalString(row.employment_type) as Employee["employmentType"],
      terminationDate: optionalDateValue(row.termination_date),
      residentRegistrationNumber: this.config.decodeSensitiveText?.("resident_registration_number_enc", row.resident_registration_number_enc),
      birthday: optionalDateValue(row.birthday),
      address: this.config.decodeSensitiveText?.("address_enc", row.address_enc),
      mobile: this.config.decodeSensitiveText?.("mobile_enc", row.mobile_enc),
      emergencyContact: this.config.decodeSensitiveText?.("emergency_contact_enc", row.emergency_contact_enc),
      familyRelations: this.config.decodeSensitiveText?.("family_relations_enc", row.family_relations_enc),
      payrollBank: optionalString(row.payroll_bank),
      payrollAccount: this.config.decodeSensitiveText?.("payroll_account_enc", row.payroll_account_enc),
      annualSalary: optionalNumber(row.annual_salary),
      severancePay: optionalNumber(row.severance_pay),
      incomeDeductionDependents: optionalNumber(row.income_deduction_dependents),
      annualLeaveAdjustmentDays: optionalNumber(row.annual_leave_adjustment_days),
      annualLeaveAdjustmentYear: optionalNumber(row.annual_leave_adjustment_year),
      customAdminFields: row.custom_admin_fields as EmployeeCustomAdminFields | undefined,
      approverId: optionalString(row.approver_id),
      workplaceId: optionalString(row.workplace_id),
      workStartTime: optionalTimeValue(row.work_start_time),
      workEndTime: optionalTimeValue(row.work_end_time),
      pilot: Boolean(row.pilot)
    };
  }
}

type EmployeeRow = DbRow & {
  role: Employee["role"];
  department: Employee["department"];
  custom_admin_fields?: EmployeeCustomAdminFields | null;
};
type AuthAccountRow = DbRow;
type WorkplaceRow = DbRow;
type AttendanceRow = DbRow & { status: AttendanceRecord["status"] };
type VerificationRow = DbRow & { method: VerificationAttempt["method"]; status: VerificationAttempt["status"] };
type LeaveRequestRow = DbRow & { type: LeaveRequest["type"]; status: LeaveRequest["status"] };
type LeaveBalanceAdjustmentRow = DbRow;
type EarlyLeaveRow = DbRow & { status: EarlyLeaveLedger["status"] };
type OvertimeRow = DbRow & { status: OvertimeRequest["status"] };
type CorrectionRow = DbRow & { type: AttendanceCorrection["type"] };
type CorrectionRequestRow = DbRow & { type: AttendanceCorrectionRequest["type"]; status: AttendanceCorrectionRequest["status"] };
type PayrollRow = DbRow;
type DailyWorkTaskRow = DbRow & { status: DailyWorkTask["status"]; department: DailyWorkTask["department"] };
type SystemPolicyRow = DbRow & {
  gps_failure_fallback: SystemPolicy["gpsFailureFallback"];
  payroll_employee_access: SystemPolicy["payrollEmployeeAccess"];
  payroll_delete_mode: SystemPolicy["payrollDeleteMode"];
  overtime_pay_approver_role: SystemPolicy["overtimePayApproverRole"];
  advance_leave_exception_handling: SystemPolicy["advanceLeaveExceptionHandling"];
  work_days: SystemPolicy["workDays"];
  payroll_holiday_dates: SystemPolicy["payrollHolidayDates"];
};
type AuditLogRow = DbRow;

function employeeToRow(employee: Employee, config: PostgresRepositoryConfig): DbRow {
  return {
    id: employee.id,
    name: employee.name,
    role: employee.role,
    department: employee.department,
    hire_date: employee.hireDate,
    employee_number: employee.employeeNumber,
    position: employee.position,
    employment_status: employee.employmentStatus ?? "ACTIVE",
    employment_type: employee.employmentType ?? "REGULAR",
    termination_date: employee.terminationDate ?? null,
    resident_registration_number_enc: config.encodeSensitiveText?.("resident_registration_number_enc", employee.residentRegistrationNumber) ?? null,
    birthday: employee.birthday ?? null,
    address_enc: config.encodeSensitiveText?.("address_enc", employee.address) ?? null,
    mobile_enc: config.encodeSensitiveText?.("mobile_enc", employee.mobile) ?? null,
    emergency_contact_enc: config.encodeSensitiveText?.("emergency_contact_enc", employee.emergencyContact) ?? null,
    family_relations_enc: config.encodeSensitiveText?.("family_relations_enc", employee.familyRelations) ?? null,
    payroll_bank: employee.payrollBank ?? null,
    payroll_account_enc: config.encodeSensitiveText?.("payroll_account_enc", employee.payrollAccount) ?? null,
    annual_salary: employee.annualSalary ?? null,
    severance_pay: employee.severancePay ?? null,
    income_deduction_dependents: employee.incomeDeductionDependents ?? null,
    annual_leave_adjustment_days: employee.annualLeaveAdjustmentDays ?? 0,
    annual_leave_adjustment_year: employee.annualLeaveAdjustmentYear ?? null,
    // jsonb columns must be bound as JSON text: both pg and the Neon driver
    // serialize raw JS arrays as Postgres array literals, which jsonb rejects.
    custom_admin_fields: JSON.stringify(employee.customAdminFields ?? []),
    approver_id: employee.approverId ?? null,
    workplace_id: employee.workplaceId ?? null,
    work_start_time: employee.workStartTime ?? null,
    work_end_time: employee.workEndTime ?? null,
    pilot: employee.pilot
  };
}

function employeeAccountFromRow(row: AuthAccountRow): EmployeeAuthAccount {
  return {
    id: stringValue(row.id),
    employeeId: stringValue(row.employee_id),
    employeeNumber: stringValue(row.employee_number),
    loginId: stringValue(row.login_id),
    passwordHash: stringValue(row.password_hash),
    passwordChangedAt: stringValue(row.password_changed_at),
    passwordChangeRequired: Boolean(row.password_change_required),
    failedSignInCount: Number(row.failed_sign_in_count),
    lockedUntil: optionalString(row.locked_until),
    lastSignedInAt: optionalString(row.last_signed_in_at),
    disabledAt: optionalString(row.disabled_at)
  };
}

function employeeAccountToRow(account: EmployeeAuthAccount): DbRow {
  return {
    id: account.id,
    employee_id: account.employeeId,
    employee_number: account.employeeNumber,
    login_id: account.loginId,
    password_hash: account.passwordHash,
    password_changed_at: account.passwordChangedAt,
    password_change_required: account.passwordChangeRequired,
    failed_sign_in_count: account.failedSignInCount,
    locked_until: account.lockedUntil ?? null,
    last_signed_in_at: account.lastSignedInAt ?? null,
    disabled_at: account.disabledAt ?? null
  };
}

function workplaceFromRow(row: WorkplaceRow): Workplace {
  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    allowedRadiusMeters: Number(row.allowed_radius_meters),
    qrPath: stringValue(row.qr_path)
  };
}

function workplaceToRow(workplace: Workplace): DbRow {
  return {
    id: workplace.id,
    name: workplace.name,
    latitude: workplace.latitude,
    longitude: workplace.longitude,
    allowed_radius_meters: workplace.allowedRadiusMeters,
    qr_path: workplace.qrPath
  };
}

function attendanceFromRow(row: AttendanceRow): AttendanceRecord {
  return {
    id: stringValue(row.id),
    employeeId: stringValue(row.employee_id),
    date: dateValue(row.work_date),
    clockInAt: optionalString(row.clock_in_at),
    clockOutAt: optionalString(row.clock_out_at),
    status: row.status,
    verificationId: stringValue(row.verification_id),
    earlyLeaveMinutes: Number(row.early_leave_minutes),
    recognizedWorkMinutes: optionalNumber(row.recognized_work_minutes) ?? Number(row.early_leave_minutes),
    workStatus: (optionalString(row.work_status) as AttendanceRecord["workStatus"]) ?? "NORMAL",
    lateMinutes: optionalNumber(row.late_minutes) ?? 0,
    reviewStatus: (optionalString(row.review_status) as AttendanceRecord["reviewStatus"]) ?? "NOT_REQUIRED",
    reviewedById: optionalString(row.reviewed_by_id),
    reviewedAt: optionalString(row.reviewed_at),
    reviewNote: optionalString(row.review_note)
  };
}

function attendanceToRow(record: AttendanceRecord): DbRow {
  return {
    id: record.id,
    employee_id: record.employeeId,
    work_date: record.date,
    clock_in_at: record.clockInAt,
    clock_out_at: record.clockOutAt,
    status: record.status,
    verification_id: record.verificationId,
    early_leave_minutes: record.earlyLeaveMinutes,
    recognized_work_minutes: record.recognizedWorkMinutes ?? record.earlyLeaveMinutes,
    work_status: record.workStatus ?? "NORMAL",
    late_minutes: record.lateMinutes ?? 0,
    review_status: record.reviewStatus ?? "NOT_REQUIRED",
    reviewed_by_id: record.reviewedById ?? null,
    reviewed_at: record.reviewedAt ?? null,
    review_note: record.reviewNote ?? null
  };
}

function verificationFromRow(row: VerificationRow): VerificationAttempt {
  return {
    id: stringValue(row.id),
    employeeId: stringValue(row.employee_id),
    workplaceId: optionalString(row.workplace_id),
    method: row.method,
    status: row.status,
    attemptedAt: stringValue(row.attempted_at),
    distanceMeters: optionalNumber(row.distance_meters),
    accuracyMeters: optionalNumber(row.accuracy_meters),
    note: optionalString(row.note)
  };
}

function verificationToRow(attempt: VerificationAttempt): DbRow {
  return {
    id: attempt.id,
    employee_id: attempt.employeeId,
    workplace_id: attempt.workplaceId,
    method: attempt.method,
    status: attempt.status,
    attempted_at: attempt.attemptedAt,
    distance_meters: attempt.distanceMeters,
    accuracy_meters: attempt.accuracyMeters,
    note: attempt.note
  };
}

function leaveRequestFromRow(row: LeaveRequestRow): LeaveRequest {
  return {
    id: stringValue(row.id),
    employeeId: stringValue(row.employee_id),
    type: row.type,
    startsOn: dateValue(row.starts_on),
    endsOn: dateValue(row.ends_on),
    days: Number(row.days),
    reason: stringValue(row.reason),
    status: row.status,
    decidedBy: optionalString(row.decided_by),
    decidedAt: optionalString(row.decided_at)
  };
}

function leaveRequestToRow(request: LeaveRequest): DbRow {
  return {
    id: request.id,
    employee_id: request.employeeId,
    type: request.type,
    starts_on: request.startsOn,
    ends_on: request.endsOn,
    days: request.days,
    reason: request.reason,
    status: request.status,
    decided_by: request.decidedBy,
    decided_at: request.decidedAt
  };
}

function leaveBalanceAdjustmentFromRow(row: LeaveBalanceAdjustmentRow): LeaveBalanceAdjustment {
  return {
    id: stringValue(row.id),
    employeeId: stringValue(row.employee_id),
    days: Number(row.days),
    reason: stringValue(row.reason),
    createdBy: stringValue(row.created_by),
    createdAt: stringValue(row.created_at),
    year: optionalNumber(row.leave_year)
  };
}

function leaveBalanceAdjustmentToRow(adjustment: LeaveBalanceAdjustment): DbRow {
  return {
    id: adjustment.id,
    employee_id: adjustment.employeeId,
    days: adjustment.days,
    reason: adjustment.reason,
    created_by: adjustment.createdBy,
    created_at: adjustment.createdAt,
    leave_year: adjustment.year ?? null
  };
}

function earlyLeaveFromRow(row: EarlyLeaveRow): EarlyLeaveLedger {
  return {
    id: stringValue(row.id),
    employeeId: stringValue(row.employee_id),
    date: dateValue(row.work_date),
    minutes: Number(row.minutes),
    status: row.status,
    reason: optionalString(row.reason)
  };
}

function earlyLeaveToRow(entry: EarlyLeaveLedger): DbRow {
  return {
    id: entry.id,
    employee_id: entry.employeeId,
    work_date: entry.date,
    minutes: entry.minutes,
    status: entry.status,
    reason: entry.reason
  };
}

function overtimeFromRow(row: OvertimeRow): OvertimeRequest {
  return {
    id: stringValue(row.id),
    employeeId: stringValue(row.employee_id),
    date: dateValue(row.work_date),
    startsAt: stringValue(row.starts_at),
    endsAt: stringValue(row.ends_at),
    minutes: Number(row.minutes),
    reason: stringValue(row.reason),
    status: row.status,
    payApproved: Boolean(row.pay_approved),
    decidedBy: optionalString(row.decided_by),
    decidedAt: optionalString(row.decided_at)
  };
}

function overtimeToRow(request: OvertimeRequest): DbRow {
  return {
    id: request.id,
    employee_id: request.employeeId,
    work_date: request.date,
    starts_at: request.startsAt,
    ends_at: request.endsAt,
    minutes: request.minutes,
    reason: request.reason,
    status: request.status,
    pay_approved: request.payApproved,
    decided_by: request.decidedBy,
    decided_at: request.decidedAt
  };
}

function correctionFromRow(row: CorrectionRow): AttendanceCorrection {
  return {
    id: stringValue(row.id),
    attendanceId: stringValue(row.attendance_id),
    employeeId: stringValue(row.employee_id),
    correctedById: stringValue(row.corrected_by_id),
    type: row.type,
    beforeValue: optionalString(row.before_value),
    afterValue: stringValue(row.after_value),
    reason: stringValue(row.reason),
    createdAt: stringValue(row.created_at)
  };
}

function correctionToRow(correction: AttendanceCorrection): DbRow {
  return {
    id: correction.id,
    attendance_id: correction.attendanceId,
    employee_id: correction.employeeId,
    corrected_by_id: correction.correctedById,
    type: correction.type,
    before_value: correction.beforeValue,
    after_value: correction.afterValue,
    reason: correction.reason,
    created_at: correction.createdAt
  };
}

function correctionRequestFromRow(row: CorrectionRequestRow): AttendanceCorrectionRequest {
  return {
    id: stringValue(row.id),
    attendanceId: optionalString(row.attendance_id),
    employeeId: stringValue(row.employee_id),
    type: row.type,
    beforeValue: optionalString(row.before_value),
    requestedValue: stringValue(row.requested_value),
    reason: stringValue(row.reason),
    status: row.status,
    decidedBy: optionalString(row.decided_by),
    decidedAt: optionalString(row.decided_at),
    createdAt: stringValue(row.created_at)
  };
}

function correctionRequestToRow(request: AttendanceCorrectionRequest): DbRow {
  return {
    id: request.id,
    attendance_id: request.attendanceId ?? null,
    employee_id: request.employeeId,
    type: request.type,
    before_value: request.beforeValue ?? null,
    requested_value: request.requestedValue,
    reason: request.reason,
    status: request.status,
    decided_by: request.decidedBy ?? null,
    decided_at: request.decidedAt ?? null,
    created_at: request.createdAt
  };
}

function payrollFromRow(row: PayrollRow): PayrollStatement {
  return {
    id: stringValue(row.id),
    employeeId: stringValue(row.employee_id),
    month: stringValue(row.payroll_month),
    filename: stringValue(row.filename),
    storageBucket: optionalString(row.storage_bucket),
    storagePath: optionalString(row.storage_path),
    uploadedBy: optionalString(row.uploaded_by),
    uploadedAt: stringValue(row.uploaded_at),
    deletedBy: optionalString(row.deleted_by),
    deletedAt: optionalString(row.deleted_at),
    deleteReason: optionalString(row.delete_reason)
  };
}

function payrollToRow(statement: PayrollStatement): DbRow {
  return {
    id: statement.id,
    employee_id: statement.employeeId,
    payroll_month: statement.month,
    filename: statement.filename,
    storage_bucket: statement.storageBucket,
    storage_path: statement.storagePath,
    uploaded_by: statement.uploadedBy,
    uploaded_at: statement.uploadedAt,
    deleted_by: statement.deletedBy,
    deleted_at: statement.deletedAt,
    delete_reason: statement.deleteReason
  };
}

function dailyWorkTaskFromRow(row: DailyWorkTaskRow): DailyWorkTask {
  return {
    id: stringValue(row.id),
    employeeId: stringValue(row.employee_id),
    department: row.department,
    date: dateValue(row.work_date),
    title: stringValue(row.title),
    dueLabel: optionalString(row.due_label),
    displayOrder: Number(row.display_order),
    status: row.status,
    completedAt: optionalString(row.completed_at)
  };
}

function dailyWorkTaskToRow(task: DailyWorkTask): DbRow {
  return {
    id: task.id,
    employee_id: task.employeeId,
    department: task.department,
    work_date: task.date,
    title: task.title,
    due_label: task.dueLabel,
    display_order: task.displayOrder,
    status: task.status,
    completed_at: task.completedAt ?? null
  };
}

function policyFromRow(row: SystemPolicyRow): SystemPolicy {
  return {
    gpsAllowedRadiusMeters: Number(row.gps_allowed_radius_meters),
    timezone: "Asia/Seoul",
    workStartTime: normalizeTimeValue(row.work_start_time, defaultSystemPolicy.workStartTime),
    workEndTime: normalizeTimeValue(row.work_end_time, defaultSystemPolicy.workEndTime),
    breakStartTime: normalizeTimeValue(row.break_start_time, defaultSystemPolicy.breakStartTime),
    breakEndTime: normalizeTimeValue(row.break_end_time, defaultSystemPolicy.breakEndTime),
    workDays: Array.isArray(row.work_days) ? row.work_days : defaultSystemPolicy.workDays,
    payrollHolidayDates: Array.isArray(row.payroll_holiday_dates)
      ? row.payroll_holiday_dates.filter((value): value is string => typeof value === "string")
      : defaultSystemPolicy.payrollHolidayDates,
    annualLeaveAutoAccrual: row.annual_leave_auto_accrual === undefined ? defaultSystemPolicy.annualLeaveAutoAccrual : Boolean(row.annual_leave_auto_accrual),
    annualLeaveUnit: Number(row.annual_leave_unit) === 1 ? 1 : 0.5,
    partialLeaveAllowed: row.partial_leave_allowed === undefined ? defaultSystemPolicy.partialLeaveAllowed : Boolean(row.partial_leave_allowed),
    annualLeaveOveruseAllowed: Boolean(row.annual_leave_overuse_allowed),
    gpsFailureFallback: row.gps_failure_fallback,
    payrollEmployeeAccess: row.payroll_employee_access,
    payrollDeleteMode: row.payroll_delete_mode,
    overtimePayApproverRole: row.overtime_pay_approver_role,
    advanceLeaveExceptionHandling: row.advance_leave_exception_handling
  };
}

function policyToRow(settings: Partial<SystemPolicy>): DbRow {
  return {
    gps_allowed_radius_meters: settings.gpsAllowedRadiusMeters,
    timezone: settings.timezone,
    work_start_time: settings.workStartTime,
    work_end_time: settings.workEndTime,
    break_start_time: settings.breakStartTime,
    break_end_time: settings.breakEndTime,
    // jsonb columns: keep undefined so partial updates skip them, else bind JSON text.
    work_days: settings.workDays === undefined ? undefined : JSON.stringify(settings.workDays),
    payroll_holiday_dates: settings.payrollHolidayDates === undefined ? undefined : JSON.stringify(settings.payrollHolidayDates),
    annual_leave_auto_accrual: settings.annualLeaveAutoAccrual,
    annual_leave_unit: settings.annualLeaveUnit,
    partial_leave_allowed: settings.partialLeaveAllowed,
    annual_leave_overuse_allowed: settings.annualLeaveOveruseAllowed,
    gps_failure_fallback: settings.gpsFailureFallback,
    payroll_employee_access: settings.payrollEmployeeAccess,
    payroll_delete_mode: settings.payrollDeleteMode,
    overtime_pay_approver_role: settings.overtimePayApproverRole,
    advance_leave_exception_handling: settings.advanceLeaveExceptionHandling
  };
}

function normalizeTimeValue(value: unknown, fallback: string) {
  const text = optionalString(value);
  return text ? text.slice(0, 5) : fallback;
}

function auditLogFromRow(row: AuditLogRow): AuditLog {
  return {
    id: stringValue(row.id),
    actorId: stringValue(row.actor_employee_id),
    action: stringValue(row.action),
    targetType: stringValue(row.target_type),
    targetId: stringValue(row.target_id),
    createdAt: stringValue(row.created_at),
    detail: stringValue(row.detail)
  };
}

function auditLogToRow(log: AuditLog): DbRow {
  return {
    id: log.id,
    actor_employee_id: log.actorId,
    action: log.action,
    target_type: log.targetType,
    target_id: log.targetId,
    created_at: log.createdAt,
    detail: log.detail
  };
}

function compactRow(row: DbRow) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

function requireRow<T>(row: T | undefined, table: string, id: unknown): T {
  if (!row) {
    throw new Error(`Postgres row not found in ${table}: ${String(id)}`);
  }

  return row;
}

function stringValue(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function optionalString(value: unknown) {
  return value === null || value === undefined ? undefined : stringValue(value);
}

function dateValue(value: unknown) {
  return stringValue(value).slice(0, 10);
}

function optionalDateValue(value: unknown) {
  return value === null || value === undefined ? undefined : dateValue(value);
}

function optionalNumber(value: unknown) {
  return value === null || value === undefined ? undefined : Number(value);
}

function optionalTimeValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  return String(value).slice(0, 5);
}
