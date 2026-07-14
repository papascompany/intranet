import type {
  AttendanceCorrection,
  AttendanceRecord,
  AuditLog,
  DailyWorkTask,
  EarlyLeaveLedger,
  Employee,
  EmployeeCustomAdminFields,
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
      hireDate: stringValue(row.hire_date),
      employeeNumber: optionalString(row.employee_number),
      position: optionalString(row.position),
      residentRegistrationNumber: this.config.decodeSensitiveText?.("resident_registration_number_enc", row.resident_registration_number_enc),
      birthday: optionalString(row.birthday),
      address: this.config.decodeSensitiveText?.("address_enc", row.address_enc),
      mobile: this.config.decodeSensitiveText?.("mobile_enc", row.mobile_enc),
      emergencyContact: this.config.decodeSensitiveText?.("emergency_contact_enc", row.emergency_contact_enc),
      familyRelations: this.config.decodeSensitiveText?.("family_relations_enc", row.family_relations_enc),
      payrollBank: optionalString(row.payroll_bank),
      payrollAccount: this.config.decodeSensitiveText?.("payroll_account_enc", row.payroll_account_enc),
      annualSalary: optionalNumber(row.annual_salary),
      severancePay: optionalNumber(row.severance_pay),
      incomeDeductionDependents: optionalNumber(row.income_deduction_dependents),
      customAdminFields: row.custom_admin_fields as EmployeeCustomAdminFields | undefined,
      approverId: optionalString(row.approver_id),
      workplaceId: optionalString(row.workplace_id),
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
type EarlyLeaveRow = DbRow & { status: EarlyLeaveLedger["status"] };
type OvertimeRow = DbRow & { status: OvertimeRequest["status"] };
type CorrectionRow = DbRow & { type: AttendanceCorrection["type"] };
type PayrollRow = DbRow;
type DailyWorkTaskRow = DbRow & { status: DailyWorkTask["status"]; department: DailyWorkTask["department"] };
type SystemPolicyRow = DbRow & {
  gps_failure_fallback: SystemPolicy["gpsFailureFallback"];
  payroll_employee_access: SystemPolicy["payrollEmployeeAccess"];
  payroll_delete_mode: SystemPolicy["payrollDeleteMode"];
  overtime_pay_approver_role: SystemPolicy["overtimePayApproverRole"];
  advance_leave_exception_handling: SystemPolicy["advanceLeaveExceptionHandling"];
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
    resident_registration_number_enc: config.encodeSensitiveText?.("resident_registration_number_enc", employee.residentRegistrationNumber),
    birthday: employee.birthday,
    address_enc: config.encodeSensitiveText?.("address_enc", employee.address),
    mobile_enc: config.encodeSensitiveText?.("mobile_enc", employee.mobile),
    emergency_contact_enc: config.encodeSensitiveText?.("emergency_contact_enc", employee.emergencyContact),
    family_relations_enc: config.encodeSensitiveText?.("family_relations_enc", employee.familyRelations),
    payroll_bank: employee.payrollBank,
    payroll_account_enc: config.encodeSensitiveText?.("payroll_account_enc", employee.payrollAccount),
    annual_salary: employee.annualSalary,
    severance_pay: employee.severancePay,
    income_deduction_dependents: employee.incomeDeductionDependents,
    custom_admin_fields: employee.customAdminFields,
    approver_id: employee.approverId,
    workplace_id: employee.workplaceId ?? null,
    pilot: employee.pilot
  };
}

function employeeAccountFromRow(row: AuthAccountRow): EmployeeAuthAccount {
  return {
    id: stringValue(row.id),
    employeeId: stringValue(row.employee_id),
    employeeNumber: stringValue(row.employee_number),
    passwordHash: stringValue(row.password_hash),
    passwordChangedAt: stringValue(row.password_changed_at),
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
    password_hash: account.passwordHash,
    password_changed_at: account.passwordChangedAt,
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

function attendanceFromRow(row: AttendanceRow): AttendanceRecord {
  return {
    id: stringValue(row.id),
    employeeId: stringValue(row.employee_id),
    date: stringValue(row.work_date),
    clockInAt: optionalString(row.clock_in_at),
    clockOutAt: optionalString(row.clock_out_at),
    status: row.status,
    verificationId: stringValue(row.verification_id),
    earlyLeaveMinutes: Number(row.early_leave_minutes)
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
    early_leave_minutes: record.earlyLeaveMinutes
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
    startsOn: stringValue(row.starts_on),
    endsOn: stringValue(row.ends_on),
    days: Number(row.days),
    reason: stringValue(row.reason),
    status: row.status
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
    status: request.status
  };
}

function earlyLeaveFromRow(row: EarlyLeaveRow): EarlyLeaveLedger {
  return {
    id: stringValue(row.id),
    employeeId: stringValue(row.employee_id),
    date: stringValue(row.work_date),
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
    date: stringValue(row.work_date),
    startsAt: stringValue(row.starts_at),
    endsAt: stringValue(row.ends_at),
    minutes: Number(row.minutes),
    reason: stringValue(row.reason),
    status: row.status,
    payApproved: Boolean(row.pay_approved)
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
    pay_approved: request.payApproved
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
    date: stringValue(row.work_date),
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
    gps_failure_fallback: settings.gpsFailureFallback,
    payroll_employee_access: settings.payrollEmployeeAccess,
    payroll_delete_mode: settings.payrollDeleteMode,
    overtime_pay_approver_role: settings.overtimePayApproverRole,
    advance_leave_exception_handling: settings.advanceLeaveExceptionHandling
  };
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

function optionalNumber(value: unknown) {
  return value === null || value === undefined ? undefined : Number(value);
}
