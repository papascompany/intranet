import { buildAttendanceRecord, evaluateVerification } from "../domain/attendance";
import { getLeaveBalance } from "../domain/leave";
import { offsetOvertimeWithEarlyLeave } from "../domain/overtime";
import type {
  AttendanceCorrection,
  AuditLog,
  EarlyLeaveLedger,
  LeaveRequest,
  OvertimeRequest,
  PayrollStatement,
  RequestStatus
} from "../domain/types";
import { InMemoryDatabase } from "./inMemoryDatabase";
import type {
  AuditLogFilter,
  ClockAttendanceInput,
  CreateAttendanceCorrectionInput,
  Dashboard,
  EmployeeSnapshot,
  SetOvertimePayApprovalInput,
  SoftDeletePayrollStatementInput,
  SubmitLeaveRequestInput,
  SubmitOvertimeRequestInput,
  UpdateSettingsInput,
  UpdateRequestStatusInput,
  UploadPayrollStatementInput
} from "./types";

type Clock = () => string;

const defaultClock: Clock = () => new Date().toISOString();

export class HrApi {
  constructor(
    private readonly db = new InMemoryDatabase(),
    private readonly clock: Clock = defaultClock
  ) {}

  async getEmployees() {
    return this.db.listEmployees();
  }

  async getDashboard(asOf = this.clock()): Promise<Dashboard> {
    const today = asOf.slice(0, 10);
    const employees = this.db.listEmployees();
    const attendance = this.db.listAttendanceRecords();
    const leaveRequests = this.db.listLeaveRequests();
    const overtimeRequests = this.db.listOvertimeRequests();

    return {
      asOf,
      employeesTotal: employees.length,
      pilotEmployees: employees.filter((employee) => employee.pilot).length,
      todayAttendance: attendance.filter((record) => record.date === today),
      leaveRequests,
      pendingLeaveRequests: leaveRequests.filter((request) => request.status === "PENDING"),
      overtimeRequests,
      corrections: this.db.listCorrections(),
      gpsFailedAttendance: attendance.filter((record) => record.status.includes("GPS_FAILED")),
      activePayrollStatements: this.db.listPayrollStatements(false),
      settings: this.db.getSettings(),
      recentAuditLogs: this.db.listAuditLogs().slice(0, 10)
    };
  }

  async getSettings() {
    return this.db.getSettings();
  }

  async updateSettings(input: UpdateSettingsInput) {
    this.assertAdmin(input.actorId);

    const settings = this.db.updateSettings(input.settings);
    const auditLog = this.addAuditLog({
      actorId: input.actorId,
      action: "SETTINGS_UPDATED",
      targetType: "SystemPolicy",
      targetId: "system-policy",
      detail: Object.keys(input.settings).sort().join(", ")
    });

    return { settings, auditLog };
  }

  async getEmployeeSnapshot(employeeId: string, asOf = this.clock()): Promise<EmployeeSnapshot> {
    const employee = this.db.listEmployees().find((item) => item.id === employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    const attendanceRecords = this.db
      .listAttendanceRecords()
      .filter((record) => record.employeeId === employeeId);
    const leaveRequests = this.db.listLeaveRequests().filter((request) => request.employeeId === employeeId);
    const earlyLeaveLedger = this.db.listEarlyLeaveLedger().filter((entry) => entry.employeeId === employeeId);
    const overtimeRequests = this.db.listOvertimeRequests().filter((request) => request.employeeId === employeeId);
    const activeOvertime = overtimeRequests.find((request) => request.status === "APPROVED");
    const earlyLeaveMinutes = earlyLeaveLedger.reduce((sum, entry) => sum + entry.minutes, 0);

    return {
      asOf,
      employee,
      workplaceOptions: this.db.listWorkplaces(),
      todayAttendance: attendanceRecords.find((record) => record.date === asOf.slice(0, 10)),
      attendanceRecords,
      leaveBalance: getLeaveBalance({
        employee,
        asOf,
        approvedRequests: leaveRequests
      }),
      leaveRequests,
      earlyLeaveLedger,
      overtimeRequests,
      overtimeOffset: activeOvertime
        ? offsetOvertimeWithEarlyLeave({
            date: activeOvertime.date,
            earlyLeaveMinutes,
            overtimeMinutes: activeOvertime.minutes,
            payApproved: activeOvertime.payApproved
          })
        : undefined,
      attendanceCorrections: this.db.listCorrections().filter((correction) => correction.employeeId === employeeId),
      payrollStatements: this.db
        .listPayrollStatements(false)
        .filter((statement) => statement.employeeId === employeeId),
      recentAuditLogs: this.db
        .listAuditLogs()
        .filter((log) => log.actorId === employeeId || log.targetId.includes(employeeId))
        .slice(0, 10)
    };
  }

  async clockAttendance(input: ClockAttendanceInput) {
    this.assertEmployee(input.employeeId);

    const now = input.now ?? this.clock();
    const verification = evaluateVerification({
      employeeId: input.employeeId,
      workplaces: this.db.listWorkplaces(),
      coordinate: input.coordinate,
      method: input.method,
      now,
      gpsError: input.gpsError
    });
    const existing = this.db.findAttendanceByEmployeeDate(input.employeeId, now.slice(0, 10));
    const attendance = this.db.upsertAttendanceRecord(
      buildAttendanceRecord({
        employeeId: input.employeeId,
        type: input.type,
        verification,
        existing,
        now,
        scheduledEndHour: input.scheduledEndHour
      })
    );
    const earlyLeaveEntry = this.syncEarlyLeaveLedger(attendance);

    this.db.addVerificationAttempt(verification);
    const auditLog = this.addAuditLog({
      actorId: input.actorId ?? input.employeeId,
      action: input.type === "CLOCK_IN" ? "ATTENDANCE_CLOCKED_IN" : "ATTENDANCE_CLOCKED_OUT",
      targetType: "AttendanceRecord",
      targetId: attendance.id,
      detail: `${input.method} ${verification.status}`
    });

    return {
      attendance,
      verification,
      auditLog,
      earlyLeaveLedger: earlyLeaveEntry
    };
  }

  async submitLeaveRequest(input: SubmitLeaveRequestInput) {
    this.assertEmployee(input.employeeId);

    const request: LeaveRequest = {
      id: this.db.nextId("leave"),
      employeeId: input.employeeId,
      type: input.type,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      days: input.days,
      reason: input.reason,
      status: input.status ?? "PENDING"
    };
    const saved = this.db.addLeaveRequest(request);
    const auditLog = this.addAuditLog({
      actorId: input.actorId ?? input.employeeId,
      action: "LEAVE_REQUEST_SUBMITTED",
      targetType: "LeaveRequest",
      targetId: saved.id,
      detail: `${saved.type} ${saved.startsOn}~${saved.endsOn} ${saved.days} days`
    });

    return { request: saved, auditLog };
  }

  async submitOvertimeRequest(input: SubmitOvertimeRequestInput) {
    this.assertEmployee(input.employeeId);
    if (input.actorId) {
      this.assertEmployee(input.actorId);
    }

    const request: OvertimeRequest = {
      id: this.db.nextId("ot"),
      employeeId: input.employeeId,
      date: input.date,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      minutes: input.minutes,
      reason: input.reason,
      status: input.status ?? "PENDING",
      payApproved: false
    };
    const saved = this.db.addOvertimeRequest(request);
    const auditLog = this.addAuditLog({
      actorId: input.actorId ?? input.employeeId,
      action: "OVERTIME_REQUEST_SUBMITTED",
      targetType: "OvertimeRequest",
      targetId: saved.id,
      detail: `${saved.date} ${saved.startsAt}~${saved.endsAt} ${saved.minutes} minutes`
    });

    return { request: saved, auditLog };
  }

  async updateRequestStatus(input: UpdateRequestStatusInput) {
    this.assertEmployee(input.actorId);

    if (input.targetType === "LeaveRequest") {
      const request = this.findLeaveRequest(input.requestId);
      const saved = this.db.updateLeaveRequest({ ...request, status: input.status });
      const auditLog = this.auditStatusChange(input.actorId, input.targetType, saved.id, input.status, input.detail);

      return { request: saved, auditLog };
    }

    const request = this.findOvertimeRequest(input.requestId);
    const saved = this.db.updateOvertimeRequest({ ...request, status: input.status });
    const auditLog = this.auditStatusChange(input.actorId, input.targetType, saved.id, input.status, input.detail);

    return { request: saved, auditLog };
  }

  async setOvertimePayApproval(input: SetOvertimePayApprovalInput) {
    this.assertAdmin(input.actorId);

    const request = this.findOvertimeRequest(input.requestId);
    const saved = this.db.updateOvertimeRequest({ ...request, payApproved: input.payApproved });
    const auditLog = this.addAuditLog({
      actorId: input.actorId,
      action: input.payApproved ? "OVERTIME_PAY_APPROVED" : "OVERTIME_PAY_UNAPPROVED",
      targetType: "OvertimeRequest",
      targetId: saved.id,
      detail: input.detail ?? `Overtime pay approval set to ${input.payApproved}`
    });

    return { request: saved, auditLog };
  }

  async createAttendanceCorrection(input: CreateAttendanceCorrectionInput) {
    this.assertEmployee(input.employeeId);
    this.assertEmployee(input.correctedById);

    const correction: AttendanceCorrection = {
      id: this.db.nextId("corr"),
      attendanceId: input.attendanceId,
      employeeId: input.employeeId,
      correctedById: input.correctedById,
      type: input.type,
      beforeValue: input.beforeValue,
      afterValue: input.afterValue,
      reason: input.reason,
      createdAt: input.createdAt ?? this.clock()
    };
    const saved = this.db.addCorrection(correction);
    const auditLog = this.addAuditLog({
      actorId: input.correctedById,
      action: "ATTENDANCE_CORRECTION_CREATED",
      targetType: "AttendanceRecord",
      targetId: input.attendanceId,
      detail: `${input.type}: ${input.reason}`
    });

    return { correction: saved, auditLog };
  }

  async uploadPayrollStatement(input: UploadPayrollStatementInput) {
    this.assertEmployee(input.employeeId);
    this.assertEmployee(input.actorId);

    const statement: PayrollStatement = {
      id: this.db.nextId("pay"),
      employeeId: input.employeeId,
      month: input.month,
      filename: input.filename,
      uploadedAt: input.uploadedAt ?? this.clock()
    };
    const saved = this.db.addPayrollStatement(statement);
    const auditLog = this.addAuditLog({
      actorId: input.actorId,
      action: "PAYROLL_STATEMENT_UPLOADED",
      targetType: "PayrollStatement",
      targetId: saved.id,
      detail: `${saved.month} ${saved.filename}`
    });

    return { statement: saved, auditLog };
  }

  async softDeletePayrollStatement(input: SoftDeletePayrollStatementInput) {
    this.assertAdmin(input.actorId);

    const statement = this.db
      .listPayrollStatements(true)
      .find((item) => item.id === input.statementId);
    if (!statement) {
      throw new Error(`Payroll statement not found: ${input.statementId}`);
    }

    const saved = this.db.updatePayrollStatement({
      ...statement,
      deletedAt: input.deletedAt ?? this.clock()
    });
    const auditLog = this.addAuditLog({
      actorId: input.actorId,
      action: "PAYROLL_STATEMENT_SOFT_DELETED",
      targetType: "PayrollStatement",
      targetId: saved.id,
      detail: `${saved.month} ${saved.filename}`
    });

    return { statement: saved, auditLog };
  }

  async getAuditLogs(filter: AuditLogFilter = {}) {
    const logs = this.db
      .listAuditLogs()
      .filter((log) => !filter.actorId || log.actorId === filter.actorId)
      .filter((log) => !filter.targetType || log.targetType === filter.targetType)
      .filter((log) => !filter.targetId || log.targetId === filter.targetId)
      .filter((log) => !filter.action || log.action === filter.action);

    return typeof filter.limit === "number" ? logs.slice(0, filter.limit) : logs;
  }

  private syncEarlyLeaveLedger(attendance: { id: string; employeeId: string; date: string; earlyLeaveMinutes: number }) {
    if (attendance.earlyLeaveMinutes <= 0) {
      return undefined;
    }

    const entry: EarlyLeaveLedger = {
      id: `early-${attendance.id}`,
      employeeId: attendance.employeeId,
      date: attendance.date,
      minutes: attendance.earlyLeaveMinutes,
      status: "UNAPPROVED",
      reason: "실제 퇴근 기록 기준"
    };

    return this.db.upsertEarlyLeaveLedger(entry);
  }

  private auditStatusChange(
    actorId: string,
    targetType: "LeaveRequest" | "OvertimeRequest",
    targetId: string,
    status: RequestStatus,
    detail?: string
  ) {
    return this.addAuditLog({
      actorId,
      action: `${targetType.toUpperCase()}_${status}`,
      targetType,
      targetId,
      detail: detail ?? `${targetType} status changed to ${status}`
    });
  }

  private addAuditLog(input: Omit<AuditLog, "id" | "createdAt">) {
    const log: AuditLog = {
      id: this.db.nextId("audit"),
      createdAt: this.clock(),
      ...input
    };

    return this.db.addAuditLog(log);
  }

  private assertEmployee(employeeId: string) {
    if (!this.db.listEmployees().some((employee) => employee.id === employeeId)) {
      throw new Error(`Employee not found: ${employeeId}`);
    }
  }

  private assertAdmin(employeeId: string) {
    const employee = this.db.listEmployees().find((item) => item.id === employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    if (employee.role !== "HR_ADMIN" && employee.role !== "SYSTEM_ADMIN") {
      throw new Error(`Admin permission required: ${employeeId}`);
    }
  }

  private findLeaveRequest(requestId: string) {
    const request = this.db.listLeaveRequests().find((item) => item.id === requestId);
    if (!request) {
      throw new Error(`Leave request not found: ${requestId}`);
    }

    return request;
  }

  private findOvertimeRequest(requestId: string) {
    const request = this.db.listOvertimeRequests().find((item) => item.id === requestId);
    if (!request) {
      throw new Error(`Overtime request not found: ${requestId}`);
    }

    return request;
  }
}

export function createHrApi(db = new InMemoryDatabase(), clock: Clock = defaultClock) {
  return new HrApi(db, clock);
}

export const defaultDatabase = new InMemoryDatabase();
export const defaultHrApi = createHrApi(defaultDatabase);

export const getEmployees = defaultHrApi.getEmployees.bind(defaultHrApi);
export const getDashboard = defaultHrApi.getDashboard.bind(defaultHrApi);
export const getEmployeeSnapshot = defaultHrApi.getEmployeeSnapshot.bind(defaultHrApi);
export const getSettings = defaultHrApi.getSettings.bind(defaultHrApi);
export const updateSettings = defaultHrApi.updateSettings.bind(defaultHrApi);
export const clockAttendance = defaultHrApi.clockAttendance.bind(defaultHrApi);
export const submitLeaveRequest = defaultHrApi.submitLeaveRequest.bind(defaultHrApi);
export const submitOvertimeRequest = defaultHrApi.submitOvertimeRequest.bind(defaultHrApi);
export const updateRequestStatus = defaultHrApi.updateRequestStatus.bind(defaultHrApi);
export const setOvertimePayApproval = defaultHrApi.setOvertimePayApproval.bind(defaultHrApi);
export const createAttendanceCorrection = defaultHrApi.createAttendanceCorrection.bind(defaultHrApi);
export const uploadPayrollStatement = defaultHrApi.uploadPayrollStatement.bind(defaultHrApi);
export const softDeletePayrollStatement = defaultHrApi.softDeletePayrollStatement.bind(defaultHrApi);
export const getAuditLogs = defaultHrApi.getAuditLogs.bind(defaultHrApi);
