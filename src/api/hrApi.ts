import { buildAttendanceRecord, evaluateVerification } from "../domain/attendance.js";
import { getLeaveBalance } from "../domain/leave.js";
import { offsetOvertimeWithEarlyLeave } from "../domain/overtime.js";
import { applyEmployeeCardUpdate } from "../features/employeeCardUpdate.js";
import type {
  AttendanceCorrection,
  AuditLog,
  DailyWorkTask,
  EarlyLeaveLedger,
  Employee,
  LeaveRequest,
  OvertimeRequest,
  PayrollStatement,
  RequestStatus
} from "../domain/types.js";
import { canApproveRequests, isAdminSession, type AuthSession } from "./auth.js";
import { InMemoryDatabase } from "./inMemoryDatabase.js";
import {
  decodePayrollPdf,
  InMemoryPayrollFileStorage,
  type PayrollFileStorage,
  validatePayrollFilename,
  validatePayrollMonth
} from "./payrollFileStorage.js";
import type { HrRepository } from "./hrRepository.js";
import type {
  AuditLogFilter,
  ClockAttendanceInput,
  CreateDailyWorkTaskPlanInput,
  CreateAttendanceCorrectionInput,
  Dashboard,
  DashboardInput,
  DownloadPayrollStatementInput,
  DownloadPayrollStatementResult,
  EmployeeSnapshot,
  GetDailyWorkTasksInput,
  SetOvertimePayApprovalInput,
  SoftDeletePayrollStatementInput,
  SubmitLeaveRequestInput,
  SubmitOvertimeRequestInput,
  UpdateEmployeeCardInput,
  UpdateDailyWorkTaskPlanInput,
  UpdateDailyWorkTaskStatusInput,
  UpdateSettingsInput,
  UpdateRequestStatusInput,
  UploadPayrollStatementInput
} from "./types.js";

type Clock = () => string;

const defaultClock: Clock = () => new Date().toISOString();

export class HrApi {
  constructor(
    private readonly db: HrRepository = new InMemoryDatabase(),
    private readonly clock: Clock = defaultClock,
    private readonly payrollStorage: PayrollFileStorage = new InMemoryPayrollFileStorage()
  ) {}

  async getEmployees() {
    return await this.db.listEmployees();
  }

  async getEmployeeDirectory(input: { session?: AuthSession } = {}) {
    const employees = await this.db.listEmployees();
    if (!input.session || isAdminSession(input.session)) {
      return employees;
    }

    return employees.filter((employee) => employee.id === input.session?.employeeId);
  }

  async getDashboard(input: string | DashboardInput = this.clock()): Promise<Dashboard> {
    const { asOf, session } = parseDashboardInput(input, this.clock);
    const today = asOf.slice(0, 10);
    const [
      employees,
      attendanceRecords,
      leaveRequestRecords,
      overtimeRequestRecords,
      correctionRecords,
      payrollStatementRecords,
      settings,
      auditLogs
    ] = await Promise.all([
      this.db.listEmployees(),
      this.db.listAttendanceRecords(),
      this.db.listLeaveRequests(),
      this.db.listOvertimeRequests(),
      this.db.listCorrections(),
      this.db.listPayrollStatements(false),
      this.db.getSettings(),
      this.db.listAuditLogs()
    ]);
    const visibleEmployeeIds = this.visibleEmployeeIds(session, employees);
    const attendance = attendanceRecords.filter((record) => visibleEmployeeIds.has(record.employeeId));
    const leaveRequests = leaveRequestRecords.filter((request) => visibleEmployeeIds.has(request.employeeId));
    const overtimeRequests = overtimeRequestRecords.filter((request) => visibleEmployeeIds.has(request.employeeId));
    const corrections = correctionRecords.filter((correction) => visibleEmployeeIds.has(correction.employeeId));
    const activePayrollStatements = payrollStatementRecords.filter((statement) => visibleEmployeeIds.has(statement.employeeId));
    const visibleEmployees = employees.filter((employee) => visibleEmployeeIds.has(employee.id));
    const visibleTargetIds = new Set([
      ...attendance.map((record) => record.id),
      ...leaveRequests.map((request) => request.id),
      ...overtimeRequests.map((request) => request.id),
      ...corrections.map((correction) => correction.id),
      ...corrections.map((correction) => correction.attendanceId),
      ...activePayrollStatements.map((statement) => statement.id)
    ]);

    return {
      asOf,
      employeesTotal: visibleEmployees.length,
      pilotEmployees: visibleEmployees.filter((employee) => employee.pilot).length,
      todayAttendance: attendance.filter((record) => record.date === today),
      leaveRequests,
      pendingLeaveRequests: leaveRequests.filter((request) => request.status === "PENDING"),
      overtimeRequests,
      corrections,
      gpsFailedAttendance: attendance.filter((record) => record.status.includes("GPS_FAILED")),
      activePayrollStatements,
      settings,
      recentAuditLogs: this.filterAuditLogsBySession(auditLogs, session, visibleTargetIds).slice(0, 10)
    };
  }

  async getSettings(_input: { session?: AuthSession } = {}) {
    return await this.db.getSettings();
  }

  async updateSettings(input: UpdateSettingsInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);

    const settings = await this.db.updateSettings(input.settings);
    const auditLog = await this.addAuditLog({
      actorId,
      action: "SETTINGS_UPDATED",
      targetType: "SystemPolicy",
      targetId: "system-policy",
      detail: Object.keys(input.settings).sort().join(", ")
    });

    return { settings, auditLog };
  }

  async getEmployeeSnapshot(employeeId: string, asOf = this.clock(), session?: AuthSession): Promise<EmployeeSnapshot> {
    await this.assertCanReadEmployee(employeeId, session);
    const [
      employees,
      attendanceRecordRows,
      leaveRequestRows,
      earlyLeaveLedgerRows,
      overtimeRequestRows,
      workplaceOptions,
      correctionRows,
      payrollStatementRows,
      dailyWorkTaskRows,
      auditLogs
    ] = await Promise.all([
      this.db.listEmployees(),
      this.db.listAttendanceRecords(),
      this.db.listLeaveRequests(),
      this.db.listEarlyLeaveLedger(),
      this.db.listOvertimeRequests(),
      this.db.listWorkplaces(),
      this.db.listCorrections(),
      this.db.listPayrollStatements(false),
      this.db.listDailyWorkTasks(),
      this.db.listAuditLogs()
    ]);
    const employee = employees.find((item) => item.id === employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    const attendanceRecords = attendanceRecordRows.filter((record) => record.employeeId === employeeId);
    const leaveRequests = leaveRequestRows.filter((request) => request.employeeId === employeeId);
    const earlyLeaveLedger = earlyLeaveLedgerRows.filter((entry) => entry.employeeId === employeeId);
    const overtimeRequests = overtimeRequestRows.filter((request) => request.employeeId === employeeId);
    const activeOvertime = overtimeRequests.find((request) => request.status === "APPROVED");
    const earlyLeaveMinutes = earlyLeaveLedger.reduce((sum, entry) => sum + entry.minutes, 0);

    return {
      asOf,
      employee,
      workplaceOptions,
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
      attendanceCorrections: correctionRows.filter((correction) => correction.employeeId === employeeId),
      payrollStatements: payrollStatementRows.filter((statement) => statement.employeeId === employeeId),
      dailyWorkTasks: dailyWorkTaskRows.filter((task) => task.employeeId === employeeId && task.date === asOf.slice(0, 10)),
      recentAuditLogs: auditLogs
        .filter((log) => log.actorId === employeeId || log.targetId.includes(employeeId))
        .slice(0, 10)
    };
  }

  async getDailyWorkTasks(input: GetDailyWorkTasksInput) {
    await this.assertCanReadEmployee(input.employeeId, input.session);
    const date = input.date ?? this.clock().slice(0, 10);
    return (await this.db.listDailyWorkTasks())
      .filter((task) => task.employeeId === input.employeeId && task.date === date)
      .sort((left, right) => left.displayOrder - right.displayOrder || left.id.localeCompare(right.id));
  }

  async updateDailyWorkTaskStatus(input: UpdateDailyWorkTaskStatusInput) {
    const task = await this.findDailyWorkTask(input.taskId);
    const actorId = this.resolveActorId(input, task.employeeId);
    await this.assertEmployee(actorId);
    if (actorId !== task.employeeId) {
      throw new Error(`Daily work task access denied: ${actorId} -> ${task.id}`);
    }

    const updated: DailyWorkTask = {
      ...task,
      status: input.status,
      completedAt: input.status === "DONE" ? input.completedAt ?? this.clock() : undefined
    };
    const saved = await this.db.updateDailyWorkTask(updated);
    const auditLog = await this.addAuditLog({
      actorId,
      action: "DAILY_WORK_TASK_STATUS_UPDATED",
      targetType: "DailyWorkTask",
      targetId: saved.id,
      detail: `${task.status} -> ${saved.status}`
    });

    return { task: saved, auditLog };
  }

  async createDailyWorkTaskPlan(input: CreateDailyWorkTaskPlanInput) {
    const actorId = this.resolveActorId(input, input.session?.employeeId ?? "");
    await this.assertCanApprove(actorId, input.session);
    const employee = await this.findEmployee(input.employeeId);
    this.assertDailyWorkTaskPlan(input);

    const status = input.status ?? "TODO";
    const task: DailyWorkTask = {
      id: await this.db.nextId("daily-work-task"),
      employeeId: employee.id,
      department: employee.department,
      date: input.date,
      title: input.title.trim(),
      dueLabel: normalizeOptionalText(input.dueLabel),
      displayOrder: input.displayOrder ?? 0,
      status,
      completedAt: status === "DONE" ? input.completedAt ?? this.clock() : undefined
    };
    const saved = await this.db.addDailyWorkTask(task);
    const auditLog = await this.addAuditLog({
      actorId,
      action: "DAILY_WORK_TASK_PLAN_CREATED",
      targetType: "DailyWorkTask",
      targetId: saved.id,
      detail: `${saved.employeeId} ${saved.date}: ${saved.title}`
    });

    return { task: saved, auditLog };
  }

  async updateDailyWorkTaskPlan(input: UpdateDailyWorkTaskPlanInput) {
    const actorId = this.resolveActorId(input, input.session?.employeeId ?? "");
    await this.assertCanApprove(actorId, input.session);
    const current = await this.findDailyWorkTask(input.taskId);
    const employee = input.employeeId ? await this.findEmployee(input.employeeId) : await this.findEmployee(current.employeeId);
    const status = input.status ?? current.status;
    const title = input.title === undefined ? current.title : input.title.trim();
    const date = input.date ?? current.date;
    const displayOrder = input.displayOrder ?? current.displayOrder;
    this.assertDailyWorkTaskPlan({ title, date, displayOrder });

    const updated: DailyWorkTask = {
      ...current,
      employeeId: employee.id,
      department: employee.department,
      date,
      title,
      dueLabel: input.dueLabel === undefined ? current.dueLabel : normalizeOptionalText(input.dueLabel),
      displayOrder,
      status,
      completedAt: status === "DONE" ? input.completedAt ?? current.completedAt ?? this.clock() : undefined
    };
    const saved = await this.db.updateDailyWorkTask(updated);
    const auditLog = await this.addAuditLog({
      actorId,
      action: "DAILY_WORK_TASK_PLAN_UPDATED",
      targetType: "DailyWorkTask",
      targetId: saved.id,
      detail: `${current.employeeId}/${current.date} -> ${saved.employeeId}/${saved.date}: ${saved.title}`
    });

    return { task: saved, auditLog };
  }

  async updateEmployeeCard(input: UpdateEmployeeCardInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    const selfServiceUpdate = Boolean(input.session && input.session.employeeId === input.employeeId && !isAdminSession(input.session));
    if (selfServiceUpdate) {
      assertSelfServiceEmployeeCardPatch(input.patch);
    } else {
      await this.assertAdmin(actorId, input.session);
    }

    const employee = (await this.db.listEmployees()).find((item) => item.id === input.employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${input.employeeId}`);
    }

    if (input.patch.workplaceId !== undefined && input.patch.workplaceId !== null) {
      const workplaceExists = (await this.db.listWorkplaces()).some((workplace) => workplace.id === input.patch.workplaceId);
      if (!workplaceExists) {
        throw new Error(`Workplace not found: ${input.patch.workplaceId}`);
      }
    }

    const saved = await this.db.updateEmployee(applyEmployeeCardUpdate(employee, input.patch));
    const auditLog = await this.addAuditLog({
      actorId,
      action: "EMPLOYEE_CARD_UPDATED",
      targetType: "Employee",
      targetId: saved.id,
      detail: input.reason ?? Object.keys(input.patch).sort().join(", ")
    });

    return { employee: saved, auditLog };
  }

  async clockAttendance(input: ClockAttendanceInput) {
    const employee = await this.findEmployee(input.employeeId);
    await this.assertCanReadEmployee(input.employeeId, input.session);

    const now = input.now ?? this.clock();
    const verification = evaluateVerification({
      employeeId: input.employeeId,
      workplaces: await this.workplacesWithPolicyRadius(employee.workplaceId),
      coordinate: input.coordinate,
      method: input.method,
      now,
      gpsError: input.gpsError
    });
    // Attendance records reference the verification row in Postgres.
    await this.db.addVerificationAttempt(verification);
    const existing = await this.db.findAttendanceByEmployeeDate(input.employeeId, now.slice(0, 10));
    const attendance = await this.db.upsertAttendanceRecord(
      buildAttendanceRecord({
        employeeId: input.employeeId,
        type: input.type,
        verification,
        existing,
        now,
        scheduledEndHour: input.scheduledEndHour
      })
    );
    const earlyLeaveEntry = await this.syncEarlyLeaveLedger(attendance);

    const actorId = this.resolveActorId(input, input.employeeId);
    const auditLog = await this.addAuditLog({
      actorId,
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
    await this.assertEmployee(input.employeeId);
    await this.assertCanReadEmployee(input.employeeId, input.session);
    const actorId = this.resolveActorId(input, input.employeeId);

    const request: LeaveRequest = {
      id: await this.db.nextId("leave"),
      employeeId: input.employeeId,
      type: input.type,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      days: input.days,
      reason: input.reason,
      status: input.status ?? "PENDING"
    };
    const saved = await this.db.addLeaveRequest(request);
    const auditLog = await this.addAuditLog({
      actorId,
      action: "LEAVE_REQUEST_SUBMITTED",
      targetType: "LeaveRequest",
      targetId: saved.id,
      detail: `${saved.type} ${saved.startsOn}~${saved.endsOn} ${saved.days} days`
    });

    return { request: saved, auditLog };
  }

  async submitOvertimeRequest(input: SubmitOvertimeRequestInput) {
    await this.assertEmployee(input.employeeId);
    await this.assertCanReadEmployee(input.employeeId, input.session);
    const actorId = this.resolveActorId(input, input.employeeId);
    await this.assertEmployee(actorId);

    const request: OvertimeRequest = {
      id: await this.db.nextId("ot"),
      employeeId: input.employeeId,
      date: input.date,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      minutes: input.minutes,
      reason: input.reason,
      status: input.status ?? "PENDING",
      payApproved: false
    };
    const saved = await this.db.addOvertimeRequest(request);
    const auditLog = await this.addAuditLog({
      actorId,
      action: "OVERTIME_REQUEST_SUBMITTED",
      targetType: "OvertimeRequest",
      targetId: saved.id,
      detail: `${saved.date} ${saved.startsAt}~${saved.endsAt} ${saved.minutes} minutes`
    });

    return { request: saved, auditLog };
  }

  async updateRequestStatus(input: UpdateRequestStatusInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertCanApprove(actorId, input.session);

    if (input.targetType === "LeaveRequest") {
      const request = await this.findLeaveRequest(input.requestId);
      const saved = await this.db.updateLeaveRequest({ ...request, status: input.status });
      const auditLog = await this.auditStatusChange(actorId, input.targetType, saved.id, input.status, input.detail);

      return { request: saved, auditLog };
    }

    const request = await this.findOvertimeRequest(input.requestId);
    const saved = await this.db.updateOvertimeRequest({ ...request, status: input.status });
    const auditLog = await this.auditStatusChange(actorId, input.targetType, saved.id, input.status, input.detail);

    return { request: saved, auditLog };
  }

  async setOvertimePayApproval(input: SetOvertimePayApprovalInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);

    const request = await this.findOvertimeRequest(input.requestId);
    const saved = await this.db.updateOvertimeRequest({ ...request, payApproved: input.payApproved });
    const auditLog = await this.addAuditLog({
      actorId,
      action: input.payApproved ? "OVERTIME_PAY_APPROVED" : "OVERTIME_PAY_UNAPPROVED",
      targetType: "OvertimeRequest",
      targetId: saved.id,
      detail: input.detail ?? `Overtime pay approval set to ${input.payApproved}`
    });

    return { request: saved, auditLog };
  }

  async createAttendanceCorrection(input: CreateAttendanceCorrectionInput) {
    await this.assertEmployee(input.employeeId);
    const correctedById = this.resolveActorId(input, input.correctedById);
    await this.assertAdmin(correctedById, input.session);

    const correction: AttendanceCorrection = {
      id: await this.db.nextId("corr"),
      attendanceId: input.attendanceId,
      employeeId: input.employeeId,
      correctedById,
      type: input.type,
      beforeValue: input.beforeValue,
      afterValue: input.afterValue,
      reason: input.reason,
      createdAt: input.createdAt ?? this.clock()
    };
    const saved = await this.db.addCorrection(correction);
    const auditLog = await this.addAuditLog({
      actorId: correctedById,
      action: "ATTENDANCE_CORRECTION_CREATED",
      targetType: "AttendanceRecord",
      targetId: input.attendanceId,
      detail: `${input.type}: ${input.reason}`
    });

    return { correction: saved, auditLog };
  }

  async uploadPayrollStatement(input: UploadPayrollStatementInput) {
    await this.assertEmployee(input.employeeId);
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);
    const filename = validatePayrollFilename(input.filename);
    const month = validatePayrollMonth(input.month);
    if (input.file?.contentType !== "application/pdf") {
      throw new Error("Payroll file content type must be application/pdf.");
    }
    const content = decodePayrollPdf(input.file?.contentBase64, input.file?.sizeBytes);
    const stored = await this.payrollStorage.put({
      pathname: this.defaultPayrollStoragePath(input.employeeId, month, filename),
      content,
      contentType: "application/pdf"
    });

    const statement: PayrollStatement = {
      id: await this.db.nextId("pay"),
      employeeId: input.employeeId,
      month,
      filename,
      storageBucket: stored.bucket,
      storagePath: stored.pathname,
      uploadedBy: actorId,
      uploadedAt: input.uploadedAt ?? this.clock()
    };
    const saved = await this.db.addPayrollStatement(statement);
    const auditLog = await this.addAuditLog({
      actorId,
      action: "PAYROLL_STATEMENT_UPLOADED",
      targetType: "PayrollStatement",
      targetId: saved.id,
      detail: `${saved.month} ${saved.filename}`
    });

    return { statement: saved, auditLog };
  }

  async downloadPayrollStatement(input: DownloadPayrollStatementInput): Promise<DownloadPayrollStatementResult> {
    const actorId = this.resolveActorId(input, input.actorId ?? input.session?.employeeId ?? "");
    await this.assertEmployee(actorId);

    const statement = await this.findPayrollStatement(input.statementId);
    await this.assertCanDownloadPayrollStatement(actorId, statement, input.session);

    const storageBucket = statement.storageBucket ?? "payroll-statements";
    const storagePath = statement.storagePath ?? this.defaultPayrollStoragePath(
      statement.employeeId,
      statement.month,
      statement.filename
    );
    const auditLog = await this.addAuditLog({
      actorId,
      action: "PAYROLL_STATEMENT_DOWNLOADED",
      targetType: "PayrollStatement",
      targetId: statement.id,
      detail: `${statement.month} ${statement.filename} from ${storageBucket}/${storagePath}`
    });

    return {
      statement,
      storageBucket,
      storagePath,
      // This is a same-origin, cookie-protected streaming endpoint. Blob objects remain private.
      signedUrl: `/api/payroll?statementId=${encodeURIComponent(statement.id)}`,
      auditLog
    };
  }

  async softDeletePayrollStatement(input: SoftDeletePayrollStatementInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);
    const deleteReason = input.deleteReason.trim();
    if (!deleteReason) {
      throw new Error("Payroll delete reason required");
    }

    const statement = await this.findPayrollStatement(input.statementId);

    const saved = await this.db.updatePayrollStatement({
      ...statement,
      deletedBy: actorId,
      deletedAt: input.deletedAt ?? this.clock(),
      deleteReason
    });
    const auditLog = await this.addAuditLog({
      actorId,
      action: "PAYROLL_STATEMENT_SOFT_DELETED",
      targetType: "PayrollStatement",
      targetId: saved.id,
      detail: `${saved.month} ${saved.filename}: ${deleteReason}`
    });

    return { statement: saved, auditLog };
  }

  async getAuditLogs(filter: AuditLogFilter = {}) {
    const logs = this.filterAuditLogsBySession(await this.db.listAuditLogs(), filter.session)
      .filter((log) => !filter.actorId || log.actorId === filter.actorId)
      .filter((log) => !filter.targetType || log.targetType === filter.targetType)
      .filter((log) => !filter.targetId || log.targetId === filter.targetId)
      .filter((log) => !filter.action || log.action === filter.action);

    return typeof filter.limit === "number" ? logs.slice(0, filter.limit) : logs;
  }

  private async syncEarlyLeaveLedger(attendance: { id: string; employeeId: string; date: string; earlyLeaveMinutes: number }) {
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

    return await this.db.upsertEarlyLeaveLedger(entry);
  }

  private async auditStatusChange(
    actorId: string,
    targetType: "LeaveRequest" | "OvertimeRequest",
    targetId: string,
    status: RequestStatus,
    detail?: string
  ) {
    return await this.addAuditLog({
      actorId,
      action: `${targetType.toUpperCase()}_${status}`,
      targetType,
      targetId,
      detail: detail ?? `${targetType} status changed to ${status}`
    });
  }

  private async addAuditLog(input: Omit<AuditLog, "id" | "createdAt">) {
    const log: AuditLog = {
      id: await this.db.nextId("audit"),
      createdAt: this.clock(),
      ...input
    };

    return await this.db.addAuditLog(log);
  }

  private async assertEmployee(employeeId: string) {
    if (!(await this.db.listEmployees()).some((employee) => employee.id === employeeId)) {
      throw new Error(`Employee not found: ${employeeId}`);
    }
  }

  private async assertAdmin(employeeId: string, session?: AuthSession) {
    const employee = (await this.db.listEmployees()).find((item) => item.id === employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    if (session) {
      this.assertSessionActor(session, employeeId);
      if (!isAdminSession(session)) {
        throw new Error(`Admin permission required: ${employeeId}`);
      }
      return;
    }

    if (employee.role !== "HR_ADMIN" && employee.role !== "SYSTEM_ADMIN") {
      throw new Error(`Admin permission required: ${employeeId}`);
    }
  }

  private async assertCanApprove(employeeId: string, session?: AuthSession) {
    const employee = (await this.db.listEmployees()).find((item) => item.id === employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    if (session) {
      this.assertSessionActor(session, employeeId);
      if (!canApproveRequests(session)) {
        throw new Error(`Approval permission required: ${employeeId}`);
      }
      return;
    }

    if (employee.role !== "APPROVER" && employee.role !== "HR_ADMIN" && employee.role !== "SYSTEM_ADMIN") {
      throw new Error(`Approval permission required: ${employeeId}`);
    }
  }

  private async assertCanReadEmployee(employeeId: string, session?: AuthSession) {
    await this.assertEmployee(employeeId);
    if (!session || isAdminSession(session) || session.employeeId === employeeId) {
      return;
    }

    throw new Error(`Employee access denied: ${session.employeeId} -> ${employeeId}`);
  }

  private async assertCanDownloadPayrollStatement(actorId: string, statement: PayrollStatement, session?: AuthSession) {
    if (statement.deletedAt) {
      throw new Error(`Payroll statement deleted: ${statement.id}`);
    }

    if (session) {
      this.assertSessionActor(session, actorId);
      if (isAdminSession(session) || statement.employeeId === session.employeeId) {
        return;
      }

      throw new Error(`Payroll access denied: ${session.employeeId} -> ${statement.employeeId}`);
    }

    const employee = (await this.db.listEmployees()).find((item) => item.id === actorId);
    if (employee && (employee.role === "HR_ADMIN" || employee.role === "SYSTEM_ADMIN")) {
      return;
    }

    if (statement.employeeId === actorId) {
      return;
    }

    throw new Error(`Payroll access denied: ${actorId} -> ${statement.employeeId}`);
  }

  private async findPayrollStatement(statementId: string) {
    const statement = (await this.db
      .listPayrollStatements(true))
      .find((item) => item.id === statementId);
    if (!statement) {
      throw new Error(`Payroll statement not found: ${statementId}`);
    }

    return statement;
  }

  private defaultPayrollStoragePath(employeeId: string, month: string, filename: string) {
    return `${employeeId}/${month}/${filename}`;
  }

  private assertSessionActor(session: AuthSession, actorId: string) {
    if (session.employeeId !== actorId) {
      throw new Error(`Session actor mismatch: ${session.employeeId} cannot act as ${actorId}`);
    }
  }

  private resolveActorId(input: { actorId?: string; session?: AuthSession }, fallbackEmployeeId: string) {
    if (input.session) {
      const actorId = input.actorId ?? input.session.employeeId;
      this.assertSessionActor(input.session, actorId);
      return input.session.employeeId;
    }

    return input.actorId ?? fallbackEmployeeId;
  }

  private visibleEmployeeIds(session: AuthSession | undefined, employees: Employee[]) {
    if (!session || isAdminSession(session)) {
      return new Set(employees.map((employee) => employee.id));
    }

    return new Set([session.employeeId]);
  }

  private filterAuditLogsBySession(logs: AuditLog[], session?: AuthSession, visibleTargetIds?: Set<string>) {
    if (!session || isAdminSession(session)) {
      return logs;
    }

    return logs.filter((log) => log.actorId === session.employeeId || Boolean(visibleTargetIds?.has(log.targetId)));
  }

  private async workplacesWithPolicyRadius(workplaceId?: string) {
    const [{ gpsAllowedRadiusMeters }, workplaces] = await Promise.all([this.db.getSettings(), this.db.listWorkplaces()]);
    if (!workplaceId) {
      return [];
    }

    return workplaces.filter((workplace) => workplace.id === workplaceId).map((workplace) => ({
      ...workplace,
      allowedRadiusMeters: gpsAllowedRadiusMeters
    }));
  }

  private async findLeaveRequest(requestId: string) {
    const request = (await this.db.listLeaveRequests()).find((item) => item.id === requestId);
    if (!request) {
      throw new Error(`Leave request not found: ${requestId}`);
    }

    return request;
  }

  private async findOvertimeRequest(requestId: string) {
    const request = (await this.db.listOvertimeRequests()).find((item) => item.id === requestId);
    if (!request) {
      throw new Error(`Overtime request not found: ${requestId}`);
    }

    return request;
  }

  private async findDailyWorkTask(taskId: string) {
    const task = (await this.db.listDailyWorkTasks()).find((item) => item.id === taskId);
    if (!task) {
      throw new Error(`Daily work task not found: ${taskId}`);
    }

    return task;
  }

  private async findEmployee(employeeId: string) {
    const employee = (await this.db.listEmployees()).find((item) => item.id === employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    return employee;
  }

  private assertDailyWorkTaskPlan(input: { title: string; date: string; displayOrder?: number }) {
    if (!input.title.trim()) {
      throw new Error("Daily work task title is required");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      throw new Error("Daily work task date must use YYYY-MM-DD");
    }
    if (input.displayOrder !== undefined && (!Number.isInteger(input.displayOrder) || input.displayOrder < 0)) {
      throw new Error("Daily work task display order must be a non-negative integer");
    }
  }
}

function assertSelfServiceEmployeeCardPatch(patch: UpdateEmployeeCardInput["patch"]) {
  const allowedFields = new Set(["birthday", "address", "mobile", "emergencyContact", "familyRelations", "payrollBank", "payrollAccount"]);
  const restrictedField = Object.keys(patch).find((field) => !allowedFields.has(field));
  if (restrictedField) {
    throw new Error(`Admin permission required for employee-card field: ${restrictedField}`);
  }
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function createHrApi(
  db: HrRepository = new InMemoryDatabase(),
  clock: Clock = defaultClock,
  payrollStorage: PayrollFileStorage = new InMemoryPayrollFileStorage()
) {
  return new HrApi(db, clock, payrollStorage);
}

function parseDashboardInput(input: string | DashboardInput, clock: Clock) {
  if (typeof input === "string") {
    return { asOf: input, session: undefined };
  }

  return {
    asOf: input.asOf ?? clock(),
    session: input.session
  };
}

export const defaultDatabase = new InMemoryDatabase();
export const defaultHrApi = createHrApi(defaultDatabase);

export const getEmployees = defaultHrApi.getEmployees.bind(defaultHrApi);
export const getEmployeeDirectory = defaultHrApi.getEmployeeDirectory.bind(defaultHrApi);
export const getDashboard = defaultHrApi.getDashboard.bind(defaultHrApi);
export const getEmployeeSnapshot = defaultHrApi.getEmployeeSnapshot.bind(defaultHrApi);
export const getDailyWorkTasks = defaultHrApi.getDailyWorkTasks.bind(defaultHrApi);
export const updateDailyWorkTaskStatus = defaultHrApi.updateDailyWorkTaskStatus.bind(defaultHrApi);
export const createDailyWorkTaskPlan = defaultHrApi.createDailyWorkTaskPlan.bind(defaultHrApi);
export const updateDailyWorkTaskPlan = defaultHrApi.updateDailyWorkTaskPlan.bind(defaultHrApi);
export const updateEmployeeCard = defaultHrApi.updateEmployeeCard.bind(defaultHrApi);
export const getSettings = defaultHrApi.getSettings.bind(defaultHrApi);
export const updateSettings = defaultHrApi.updateSettings.bind(defaultHrApi);
export const clockAttendance = defaultHrApi.clockAttendance.bind(defaultHrApi);
export const submitLeaveRequest = defaultHrApi.submitLeaveRequest.bind(defaultHrApi);
export const submitOvertimeRequest = defaultHrApi.submitOvertimeRequest.bind(defaultHrApi);
export const updateRequestStatus = defaultHrApi.updateRequestStatus.bind(defaultHrApi);
export const setOvertimePayApproval = defaultHrApi.setOvertimePayApproval.bind(defaultHrApi);
export const createAttendanceCorrection = defaultHrApi.createAttendanceCorrection.bind(defaultHrApi);
export const uploadPayrollStatement = defaultHrApi.uploadPayrollStatement.bind(defaultHrApi);
export const downloadPayrollStatement = defaultHrApi.downloadPayrollStatement.bind(defaultHrApi);
export const softDeletePayrollStatement = defaultHrApi.softDeletePayrollStatement.bind(defaultHrApi);
export const getAuditLogs = defaultHrApi.getAuditLogs.bind(defaultHrApi);
