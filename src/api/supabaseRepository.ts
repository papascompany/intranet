import type {
  AttendanceCorrection,
  AttendanceRecord,
  AuditLog,
  EarlyLeaveLedger,
  Employee,
  EmployeeCustomAdminFields,
  LeaveRequest,
  OvertimeRequest,
  PayrollStatement,
  VerificationAttempt,
  Workplace
} from "../domain/types";
import type { HrRepository } from "./hrRepository";
import { defaultSystemPolicy, type SystemPolicy } from "./types";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type SupabaseRepositoryConfig = {
  url: string;
  anonKey?: string;
  serviceRoleKey?: string;
  accessToken?: string;
  fetch?: FetchLike;
  decodeSensitiveText?: (column: string, value: unknown) => string | undefined;
  encodeSensitiveText?: (column: string, value: string | undefined) => unknown;
};

type EmployeeRow = {
  id: string;
  name: string;
  role: Employee["role"];
  department: Employee["department"];
  hire_date: string;
  employee_number?: string | null;
  position?: string | null;
  resident_registration_number_enc?: unknown;
  birthday?: string | null;
  address_enc?: unknown;
  mobile_enc?: unknown;
  emergency_contact_enc?: unknown;
  family_relations_enc?: unknown;
  payroll_bank?: string | null;
  payroll_account_enc?: unknown;
  annual_salary?: number | string | null;
  severance_pay?: number | string | null;
  income_deduction_dependents?: number | null;
  custom_admin_fields?: EmployeeCustomAdminFields | null;
  approver_id?: string | null;
  pilot: boolean;
};

type WorkplaceRow = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  allowed_radius_meters: number;
  qr_path: string;
};

type AttendanceRow = {
  id: string;
  employee_id: string;
  work_date: string;
  clock_in_at?: string | null;
  clock_out_at?: string | null;
  status: AttendanceRecord["status"];
  verification_id: string;
  early_leave_minutes: number;
};

type VerificationRow = {
  id: string;
  employee_id: string;
  workplace_id?: string | null;
  method: VerificationAttempt["method"];
  status: VerificationAttempt["status"];
  attempted_at: string;
  distance_meters?: number | null;
  accuracy_meters?: number | null;
  note?: string | null;
};

type LeaveRequestRow = {
  id: string;
  employee_id: string;
  type: LeaveRequest["type"];
  starts_on: string;
  ends_on: string;
  days: number | string;
  reason: string;
  status: LeaveRequest["status"];
};

type EarlyLeaveRow = {
  id: string;
  employee_id: string;
  work_date: string;
  minutes: number;
  status: EarlyLeaveLedger["status"];
  reason?: string | null;
};

type OvertimeRow = {
  id: string;
  employee_id: string;
  work_date: string;
  starts_at: string;
  ends_at: string;
  minutes: number;
  reason: string;
  status: OvertimeRequest["status"];
  pay_approved: boolean;
};

type CorrectionRow = {
  id: string;
  attendance_id: string;
  employee_id: string;
  corrected_by_id: string;
  type: AttendanceCorrection["type"];
  before_value?: string | null;
  after_value: string;
  reason: string;
  created_at: string;
};

type PayrollRow = {
  id: string;
  employee_id: string;
  payroll_month: string;
  filename: string;
  storage_bucket?: string | null;
  storage_path?: string | null;
  uploaded_by?: string | null;
  uploaded_at: string;
  deleted_by?: string | null;
  deleted_at?: string | null;
  delete_reason?: string | null;
};

type SystemPolicyRow = {
  id: string;
  gps_allowed_radius_meters: number;
  gps_failure_fallback: SystemPolicy["gpsFailureFallback"];
  payroll_employee_access: SystemPolicy["payrollEmployeeAccess"];
  payroll_delete_mode: SystemPolicy["payrollDeleteMode"];
  overtime_pay_approver_role: SystemPolicy["overtimePayApproverRole"];
  advance_leave_exception_handling: SystemPolicy["advanceLeaveExceptionHandling"];
};

type AuditLogRow = {
  id: string;
  actor_employee_id: string;
  action: string;
  target_type: string;
  target_id: string;
  created_at: string;
  detail: string;
};

export class SupabaseHrRepository implements HrRepository {
  private readonly fetcher: FetchLike;
  private readonly restBaseUrl: string;

  constructor(private readonly config: SupabaseRepositoryConfig) {
    this.fetcher = config.fetch ?? fetch.bind(globalThis);
    this.restBaseUrl = `${config.url.replace(/\/$/, "")}/rest/v1`;
  }

  async listEmployees() {
    const rows = await this.select<EmployeeRow>("employees", {
      order: "department.asc,name.asc"
    });
    return rows.map((row) => this.employeeFromRow(row));
  }

  async updateEmployee(employee: Employee) {
    const [row] = await this.patch<EmployeeRow>("employees", `id=eq.${encodeFilterValue(employee.id)}`, employeeToRow(employee, this.config), {
      single: true
    });
    return this.employeeFromRow(row);
  }

  async listWorkplaces() {
    const rows = await this.select<WorkplaceRow>("workplaces", {
      order: "name.asc"
    });
    return rows.map(workplaceFromRow);
  }

  async listAttendanceRecords() {
    const rows = await this.select<AttendanceRow>("attendance_records", {
      order: "work_date.desc"
    });
    return rows.map(attendanceFromRow);
  }

  async findAttendanceByEmployeeDate(employeeId: string, date: string) {
    const rows = await this.select<AttendanceRow>("attendance_records", {
      employee_id: `eq.${employeeId}`,
      work_date: `eq.${date}`,
      limit: "1"
    });
    return rows[0] ? attendanceFromRow(rows[0]) : undefined;
  }

  async upsertAttendanceRecord(record: AttendanceRecord) {
    const [row] = await this.upsert<AttendanceRow>("attendance_records", attendanceToRow(record), "id");
    return attendanceFromRow(row);
  }

  async addVerificationAttempt(attempt: VerificationAttempt) {
    const [row] = await this.insert<VerificationRow>("verification_attempts", verificationToRow(attempt));
    return verificationFromRow(row);
  }

  async listLeaveRequests() {
    const rows = await this.select<LeaveRequestRow>("leave_requests", {
      order: "created_at.desc"
    });
    return rows.map(leaveRequestFromRow);
  }

  async addLeaveRequest(request: LeaveRequest) {
    const [row] = await this.insert<LeaveRequestRow>("leave_requests", leaveRequestToRow(request));
    return leaveRequestFromRow(row);
  }

  async updateLeaveRequest(request: LeaveRequest) {
    const [row] = await this.patch<LeaveRequestRow>("leave_requests", `id=eq.${encodeFilterValue(request.id)}`, leaveRequestToRow(request), {
      single: true
    });
    return leaveRequestFromRow(row);
  }

  async listEarlyLeaveLedger() {
    const rows = await this.select<EarlyLeaveRow>("early_leave_ledger", {
      order: "work_date.desc"
    });
    return rows.map(earlyLeaveFromRow);
  }

  async upsertEarlyLeaveLedger(entry: EarlyLeaveLedger) {
    const [row] = await this.upsert<EarlyLeaveRow>("early_leave_ledger", earlyLeaveToRow(entry), "id");
    return earlyLeaveFromRow(row);
  }

  async listOvertimeRequests() {
    const rows = await this.select<OvertimeRow>("overtime_requests", {
      order: "created_at.desc"
    });
    return rows.map(overtimeFromRow);
  }

  async addOvertimeRequest(request: OvertimeRequest) {
    const [row] = await this.insert<OvertimeRow>("overtime_requests", overtimeToRow(request));
    return overtimeFromRow(row);
  }

  async updateOvertimeRequest(request: OvertimeRequest) {
    const [row] = await this.patch<OvertimeRow>("overtime_requests", `id=eq.${encodeFilterValue(request.id)}`, overtimeToRow(request), {
      single: true
    });
    return overtimeFromRow(row);
  }

  async listCorrections() {
    const rows = await this.select<CorrectionRow>("attendance_corrections", {
      order: "created_at.desc"
    });
    return rows.map(correctionFromRow);
  }

  async addCorrection(correction: AttendanceCorrection) {
    const [row] = await this.insert<CorrectionRow>("attendance_corrections", correctionToRow(correction));
    return correctionFromRow(row);
  }

  async listPayrollStatements(includeDeleted = false) {
    const filters: Record<string, string> = {
      order: "payroll_month.desc,uploaded_at.desc"
    };
    if (!includeDeleted) {
      filters.deleted_at = "is.null";
    }

    const rows = await this.select<PayrollRow>("payroll_statements", filters);
    return rows.map(payrollFromRow);
  }

  async addPayrollStatement(statement: PayrollStatement) {
    const [row] = await this.insert<PayrollRow>("payroll_statements", payrollToRow(statement));
    return payrollFromRow(row);
  }

  async updatePayrollStatement(statement: PayrollStatement) {
    const [row] = await this.patch<PayrollRow>("payroll_statements", `id=eq.${encodeFilterValue(statement.id)}`, payrollToRow(statement), {
      single: true
    });
    return payrollFromRow(row);
  }

  async getSettings() {
    const rows = await this.select<SystemPolicyRow>("system_policies", {
      id: "eq.system-policy",
      limit: "1"
    });
    return rows[0] ? policyFromRow(rows[0]) : defaultSystemPolicy;
  }

  async updateSettings(settings: Partial<SystemPolicy>) {
    const [row] = await this.patch<SystemPolicyRow>(
      "system_policies",
      "id=eq.system-policy",
      policyToRow(settings),
      { single: true }
    );
    return policyFromRow(row);
  }

  async listAuditLogs() {
    const rows = await this.select<AuditLogRow>("audit_logs", {
      order: "created_at.desc"
    });
    return rows.map(auditLogFromRow);
  }

  async addAuditLog(log: AuditLog) {
    const [row] = await this.insert<AuditLogRow>("audit_logs", auditLogToRow(log));
    return auditLogFromRow(row);
  }

  async nextId(prefix: string) {
    const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 14);
    return `${prefix}-${random}`;
  }

  private async select<T>(table: string, filters: Record<string, string> = {}) {
    return await this.request<T[]>("GET", table, filters);
  }

  private async insert<T>(table: string, body: unknown) {
    return await this.request<T[]>("POST", table, {}, body);
  }

  private async upsert<T>(table: string, body: unknown, onConflict: string) {
    return await this.request<T[]>("POST", table, { on_conflict: onConflict }, body, "resolution=merge-duplicates");
  }

  private async patch<T>(table: string, filter: string, body: unknown, options: { single?: boolean } = {}) {
    const [key, value] = filter.split("=");
    const rows = await this.request<T[]>("PATCH", table, { [key]: value }, body);
    if (options.single && rows.length === 0) {
      throw new Error(`Supabase row not found in ${table}: ${filter}`);
    }

    return rows;
  }

  private async request<T>(
    method: "GET" | "PATCH" | "POST",
    table: string,
    query: Record<string, string>,
    body?: unknown,
    preferExtra?: string
  ) {
    const url = new URL(`${this.restBaseUrl}/${table}`);
    url.searchParams.set("select", "*");
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

    const key = this.config.serviceRoleKey ?? this.config.anonKey;
    if (!key) {
      throw new Error("Supabase key is required");
    }

    const response = await this.fetcher(url.toString(), {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${this.config.accessToken ?? this.config.serviceRoleKey ?? key}`,
        "Content-Type": "application/json",
        Prefer: ["return=representation", preferExtra].filter(Boolean).join(",")
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Supabase ${method} ${table} failed: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as T;
  }

  private employeeFromRow(row: EmployeeRow): Employee {
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      department: row.department,
      hireDate: row.hire_date,
      employeeNumber: row.employee_number ?? undefined,
      position: row.position ?? undefined,
      residentRegistrationNumber: this.config.decodeSensitiveText?.("resident_registration_number_enc", row.resident_registration_number_enc),
      birthday: row.birthday ?? undefined,
      address: this.config.decodeSensitiveText?.("address_enc", row.address_enc),
      mobile: this.config.decodeSensitiveText?.("mobile_enc", row.mobile_enc),
      emergencyContact: this.config.decodeSensitiveText?.("emergency_contact_enc", row.emergency_contact_enc),
      familyRelations: this.config.decodeSensitiveText?.("family_relations_enc", row.family_relations_enc),
      payrollBank: row.payroll_bank ?? undefined,
      payrollAccount: this.config.decodeSensitiveText?.("payroll_account_enc", row.payroll_account_enc),
      annualSalary: optionalNumber(row.annual_salary),
      severancePay: optionalNumber(row.severance_pay),
      incomeDeductionDependents: row.income_deduction_dependents ?? undefined,
      customAdminFields: row.custom_admin_fields ?? undefined,
      approverId: row.approver_id ?? undefined,
      pilot: row.pilot
    };
  }
}

function employeeToRow(employee: Employee, config: SupabaseRepositoryConfig): Partial<EmployeeRow> {
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
    pilot: employee.pilot
  };
}

function workplaceFromRow(row: WorkplaceRow): Workplace {
  return {
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    allowedRadiusMeters: row.allowed_radius_meters,
    qrPath: row.qr_path
  };
}

function attendanceFromRow(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    date: row.work_date,
    clockInAt: row.clock_in_at ?? undefined,
    clockOutAt: row.clock_out_at ?? undefined,
    status: row.status,
    verificationId: row.verification_id,
    earlyLeaveMinutes: row.early_leave_minutes
  };
}

function attendanceToRow(record: AttendanceRecord): AttendanceRow {
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
    id: row.id,
    employeeId: row.employee_id,
    workplaceId: row.workplace_id ?? undefined,
    method: row.method,
    status: row.status,
    attemptedAt: row.attempted_at,
    distanceMeters: row.distance_meters ?? undefined,
    accuracyMeters: row.accuracy_meters ?? undefined,
    note: row.note ?? undefined
  };
}

function verificationToRow(attempt: VerificationAttempt): VerificationRow {
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
    id: row.id,
    employeeId: row.employee_id,
    type: row.type,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    days: Number(row.days),
    reason: row.reason,
    status: row.status
  };
}

function leaveRequestToRow(request: LeaveRequest): LeaveRequestRow {
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
    id: row.id,
    employeeId: row.employee_id,
    date: row.work_date,
    minutes: row.minutes,
    status: row.status,
    reason: row.reason ?? undefined
  };
}

function earlyLeaveToRow(entry: EarlyLeaveLedger): EarlyLeaveRow {
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
    id: row.id,
    employeeId: row.employee_id,
    date: row.work_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    minutes: row.minutes,
    reason: row.reason,
    status: row.status,
    payApproved: row.pay_approved
  };
}

function overtimeToRow(request: OvertimeRequest): OvertimeRow {
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
    id: row.id,
    attendanceId: row.attendance_id,
    employeeId: row.employee_id,
    correctedById: row.corrected_by_id,
    type: row.type,
    beforeValue: row.before_value ?? undefined,
    afterValue: row.after_value,
    reason: row.reason,
    createdAt: row.created_at
  };
}

function correctionToRow(correction: AttendanceCorrection): CorrectionRow {
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
    id: row.id,
    employeeId: row.employee_id,
    month: row.payroll_month,
    filename: row.filename,
    storageBucket: row.storage_bucket ?? undefined,
    storagePath: row.storage_path ?? undefined,
    uploadedBy: row.uploaded_by ?? undefined,
    uploadedAt: row.uploaded_at,
    deletedBy: row.deleted_by ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    deleteReason: row.delete_reason ?? undefined
  };
}

function payrollToRow(statement: PayrollStatement): PayrollRow {
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

function policyFromRow(row: SystemPolicyRow): SystemPolicy {
  return {
    gpsAllowedRadiusMeters: row.gps_allowed_radius_meters,
    gpsFailureFallback: row.gps_failure_fallback,
    payrollEmployeeAccess: row.payroll_employee_access,
    payrollDeleteMode: row.payroll_delete_mode,
    overtimePayApproverRole: row.overtime_pay_approver_role,
    advanceLeaveExceptionHandling: row.advance_leave_exception_handling
  };
}

function policyToRow(settings: Partial<SystemPolicy>): Partial<SystemPolicyRow> {
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
    id: row.id,
    actorId: row.actor_employee_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    createdAt: row.created_at,
    detail: row.detail
  };
}

function auditLogToRow(log: AuditLog): AuditLogRow {
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

function optionalNumber(value: number | string | null | undefined) {
  return value === null || value === undefined ? undefined : Number(value);
}

function encodeFilterValue(value: string) {
  return encodeURIComponent(value).replace(/\./g, "%2E");
}
