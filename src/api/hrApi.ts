import { buildAttendanceRecord, calculateEarlyLeaveMinutes, evaluateVerification } from "../domain/attendance.js";
import { getLeaveBalance } from "../domain/leave.js";
import { offsetOvertimeWithEarlyLeave } from "../domain/overtime.js";
import { applyEmployeeCardUpdate } from "../features/employeeCardUpdate.js";
import type {
  AttendanceCorrection,
  AttendanceCorrectionRequest,
  AttendanceRecord,
  AuditLog,
  CorrectionType,
  DailyWorkTask,
  EarlyLeaveLedger,
  Employee,
  LeaveRequest,
  LeaveBalanceAdjustment,
  OvertimeRequest,
  PayrollStatement,
  RequestStatus,
  Workplace
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
  CancelRequestInput,
  ClockAttendanceInput,
  CreateEmployeeAccountInput,
  CreateDailyWorkTaskPlanInput,
  CreateAttendanceCorrectionInput,
  CreateWorkplaceInput,
  DeleteWorkplaceInput,
  SubmitAttendanceCorrectionRequestInput,
  UpdateAttendanceCorrectionRequestStatusInput,
  Dashboard,
  DashboardInput,
  DownloadPayrollStatementInput,
  DownloadPayrollStatementResult,
  EmployeeAuthAccount,
  EmployeeAccountState,
  ImportEmployeeAccountsInput,
  ImportEmployeeAccountsResult,
  EmployeeSnapshot,
  GetDailyWorkTasksInput,
  GetEmployeeAccountStatesInput,
  SetOvertimePayApprovalInput,
  SetEmployeeAccountAccessInput,
  SoftDeletePayrollStatementInput,
  RegisterUploadedPayrollStatementInput,
  RevealEmployeeSensitiveDataInput,
  ResetEmployeeAccountPasswordInput,
  SubmitLeaveRequestInput,
  SubmitOvertimeRequestInput,
  UpdateEmployeeCardInput,
  UpdateWorkplaceInput,
  UpdateDailyWorkTaskPlanInput,
  UpdateDailyWorkTaskStatusInput,
  UpdateSettingsInput,
  UpdateRequestStatusInput,
  UploadPayrollStatementInput
} from "./types.js";
import type { AppBootstrap } from "./types.js";

type Clock = () => string;

type HrDataSnapshot = {
  employees: Employee[];
  employeeAccounts?: EmployeeAuthAccount[];
  attendanceRecords: import("../domain/types.js").AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  leaveBalanceAdjustments: LeaveBalanceAdjustment[];
  earlyLeaveLedger: EarlyLeaveLedger[];
  overtimeRequests: OvertimeRequest[];
  workplaces: import("../domain/types.js").Workplace[];
  corrections: AttendanceCorrection[];
  correctionRequests: AttendanceCorrectionRequest[];
  payrollStatements: PayrollStatement[];
  dailyWorkTasks: DailyWorkTask[];
  auditLogs: AuditLog[];
  settings: import("./types.js").SystemPolicy;
};

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
    if (!input.session) {
      return employees;
    }
    if (isAdminSession(input.session)) {
      return employees.map(redactSensitiveEmployee);
    }

    if (input.session.role === "APPROVER") {
      return employees
        .filter((employee) => employee.id === input.session?.employeeId || employee.approverId === input.session?.employeeId)
        .map(redactSensitiveEmployee);
    }

    return employees.filter((employee) => employee.id === input.session?.employeeId);
  }

  async getAppBootstrap(input: { employeeId: string; asOf?: string; session?: AuthSession }): Promise<AppBootstrap> {
    const asOf = input.asOf ?? this.clock();
    const data = await this.loadDataSnapshot(isAdminSession(input.session));
    const targetEmployee = data.employees.find((employee) => employee.id === input.employeeId);
    this.assertCanReadEmployeeRecord(input.employeeId, input.session, targetEmployee);
    const employeeAccountStates = isAdminSession(input.session)
      ? this.getEmployeeAccountStatesFromRows(input.session!, data.employees, data.employeeAccounts ?? [])
      : [];
    const snapshot = data;
    const employees = this.visibleEmployees(snapshot.employees, input.session);
    const dashboard = this.buildDashboard(snapshot, asOf, input.session);
    const employeeSnapshot = this.buildEmployeeSnapshot(snapshot, input.employeeId, asOf, input.session);

    return { employees, dashboard, employeeSnapshot, employeeAccountStates };
  }

  async getDashboard(input: string | DashboardInput = this.clock()): Promise<Dashboard> {
    const { asOf, session } = parseDashboardInput(input, this.clock);
    return this.buildDashboard(await this.loadDataSnapshot(), asOf, session);
  }

  private async loadDataSnapshot(includeEmployeeAccounts = false): Promise<HrDataSnapshot> {
    const [employees, attendanceRecords, leaveRequests, earlyLeaveLedger, leaveBalanceAdjustments, overtimeRequests, workplaces, corrections, correctionRequests, payrollStatements, dailyWorkTasks, auditLogs, settings, employeeAccounts] = await Promise.all([
      this.db.listEmployees(),
      this.db.listAttendanceRecords(),
      this.db.listLeaveRequests(),
      this.db.listEarlyLeaveLedger(),
      this.db.listLeaveBalanceAdjustments(),
      this.db.listOvertimeRequests(),
      this.db.listWorkplaces(),
      this.db.listCorrections(),
      this.db.listCorrectionRequests(),
      this.db.listPayrollStatements(false),
      this.db.listDailyWorkTasks(),
      this.db.listAuditLogs(),
      this.db.getSettings(),
      includeEmployeeAccounts ? this.db.listEmployeeAccounts() : Promise.resolve([])
    ]);

    return { employees, employeeAccounts, attendanceRecords, leaveRequests, earlyLeaveLedger, leaveBalanceAdjustments, overtimeRequests, workplaces, corrections, correctionRequests, payrollStatements, dailyWorkTasks, auditLogs, settings };
  }

  private visibleEmployees(employees: Employee[], session?: AuthSession) {
    const visibleEmployeeIds = this.visibleEmployeeIds(session, employees);
    return employees.filter((employee) => visibleEmployeeIds.has(employee.id)).map((employee) => session && isAdminSession(session) ? redactSensitiveEmployee(employee) : employee);
  }

  private buildDashboard(data: HrDataSnapshot, asOf: string, session?: AuthSession): Dashboard {
    const today = asOf.slice(0, 10);
    const { employees, attendanceRecords, leaveRequests: leaveRequestRecords, overtimeRequests: overtimeRequestRecords, corrections: correctionRecords, correctionRequests: correctionRequestRecords, payrollStatements: payrollStatementRecords, settings, auditLogs } = data;
    const visibleEmployeeIds = this.visibleEmployeeIds(session, employees);
    const attendance = attendanceRecords.filter((record) => visibleEmployeeIds.has(record.employeeId));
    const leaveRequests = leaveRequestRecords.filter((request) => visibleEmployeeIds.has(request.employeeId));
    const overtimeRequests = overtimeRequestRecords.filter((request) => visibleEmployeeIds.has(request.employeeId));
    const corrections = correctionRecords.filter((correction) => visibleEmployeeIds.has(correction.employeeId));
    const correctionRequests = correctionRequestRecords.filter((request) => visibleEmployeeIds.has(request.employeeId));
    const activePayrollStatements = payrollStatementRecords.filter((statement) => visibleEmployeeIds.has(statement.employeeId));
    const visibleEmployees = employees.filter((employee) => visibleEmployeeIds.has(employee.id));
    const visibleTargetIds = new Set([
      ...attendance.map((record) => record.id),
      ...leaveRequests.map((request) => request.id),
      ...overtimeRequests.map((request) => request.id),
      ...corrections.map((correction) => correction.id),
      ...corrections.map((correction) => correction.attendanceId),
      ...correctionRequests.map((request) => request.id),
      ...activePayrollStatements.map((statement) => statement.id)
    ]);

    return {
      asOf,
      employeesTotal: visibleEmployees.length,
      pilotEmployees: visibleEmployees.filter((employee) => employee.pilot).length,
      todayAttendance: attendance.filter((record) => record.date === today),
      attendanceRecords: attendance,
      leaveRequests,
      pendingLeaveRequests: leaveRequests.filter((request) => request.status === "PENDING"),
      overtimeRequests,
      corrections,
      correctionRequests,
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

    const current = await this.db.getSettings();
    assertSystemPolicy({ ...current, ...input.settings });
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

  async createWorkplace(input: CreateWorkplaceInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);
    const workplace = normalizeWorkplace({ ...input.workplace, id: await this.db.nextId("workplace") });
    if ((await this.db.listWorkplaces()).some((item) => item.name === workplace.name)) {
      throw new Error(`Workplace already exists: ${workplace.name}`);
    }
    const saved = await this.db.addWorkplace(workplace);
    const auditLog = await this.addAuditLog({
      actorId,
      action: "WORKPLACE_CREATED",
      targetType: "Workplace",
      targetId: saved.id,
      detail: `${saved.name} (${saved.latitude},${saved.longitude})`
    });
    return { workplace: saved, auditLog };
  }

  async updateWorkplace(input: UpdateWorkplaceInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);
    const current = (await this.db.listWorkplaces()).find((item) => item.id === input.workplaceId);
    if (!current) {
      throw new Error(`Workplace not found: ${input.workplaceId}`);
    }
    const next = normalizeWorkplace({ ...current, ...input.patch, id: current.id });
    if ((await this.db.listWorkplaces()).some((item) => item.id !== current.id && item.name === next.name)) {
      throw new Error(`Workplace already exists: ${next.name}`);
    }
    const saved = await this.db.updateWorkplace(next);
    const auditLog = await this.addAuditLog({
      actorId,
      action: "WORKPLACE_UPDATED",
      targetType: "Workplace",
      targetId: saved.id,
      detail: Object.keys(input.patch).sort().join(", ")
    });
    return { workplace: saved, auditLog };
  }

  async deleteWorkplace(input: DeleteWorkplaceInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);
    const employees = await this.db.listEmployees();
    if (employees.some((employee) => employee.workplaceId === input.workplaceId)) {
      throw new Error("Employees are still assigned to this workplace. Reassign them before deleting it.");
    }
    const deleted = await this.db.deleteWorkplace(input.workplaceId);
    const auditLog = await this.addAuditLog({
      actorId,
      action: "WORKPLACE_DELETED",
      targetType: "Workplace",
      targetId: deleted.id,
      detail: deleted.name
    });
    return { workplace: deleted, auditLog };
  }

  async createEmployeeAccount(input: CreateEmployeeAccountInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);
    if (input.employee.role === "HR_ADMIN" || input.employee.role === "SYSTEM_ADMIN") {
      await this.assertSystemAdmin(actorId, input.session);
    }
    const employee = { ...this.buildNewEmployee(input.employee), id: await this.db.nextId("emp") };
    await this.assertEmployeeNumberAvailable(employee.employeeNumber!);
    if (employee.workplaceId && !(await this.db.listWorkplaces()).some((workplace) => workplace.id === employee.workplaceId)) {
      throw new Error(`Workplace not found: ${employee.workplaceId}`);
    }
    const loginId = await this.assertLoginIdAvailable(input.loginId);

    const credential = await createTemporaryCredential();
    const account: EmployeeAuthAccount = {
      id: await this.db.nextId("account"),
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber!,
      loginId,
      passwordHash: credential.passwordHash,
      passwordChangedAt: this.clock(),
      passwordChangeRequired: true,
      failedSignInCount: 0
    };
    const saved = await this.db.createEmployeeWithAccount(employee, account);
    const auditLog = await this.addAuditLog({
      actorId,
      action: "EMPLOYEE_ACCOUNT_CREATED",
      targetType: "Employee",
      targetId: saved.employee.id,
      detail: `Employee ${saved.employee.employeeNumber} created with an account`
    });

    return { employee: saved.employee, temporaryPassword: credential.password, auditLog };
  }

  async importEmployeeAccounts(input: ImportEmployeeAccountsInput): Promise<ImportEmployeeAccountsResult> {
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);
    if (input.rows.length === 0) throw new Error("가져올 직원 데이터가 없습니다.");
    if (input.rows.length > 200) throw new Error("한 번에 최대 200명까지 가져올 수 있습니다.");
    if (input.rows.some((row) => row.employee.role === "HR_ADMIN" || row.employee.role === "SYSTEM_ADMIN")) {
      await this.assertSystemAdmin(actorId, input.session);
    }

    const [employees, accounts, workplaces] = await Promise.all([
      this.db.listEmployees(),
      this.db.listEmployeeAccounts(),
      this.db.listWorkplaces()
    ]);
    const employeeNumbers = new Set(employees.map((employee) => employee.employeeNumber?.trim().toUpperCase()).filter(Boolean));
    const loginIds = new Set(accounts.map((account) => account.loginId.trim().toLowerCase()));
    const incomingNumbers = new Set<string>();
    const incomingLogins = new Set<string>();

    for (const [index, row] of input.rows.entries()) {
      const employee = this.buildNewEmployee(row.employee);
      const loginId = row.loginId.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(loginId)) {
        throw new Error(`${index + 1}번째 직원의 로그인 아이디가 올바르지 않습니다.`);
      }
      if (employeeNumbers.has(employee.employeeNumber!.toUpperCase()) || incomingNumbers.has(employee.employeeNumber!.toUpperCase())) {
        throw new Error(`사번이 중복됩니다: ${employee.employeeNumber}`);
      }
      if (loginIds.has(loginId) || incomingLogins.has(loginId)) {
        throw new Error(`로그인 아이디가 중복됩니다: ${loginId}`);
      }
      if (!employee.workplaceId || !workplaces.some((workplace) => workplace.id === employee.workplaceId)) {
        throw new Error(`${index + 1}번째 직원의 근무지를 찾을 수 없습니다.`);
      }
      incomingNumbers.add(employee.employeeNumber!.toUpperCase());
      incomingLogins.add(loginId);
    }

    const created: ImportEmployeeAccountsResult["created"] = [];
    const auditLogs: ImportEmployeeAccountsResult["auditLogs"] = [];
    for (const row of input.rows) {
      const result = await this.createEmployeeAccount({ actorId, session: input.session, loginId: row.loginId, employee: row.employee });
      created.push({ employee: result.employee, loginId: row.loginId.trim().toLowerCase(), temporaryPassword: result.temporaryPassword });
      auditLogs.push(result.auditLog);
    }

    return { created, auditLogs };
  }

  async resetEmployeeAccountPassword(input: ResetEmployeeAccountPasswordInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);
    await this.assertEmployee(input.employeeId);
    const account = await this.requireEmployeeAccount(input.employeeId);
    const temporaryPassword = assertTemporaryPassword(input.temporaryPassword);
    const saved = await this.db.updateEmployeeAccount({
      ...account,
      passwordHash: await hashPassword(temporaryPassword),
      passwordChangedAt: this.clock(),
      passwordChangeRequired: true,
      failedSignInCount: 0,
      lockedUntil: undefined
    });
    const auditLog = await this.addAuditLog({
      actorId,
      action: "EMPLOYEE_ACCOUNT_PASSWORD_RESET",
      targetType: "Employee",
      targetId: input.employeeId,
      detail: `Password reset for ${saved.employeeNumber}`
    });

    return { employeeId: input.employeeId, auditLog };
  }

  async setEmployeeAccountAccess(input: SetEmployeeAccountAccessInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);
    await this.assertEmployee(input.employeeId);
    const account = await this.requireEmployeeAccount(input.employeeId);
    const saved = await this.db.updateEmployeeAccount({
      ...account,
      disabledAt: input.enabled ? undefined : this.clock(),
      failedSignInCount: input.enabled ? 0 : account.failedSignInCount,
      lockedUntil: input.enabled ? undefined : account.lockedUntil
    });
    const auditLog = await this.addAuditLog({
      actorId,
      action: input.enabled ? "EMPLOYEE_ACCOUNT_ENABLED" : "EMPLOYEE_ACCOUNT_DISABLED",
      targetType: "Employee",
      targetId: input.employeeId,
      detail: `Account access ${input.enabled ? "enabled" : "disabled"} for ${saved.employeeNumber}`
    });

    return { employeeId: input.employeeId, enabled: !saved.disabledAt, auditLog };
  }

  async getEmployeeAccountStates(input: GetEmployeeAccountStatesInput = {}) {
    const actorId = this.resolveActorId(input, input.actorId ?? input.session?.employeeId ?? "");
    await this.assertAdmin(actorId, input.session);
    return (await this.db.listEmployeeAccounts()).map((account): EmployeeAccountState => ({
      employeeId: account.employeeId,
      loginId: account.loginId,
      enabled: !account.disabledAt,
      passwordChangedAt: account.passwordChangedAt,
      lastSignedInAt: account.lastSignedInAt
    }));
  }

  async getEmployeeSnapshot(employeeId: string, asOf = this.clock(), session?: AuthSession): Promise<EmployeeSnapshot> {
    await this.assertCanReadEmployee(employeeId, session);
    return this.buildEmployeeSnapshot(await this.loadDataSnapshot(), employeeId, asOf, session);
  }

  private buildEmployeeSnapshot(data: HrDataSnapshot, employeeId: string, asOf: string, session?: AuthSession): EmployeeSnapshot {
    const { employees, attendanceRecords: attendanceRecordRows, leaveRequests: leaveRequestRows, earlyLeaveLedger: earlyLeaveLedgerRows, leaveBalanceAdjustments: leaveBalanceAdjustmentRows, overtimeRequests: overtimeRequestRows, workplaces: workplaceOptions, corrections: correctionRows, correctionRequests: correctionRequestRows, payrollStatements: payrollStatementRows, dailyWorkTasks: dailyWorkTaskRows, auditLogs, settings } = data;
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
    const visibleAuditTargetIds = new Set([
      employeeId,
      ...attendanceRecords.map((record) => record.id),
      ...leaveRequests.map((request) => request.id),
      ...earlyLeaveLedger.map((entry) => entry.id),
      ...overtimeRequests.map((request) => request.id),
      ...correctionRows.filter((correction) => correction.employeeId === employeeId).flatMap((correction) => [correction.id, correction.attendanceId]),
      ...correctionRequestRows.filter((request) => request.employeeId === employeeId).map((request) => request.id),
      ...payrollStatementRows.filter((statement) => statement.employeeId === employeeId).map((statement) => statement.id),
      ...dailyWorkTaskRows.filter((task) => task.employeeId === employeeId).map((task) => task.id)
    ]);

    return {
      asOf,
      employee: session && session.employeeId !== employeeId ? redactSensitiveEmployee(employee) : employee,
      workplaceOptions,
      todayAttendance: attendanceRecords.find((record) => record.date === asOf.slice(0, 10)),
      attendanceRecords,
      leaveBalance: getLeaveBalance({
        employee,
        asOf,
        approvedRequests: leaveRequests,
        policy: settings
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
      attendanceCorrectionRequests: correctionRequestRows.filter((request) => request.employeeId === employeeId),
      leaveBalanceAdjustments: leaveBalanceAdjustmentRows.filter((adjustment) => adjustment.employeeId === employeeId),
      payrollStatements: payrollStatementRows.filter((statement) => statement.employeeId === employeeId),
      dailyWorkTasks: dailyWorkTaskRows.filter((task) => task.employeeId === employeeId && task.date === asOf.slice(0, 10)),
      recentAuditLogs: auditLogs
        .filter((log) => log.actorId === employeeId || visibleAuditTargetIds.has(log.targetId))
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
    const employee = await this.findEmployee(actorId);
    assertActiveEmployment(employee, "update daily work");
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

    const employee = await this.db.findEmployee(input.employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${input.employeeId}`);
    }

    if (input.patch.employeeNumber !== undefined && input.patch.employeeNumber !== employee.employeeNumber) {
      throw new Error("Employee number cannot be changed after account creation");
    }
    if (input.patch.role !== undefined && input.patch.role !== employee.role) {
      if (input.employeeId === actorId) {
        throw new Error("Administrators cannot change their own role");
      }
      await this.assertSystemAdmin(actorId, input.session);
    }

    if (input.patch.workplaceId !== undefined && input.patch.workplaceId !== null) {
      const workplaceExists = (await this.db.listWorkplaces()).some((workplace) => workplace.id === input.patch.workplaceId);
      if (!workplaceExists) {
        throw new Error(`Workplace not found: ${input.patch.workplaceId}`);
      }
    }

    const updatedEmployee = normalizeEmployeeCardForPersistence(applyEmployeeCardUpdate(employee, input.patch));
    const saved = await this.db.updateEmployee(updatedEmployee);
    const isLeaveAdjustment = Object.prototype.hasOwnProperty.call(input.patch, "annualLeaveAdjustmentDays");
    let leaveBalanceAdjustment: LeaveBalanceAdjustment | undefined;
    if (isLeaveAdjustment) {
      const delta = (saved.annualLeaveAdjustmentDays ?? 0) - (employee.annualLeaveAdjustmentDays ?? 0);
      if (delta !== 0) {
        leaveBalanceAdjustment = await this.db.addLeaveBalanceAdjustment({
          id: await this.db.nextId("leave-adjustment"),
          employeeId: saved.id,
          days: delta,
          reason: input.reason?.trim() || "직원카드에서 연차 HR 보정",
          createdBy: actorId,
          createdAt: this.clock()
        });
      }
    }
    const hasLeaveBalanceAdjustment = leaveBalanceAdjustment !== undefined;
    const auditLog = await this.addAuditLog({
      actorId,
      action: hasLeaveBalanceAdjustment ? "ANNUAL_LEAVE_BALANCE_ADJUSTED" : "EMPLOYEE_CARD_UPDATED",
      targetType: "Employee",
      targetId: saved.id,
      detail: input.reason ?? Object.keys(input.patch).sort().join(", ")
    });

    return { employee: saved, leaveBalanceAdjustment, auditLog };
  }

  async revealEmployeeSensitiveData(input: RevealEmployeeSensitiveDataInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);
    const employee = await this.findEmployee(input.employeeId);

    const auditLog = await this.addAuditLog({
      actorId,
      action: "EMPLOYEE_SENSITIVE_DATA_VIEWED",
      targetType: "Employee",
      targetId: input.employeeId,
      detail: "residentRegistrationNumber,address,mobile,emergencyContact,familyRelations,payrollBank,payrollAccount"
    });

    return { employee, auditLog };
  }

  async clockAttendance(input: ClockAttendanceInput) {
    const employee = await this.findEmployee(input.employeeId);
    await this.assertCanReadEmployee(input.employeeId, input.session);
    assertActiveEmployment(employee, "clock attendance");

    // Authenticated HTTP requests use the server clock; `now` remains injectable for deterministic tests.
    const now = input.session ? this.clock() : input.now ?? this.clock();
    const existing = await this.db.findAttendanceByEmployeeDate(input.employeeId, now.slice(0, 10));
    if (input.type === "CLOCK_IN" && existing?.clockInAt) {
      throw new Error("이미 출근 처리된 날짜입니다.");
    }
    if (input.type === "CLOCK_OUT" && !existing?.clockInAt) {
      throw new Error("출근 기록 후 퇴근 처리할 수 있습니다.");
    }
    if (input.type === "CLOCK_OUT" && existing?.clockOutAt) {
      throw new Error("이미 퇴근 처리된 날짜입니다.");
    }
    const settings = await this.db.getSettings();
    const scheduledEndHour = settings.workDays.includes(workDayCode(now))
      ? Number(settings.workEndTime.slice(0, 2))
      : 0;
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
    const attendance = await this.db.upsertAttendanceRecord(
      buildAttendanceRecord({
        employeeId: input.employeeId,
        type: input.type,
        verification,
        existing,
        now,
        scheduledEndHour: input.session ? scheduledEndHour : input.scheduledEndHour ?? scheduledEndHour
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
    const employee = await this.findEmployee(input.employeeId);
    await this.assertCanReadEmployee(input.employeeId, input.session);
    assertActiveEmployment(employee, "submit leave");
    const actorId = this.resolveActorId(input, input.employeeId);
    const settings = await this.db.getSettings();
    const leaveRequests = await this.db.listLeaveRequests();
    this.assertLeaveRequest(input, employee, leaveRequests, settings);
    const reason = requiredText(input.reason, "Leave request reason");

    const request: LeaveRequest = {
      id: await this.db.nextId("leave"),
      employeeId: input.employeeId,
      type: input.type,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      days: input.days,
      reason,
      status: "PENDING"
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
    const employee = await this.findEmployee(input.employeeId);
    await this.assertCanReadEmployee(input.employeeId, input.session);
    assertActiveEmployment(employee, "submit overtime");
    const actorId = this.resolveActorId(input, input.employeeId);
    await this.assertEmployee(actorId);
    const { date, minutes, reason } = validateOvertimeRequestInput(input);

    const request: OvertimeRequest = {
      id: await this.db.nextId("ot"),
      employeeId: input.employeeId,
      date,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      minutes,
      reason,
      status: "PENDING",
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
    assertRequestDecisionStatus(input.status);

    if (input.targetType === "LeaveRequest") {
      const request = await this.findLeaveRequest(input.requestId);
      await this.assertCanApprove(actorId, input.session, request.employeeId);
      assertPendingRequest(request.status);
      const saved = await this.db.updateLeaveRequest({
        ...request,
        status: input.status,
        decidedBy: actorId,
        decidedAt: this.clock()
      });
      const auditLog = await this.auditStatusChange(actorId, input.targetType, saved.id, input.status, input.detail);

      return { request: saved, auditLog };
    }

    if (input.targetType !== "OvertimeRequest") {
      throw new Error(`Unsupported request type: ${String(input.targetType)}`);
    }

    const request = await this.findOvertimeRequest(input.requestId);
    await this.assertCanApprove(actorId, input.session, request.employeeId);
    assertPendingRequest(request.status);
    const saved = await this.db.updateOvertimeRequest({
      ...request,
      status: input.status,
      decidedBy: actorId,
      decidedAt: this.clock()
    });
    const auditLog = await this.auditStatusChange(actorId, input.targetType, saved.id, input.status, input.detail);

    return { request: saved, auditLog };
  }

  async cancelRequest(input: CancelRequestInput) {
    if (input.targetType === "LeaveRequest") {
      const request = await this.findLeaveRequest(input.requestId);
      await this.assertCanReadEmployee(request.employeeId, input.session);
      assertPendingRequest(request.status);
      const resolvedActorId = this.resolveActorId(input, request.employeeId);
      const saved = await this.db.updateLeaveRequest({ ...request, status: "CANCELLED", decidedBy: resolvedActorId, decidedAt: this.clock() });
      const auditLog = await this.auditStatusChange(
        resolvedActorId,
        input.targetType,
        saved.id,
        "CANCELLED",
        input.detail ?? "신청자가 요청을 취소했습니다."
      );
      return { request: saved, auditLog };
    }

    if (input.targetType === "AttendanceCorrectionRequest") {
      const request = await this.findCorrectionRequest(input.requestId);
      await this.assertCanReadEmployee(request.employeeId, input.session);
      assertPendingRequest(request.status);
      const resolvedActorId = this.resolveActorId(input, request.employeeId);
      const saved = await this.db.updateCorrectionRequest({ ...request, status: "CANCELLED", decidedBy: resolvedActorId, decidedAt: this.clock() });
      const auditLog = await this.addAuditLog({
        actorId: resolvedActorId,
        action: "ATTENDANCE_CORRECTION_REQUEST_CANCELLED",
        targetType: input.targetType,
        targetId: saved.id,
        detail: input.detail ?? "신청자가 근태 정정 신청을 취소했습니다."
      });
      return { request: saved, auditLog };
    }

    const request = await this.findOvertimeRequest(input.requestId);
    await this.assertCanReadEmployee(request.employeeId, input.session);
    assertPendingRequest(request.status);
    const resolvedActorId = this.resolveActorId(input, request.employeeId);
    const saved = await this.db.updateOvertimeRequest({ ...request, status: "CANCELLED", decidedBy: resolvedActorId, decidedAt: this.clock() });
    const auditLog = await this.auditStatusChange(
      resolvedActorId,
      input.targetType,
      saved.id,
      "CANCELLED",
      input.detail ?? "신청자가 요청을 취소했습니다."
    );

    return { request: saved, auditLog };
  }

  async setOvertimePayApproval(input: SetOvertimePayApprovalInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);

    const request = await this.findOvertimeRequest(input.requestId);
    if (request.status !== "APPROVED") {
      throw new Error("Overtime pay approval requires an approved overtime request");
    }
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
    assertCorrectionType(input.type);
    const attendance = (await this.db.listAttendanceRecords()).find((record) => record.id === input.attendanceId);
    if (!attendance || attendance.employeeId !== input.employeeId) {
      throw new Error("Attendance record not found");
    }
    const afterValue = requiredText(input.afterValue, "Corrected attendance value");
    const reason = requiredText(input.reason, "Correction reason");
    if (!isValidTimestamp(afterValue)) {
      throw new Error("Corrected attendance value is invalid");
    }
    assertCorrectionDate(attendance.date, afterValue);

    const correction: AttendanceCorrection = {
      id: await this.db.nextId("corr"),
      attendanceId: input.attendanceId,
      employeeId: input.employeeId,
      correctedById,
      type: input.type,
      beforeValue: input.beforeValue,
      afterValue,
      reason,
      createdAt: input.createdAt ?? this.clock()
    };
    const applied = await this.applyAttendanceCorrection({
      attendance,
      type: input.type,
      requestedValue: afterValue,
      reason
    }, correctedById);
    const saved = await this.db.addCorrection(correction);
    const auditLog = await this.addAuditLog({
      actorId: correctedById,
      action: "ATTENDANCE_CORRECTION_CREATED",
      targetType: "AttendanceRecord",
      targetId: input.attendanceId,
      detail: `${input.type}: ${reason}`
    });

    return { correction: saved, ...applied, auditLog };
  }

  async submitAttendanceCorrectionRequest(input: SubmitAttendanceCorrectionRequestInput) {
    const employee = await this.findEmployee(input.employeeId);
    await this.assertCanReadEmployee(input.employeeId, input.session);
    assertActiveEmployment(employee, "submit attendance correction");
    assertCorrectionType(input.type);
    const requestedValue = requiredText(input.requestedValue, "Requested attendance time");
    const reason = requiredText(input.reason, "Correction reason");
    if (!isValidTimestamp(requestedValue)) {
      throw new Error("Requested attendance time is invalid");
    }
    if (input.attendanceId) {
      const attendance = (await this.db.listAttendanceRecords()).find((record) => record.id === input.attendanceId);
      if (!attendance || attendance.employeeId !== input.employeeId) {
        throw new Error("Attendance record not found");
      }
      assertCorrectionDate(attendance.date, requestedValue);
    }

    const request: AttendanceCorrectionRequest = {
      id: await this.db.nextId("correction-request"),
      attendanceId: input.attendanceId,
      employeeId: input.employeeId,
      type: input.type,
      beforeValue: normalizeOptionalText(input.beforeValue),
      requestedValue,
      reason,
      status: "PENDING",
      createdAt: input.createdAt ?? this.clock()
    };
    const saved = await this.db.addCorrectionRequest(request);
    const auditLog = await this.addAuditLog({
      actorId: input.employeeId,
      action: "ATTENDANCE_CORRECTION_REQUESTED",
      targetType: "AttendanceCorrectionRequest",
      targetId: saved.id,
      detail: `${saved.type}: ${saved.reason}`
    });

    return { request: saved, auditLog };
  }

  async updateAttendanceCorrectionRequestStatus(input: UpdateAttendanceCorrectionRequestStatusInput) {
    const actorId = this.resolveActorId(input, input.actorId);
    const request = await this.findCorrectionRequest(input.requestId);
    await this.assertCanApprove(actorId, input.session, request.employeeId);
    if (request.status !== "PENDING") {
      throw new Error(`Only pending correction requests can be decided. Current status: ${request.status}`);
    }
    if (input.status === "APPROVED") {
      if (request.attendanceId) {
        await this.assertCorrectionAttendance(request);
      } else {
        await this.assertMissingAttendanceAvailable(request);
      }
    }

    const saved = await this.db.updateCorrectionRequest({
      ...request,
      status: input.status,
      decidedBy: actorId,
      decidedAt: this.clock()
    });
    let correction: AttendanceCorrection | undefined;
    let attendance: AttendanceRecord | undefined;
    let earlyLeaveLedger: EarlyLeaveLedger | undefined;
    if (input.status === "APPROVED") {
      correction = request.attendanceId
        ? await this.db.addCorrection({
            id: await this.db.nextId("corr"),
            attendanceId: request.attendanceId,
            employeeId: request.employeeId,
            correctedById: actorId,
            type: request.type,
            beforeValue: request.beforeValue,
            afterValue: request.requestedValue,
            reason: request.reason,
            createdAt: this.clock()
          })
        : await this.createMissingAttendanceCorrection(request, actorId);
      if (request.attendanceId) {
        const target = await this.findAttendanceRecord(request.attendanceId, request.employeeId);
        const applied = await this.applyAttendanceCorrection({
          attendance: target,
          type: request.type,
          requestedValue: request.requestedValue,
          reason: request.reason
        }, actorId);
        attendance = applied.attendance;
        earlyLeaveLedger = applied.earlyLeaveLedger;
      }
    }
    const auditLog = await this.addAuditLog({
      actorId,
      action: `ATTENDANCE_CORRECTION_REQUEST_${input.status}`,
      targetType: "AttendanceCorrectionRequest",
      targetId: saved.id,
      detail: input.detail ?? `${saved.type} ${input.status === "APPROVED" ? "승인" : "반려"}`
    });

    if (!request.attendanceId && input.status === "APPROVED") {
      const createdAttendance = await this.findAttendanceByCorrectionRequest(request);
      attendance = createdAttendance;
    }

    return { request: saved, correction, attendance, earlyLeaveLedger, auditLog };
  }

  async uploadPayrollStatement(input: UploadPayrollStatementInput) {
    await this.assertEmployee(input.employeeId);
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);
    const filename = validatePayrollFilename(input.filename);
    const month = validatePayrollMonth(input.month);
    await this.assertPayrollMonthAvailable(input.employeeId, month);
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

  async registerUploadedPayrollStatement(input: RegisterUploadedPayrollStatementInput) {
    await this.assertEmployee(input.employeeId);
    const actorId = this.resolveActorId(input, input.actorId);
    await this.assertAdmin(actorId, input.session);
    const filename = validatePayrollFilename(input.filename);
    const month = validatePayrollMonth(input.month);
    const storagePath = this.validateRegisteredPayrollStoragePath(input.employeeId, month, filename, input.storagePath);
    await this.assertPayrollMonthAvailable(input.employeeId, month);
    const statement: PayrollStatement = {
      id: await this.db.nextId("pay"),
      employeeId: input.employeeId,
      month,
      filename,
      storagePath,
      uploadedBy: actorId,
      uploadedAt: input.uploadedAt ?? this.clock()
    };
    const saved = await this.db.addPayrollStatement(statement);
    const auditLog = await this.addAuditLog({
      actorId,
      action: "PAYROLL_STATEMENT_REGISTERED",
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
    const [auditLogs, employees] = await Promise.all([this.db.listAuditLogs(), this.db.listEmployees()]);
    const visibleEmployeeIds = this.visibleEmployeeIds(filter.session, employees);
    const visibleTargetIds = await this.visibleAuditTargetIds(filter.session, visibleEmployeeIds);
    const logs = this.filterAuditLogsBySession(auditLogs, filter.session, visibleTargetIds)
      .filter((log) => !filter.actorId || log.actorId === filter.actorId)
      .filter((log) => !filter.targetType || log.targetType === filter.targetType)
      .filter((log) => !filter.targetId || log.targetId === filter.targetId)
      .filter((log) => !filter.action || log.action === filter.action);

    return typeof filter.limit === "number" ? logs.slice(0, filter.limit) : logs;
  }

  private async createMissingAttendanceCorrection(request: AttendanceCorrectionRequest, actorId: string) {
    const requestedAt = request.requestedValue;
    const date = await this.assertMissingAttendanceAvailable(request);

    const verification = {
      id: await this.db.nextId("ver"),
      employeeId: request.employeeId,
      method: "MANUAL_CLICK" as const,
      status: "MANUAL_REVIEW_REQUIRED" as const,
      attemptedAt: requestedAt,
      note: "근태 정정 승인으로 누락 기록 생성"
    };
    await this.db.addVerificationAttempt(verification);
    const createsClockOut = request.type === "CLOCK_OUT_CORRECTION" || request.type === "APPROVED_EARLY_LEAVE";
    const attendance = await this.db.upsertAttendanceRecord({
      id: `att-${date}-${request.employeeId}`,
      employeeId: request.employeeId,
      date,
      clockInAt: createsClockOut ? undefined : requestedAt,
      clockOutAt: createsClockOut ? requestedAt : undefined,
      status: verification.status,
      verificationId: verification.id,
      earlyLeaveMinutes: 0
    });

    return await this.db.addCorrection({
      id: await this.db.nextId("corr"),
      attendanceId: attendance.id,
      employeeId: request.employeeId,
      correctedById: actorId,
      type: request.type,
      beforeValue: request.beforeValue,
      afterValue: request.requestedValue,
      reason: request.reason,
      createdAt: this.clock()
    });
  }

  private async applyAttendanceCorrection(
    input: {
      attendance: AttendanceRecord;
      type: CorrectionType;
      requestedValue: string;
      reason: string;
    },
    actorId: string
  ) {
    const correctsClockIn = input.type === "CLOCK_IN_CORRECTION" || input.type === "APPROVED_LATE";
    const correctsClockOut = input.type === "CLOCK_OUT_CORRECTION" || input.type === "APPROVED_EARLY_LEAVE";
    if (!correctsClockIn && !correctsClockOut) {
      return { attendance: input.attendance };
    }

    const attendance: AttendanceRecord = {
      ...input.attendance,
      clockInAt: correctsClockIn ? input.requestedValue : input.attendance.clockInAt,
      clockOutAt: correctsClockOut ? input.requestedValue : input.attendance.clockOutAt
    };
    let earlyLeaveLedger: EarlyLeaveLedger | undefined;
    if (correctsClockOut) {
      const settings = await this.db.getSettings();
      const scheduledEndHour = settings.workDays.includes(workDayCode(attendance.date))
        ? Number(settings.workEndTime.slice(0, 2))
        : 0;
      attendance.earlyLeaveMinutes = calculateEarlyLeaveMinutes(input.requestedValue, scheduledEndHour);
      earlyLeaveLedger = await this.syncCorrectedEarlyLeaveLedger(
        attendance,
        input.type === "APPROVED_EARLY_LEAVE" ? "APPROVED" : "CORRECTED",
        input.reason,
        actorId
      );
    }

    return {
      attendance: await this.db.upsertAttendanceRecord(attendance),
      earlyLeaveLedger
    };
  }

  private async findAttendanceRecord(attendanceId: string, employeeId: string) {
    const attendance = (await this.db.listAttendanceRecords()).find((record) => record.id === attendanceId);
    if (!attendance || attendance.employeeId !== employeeId) {
      throw new Error("Attendance record not found");
    }
    return attendance;
  }

  private async findAttendanceByCorrectionRequest(request: AttendanceCorrectionRequest) {
    const date = normalizeDateOnly(request.requestedValue.slice(0, 10), "근태 정정일", true)!;
    const attendance = await this.db.findAttendanceByEmployeeDate(request.employeeId, date);
    if (!attendance) {
      throw new Error("Attendance record was not created for the approved correction");
    }
    return attendance;
  }

  private async assertCorrectionAttendance(request: AttendanceCorrectionRequest) {
    await this.findAttendanceRecord(request.attendanceId!, request.employeeId);
  }

  private async assertMissingAttendanceAvailable(request: AttendanceCorrectionRequest) {
    const date = normalizeDateOnly(request.requestedValue.slice(0, 10), "근태 정정일", true)!;
    if (await this.db.findAttendanceByEmployeeDate(request.employeeId, date)) {
      throw new Error("Attendance record already exists for the correction date");
    }
    return date;
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

  private async syncCorrectedEarlyLeaveLedger(
    attendance: { id: string; employeeId: string; date: string; earlyLeaveMinutes: number },
    status: EarlyLeaveLedger["status"],
    reason: string,
    actorId: string
  ) {
    const entry: EarlyLeaveLedger = {
      id: `early-${attendance.id}`,
      employeeId: attendance.employeeId,
      date: attendance.date,
      minutes: attendance.earlyLeaveMinutes,
      status,
      reason: `${reason} (처리자: ${actorId})`
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

  private async assertSystemAdmin(employeeId: string, session?: AuthSession) {
    const employee = (await this.db.listEmployees()).find((item) => item.id === employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    if (session) {
      this.assertSessionActor(session, employeeId);
      if (session.role !== "SYSTEM_ADMIN") {
        throw new Error(`System administrator permission required: ${employeeId}`);
      }
      return;
    }

    if (employee.role !== "SYSTEM_ADMIN") {
      throw new Error(`System administrator permission required: ${employeeId}`);
    }
  }

  private async assertCanApprove(employeeId: string, session?: AuthSession, targetEmployeeId?: string) {
    const employee = (await this.db.listEmployees()).find((item) => item.id === employeeId);
    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    if (employee.role !== "APPROVER" && employee.role !== "HR_ADMIN" && employee.role !== "SYSTEM_ADMIN") {
      throw new Error(`Approval permission required: ${employeeId}`);
    }

    if (employee.role === "APPROVER" && targetEmployeeId) {
      const target = await this.findEmployee(targetEmployeeId);
      if (target.approverId !== employeeId) {
        throw new Error(`Approval scope denied: ${employeeId} -> ${targetEmployeeId}`);
      }
    }

    if (session) {
      this.assertSessionActor(session, employeeId);
      if (!canApproveRequests(session)) {
        throw new Error(`Approval permission required: ${employeeId}`);
      }
      return;
    }
  }

  private async assertCanReadEmployee(employeeId: string, session?: AuthSession) {
    const employee = await this.findEmployee(employeeId);
    this.assertCanReadEmployeeRecord(employeeId, session, employee);
  }

  private assertCanReadEmployeeRecord(employeeId: string, session: AuthSession | undefined, employee?: Employee) {
    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    if (!session || isAdminSession(session) || session.employeeId === employeeId) {
      return;
    }

    if (session.role === "APPROVER" && employee.approverId === session.employeeId) {
      return;
    }

    throw new Error(`Employee access denied: ${session.employeeId} -> ${employeeId}`);
  }

  private getEmployeeAccountStatesFromRows(session: AuthSession, employees: Employee[], accounts: EmployeeAuthAccount[]) {
    this.assertSessionActor(session, session.employeeId);
    const actor = employees.find((employee) => employee.id === session.employeeId);
    if (!actor || !isAdminSession(session) || (actor.role !== "HR_ADMIN" && actor.role !== "SYSTEM_ADMIN")) {
      throw new Error(`Admin permission required: ${session.employeeId}`);
    }

    return accounts.map((account): EmployeeAccountState => ({
      employeeId: account.employeeId,
      loginId: account.loginId,
      enabled: !account.disabledAt,
      passwordChangedAt: account.passwordChangedAt,
      lastSignedInAt: account.lastSignedInAt
    }));
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

    if (session.role === "APPROVER") {
      return new Set(
        employees
          .filter((employee) => employee.id === session.employeeId || employee.approverId === session.employeeId)
          .map((employee) => employee.id)
      );
    }

    return new Set([session.employeeId]);
  }

  private filterAuditLogsBySession(logs: AuditLog[], session?: AuthSession, visibleTargetIds?: Set<string>) {
    if (!session || isAdminSession(session)) {
      return logs;
    }

    return logs.filter((log) => log.actorId === session.employeeId || Boolean(visibleTargetIds?.has(log.targetId)));
  }

  private async visibleAuditTargetIds(session: AuthSession | undefined, visibleEmployeeIds: Set<string>) {
    if (!session || isAdminSession(session)) {
      return undefined;
    }

    const [attendance, leaveRequests, overtimeRequests, corrections, correctionRequests, payrollStatements, dailyWorkTasks] = await Promise.all([
      this.db.listAttendanceRecords(),
      this.db.listLeaveRequests(),
      this.db.listOvertimeRequests(),
      this.db.listCorrections(),
      this.db.listCorrectionRequests(),
      this.db.listPayrollStatements(true),
      this.db.listDailyWorkTasks()
    ]);
    const visible = <T extends { employeeId: string }>(rows: T[]) => rows.filter((row) => visibleEmployeeIds.has(row.employeeId));

    return new Set([
      ...visibleEmployeeIds,
      ...visible(attendance).map((record) => record.id),
      ...visible(leaveRequests).map((request) => request.id),
      ...visible(overtimeRequests).map((request) => request.id),
      ...visible(corrections).flatMap((correction) => [correction.id, correction.attendanceId]),
      ...visible(correctionRequests).map((request) => request.id),
      ...visible(payrollStatements).map((statement) => statement.id),
      ...visible(dailyWorkTasks).map((task) => task.id)
    ]);
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

  private async assertPayrollMonthAvailable(employeeId: string, month: string) {
    const activeStatements = await this.db.listPayrollStatements(false);
    if (activeStatements.some((statement) => statement.employeeId === employeeId && statement.month === month)) {
      throw new Error(`Payroll statement already exists for ${employeeId} ${month}. Delete the active statement before replacing it.`);
    }
  }

  private async findOvertimeRequest(requestId: string) {
    const request = (await this.db.listOvertimeRequests()).find((item) => item.id === requestId);
    if (!request) {
      throw new Error(`Overtime request not found: ${requestId}`);
    }

    return request;
  }

  private async findCorrectionRequest(requestId: string) {
    const request = (await this.db.listCorrectionRequests()).find((item) => item.id === requestId);
    if (!request) {
      throw new Error(`Attendance correction request not found: ${requestId}`);
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

  private buildNewEmployee(input: CreateEmployeeAccountInput["employee"]): Omit<Employee, "id"> {
    const employeeNumber = input.employeeNumber?.trim().toUpperCase();
    if (!employeeNumber || !/^[A-Z0-9][A-Z0-9-]{1,63}$/.test(employeeNumber)) {
      throw new Error("Employee number must use 2-64 uppercase letters, numbers, or hyphens.");
    }
    if (!input.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.hireDate)) {
      throw new Error("Employee name and hire date are required.");
    }

    return { ...input, name: input.name.trim(), employeeNumber, pilot: input.pilot ?? false };
  }

  private async assertEmployeeNumberAvailable(employeeNumber: string) {
    const normalized = employeeNumber.toUpperCase();
    if ((await this.db.listEmployees()).some((employee) => employee.employeeNumber?.trim().toUpperCase() === normalized)) {
      throw new Error(`Employee number already exists: ${employeeNumber}`);
    }
  }

  private async assertLoginIdAvailable(value: string) {
    const loginId = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(loginId)) {
      throw new Error("Login ID must use 3-64 lowercase letters, numbers, dots, hyphens, or underscores.");
    }
    if ((await this.db.listEmployeeAccounts()).some((account) => account.loginId.trim().toLowerCase() === loginId)) {
      throw new Error(`Login ID already exists: ${loginId}`);
    }
    return loginId;
  }

  private async requireEmployeeAccount(employeeId: string) {
    const account = await this.db.findEmployeeAccount(employeeId);
    if (!account) {
      throw new Error(`Employee account not found: ${employeeId}`);
    }
    return account;
  }

  private validateRegisteredPayrollStoragePath(employeeId: string, month: string, filename: string, storagePath: string) {
    const expectedPrefix = `${employeeId}/${month}/`;
    if (!storagePath.startsWith(expectedPrefix) || storagePath === expectedPrefix) {
      throw new Error("Payroll storage path must match the employee payroll path.");
    }
    return storagePath;
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

  private assertLeaveRequest(input: SubmitLeaveRequestInput, employee: Employee, requests: LeaveRequest[], settings: import("./types.js").SystemPolicy) {
    const startsOn = normalizeDateOnly(input.startsOn, "휴가 시작일", true)!;
    const endsOn = normalizeDateOnly(input.endsOn, "휴가 종료일", true)!;
    if (endsOn < startsOn) throw new Error("Leave period is invalid");
    requiredText(input.reason, "Leave request reason");
    if (!Number.isFinite(input.days) || input.days <= 0) {
      throw new Error("Leave days must be greater than zero");
    }
    if (input.type === "HALF_DAY" && (!settings.partialLeaveAllowed || input.days !== 0.5)) {
      throw new Error("Half-day leave is not allowed by the current policy");
    }
    if ((input.type === "ANNUAL" || input.type === "HALF_DAY") && Math.abs(input.days / settings.annualLeaveUnit - Math.round(input.days / settings.annualLeaveUnit)) > 0.0001) {
      throw new Error(`Leave must be requested in ${settings.annualLeaveUnit}-day units`);
    }
    const calendarDays = inclusiveCalendarDays(startsOn, endsOn);
    const expectedDays = input.type === "HALF_DAY" ? (calendarDays === 1 ? 0.5 : undefined) : calendarDays;
    if (expectedDays === undefined || Math.abs(input.days - expectedDays) > 0.0001) {
      throw new Error("Leave days must match the selected date range");
    }
    if ((input.type !== "ANNUAL" && input.type !== "HALF_DAY") || settings.annualLeaveOveruseAllowed) return;

    const balance = getLeaveBalance({ employee, asOf: this.clock(), approvedRequests: requests, policy: settings });
    const pendingDays = requests
      .filter((request) => request.employeeId === employee.id && request.status === "PENDING" && (request.type === "ANNUAL" || request.type === "HALF_DAY"))
      .reduce((sum, request) => sum + request.days, 0);
    if (input.days > balance.availableDays - pendingDays) {
      throw new Error("Requested leave exceeds the available balance");
    }
  }
}

function normalizeEmployeeCardForPersistence(employee: Employee): Employee {
  return {
    ...employee,
    name: employee.name.trim(),
    position: normalizeOptionalText(employee.position),
    hireDate: normalizeDateOnly(employee.hireDate, "입사일", true)!,
    birthday: normalizeDateOnly(employee.birthday, "생일"),
    terminationDate: normalizeDateOnly(employee.terminationDate, "퇴사일"),
    residentRegistrationNumber: normalizeOptionalText(employee.residentRegistrationNumber),
    address: normalizeOptionalText(employee.address),
    mobile: normalizeOptionalText(employee.mobile),
    emergencyContact: normalizeOptionalText(employee.emergencyContact),
    familyRelations: normalizeOptionalText(employee.familyRelations),
    payrollBank: normalizeOptionalText(employee.payrollBank),
    payrollAccount: normalizeOptionalText(employee.payrollAccount)
  };
}

function assertSystemPolicy(settings: import("./types.js").SystemPolicy) {
  const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const validWorkDays = new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

  if (!Number.isInteger(settings.gpsAllowedRadiusMeters) || settings.gpsAllowedRadiusMeters < 50 || settings.gpsAllowedRadiusMeters > 5_000) {
    throw new Error("GPS allowed radius must be an integer between 50 and 5000 meters");
  }
  if (settings.timezone !== "Asia/Seoul") {
    throw new Error("Unsupported work timezone");
  }
  if (![settings.workStartTime, settings.workEndTime, settings.breakStartTime, settings.breakEndTime].every(validTime)
    || settings.workStartTime >= settings.workEndTime
    || settings.breakStartTime < settings.workStartTime
    || settings.breakStartTime >= settings.breakEndTime
    || settings.breakEndTime > settings.workEndTime) {
    throw new Error("Work and break times must form a valid schedule");
  }
  if (settings.workDays.length === 0
    || new Set(settings.workDays).size !== settings.workDays.length
    || settings.workDays.some((day) => !validWorkDays.has(day))) {
    throw new Error("At least one valid, unique work day is required");
  }
  if (settings.payrollHolidayDates.length > 100
    || new Set(settings.payrollHolidayDates).size !== settings.payrollHolidayDates.length
    || settings.payrollHolidayDates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new Error("Payroll holiday dates must use unique YYYY-MM-DD values");
  }
  if (settings.annualLeaveUnit !== 0.5 && settings.annualLeaveUnit !== 1) {
    throw new Error("Annual leave unit must be 0.5 or 1 day");
  }
}

function normalizeWorkplace(workplace: Workplace): Workplace {
  const name = workplace.name.trim();
  const qrPath = workplace.qrPath.trim();
  if (!name || name.length > 80) {
    throw new Error("Workplace name is required and must be 80 characters or fewer");
  }
  if (!Number.isFinite(workplace.latitude) || workplace.latitude < -90 || workplace.latitude > 90) {
    throw new Error("Workplace latitude must be between -90 and 90");
  }
  if (!Number.isFinite(workplace.longitude) || workplace.longitude < -180 || workplace.longitude > 180) {
    throw new Error("Workplace longitude must be between -180 and 180");
  }
  if (!Number.isInteger(workplace.allowedRadiusMeters) || workplace.allowedRadiusMeters < 50 || workplace.allowedRadiusMeters > 5_000) {
    throw new Error("Workplace radius must be an integer between 50 and 5000 meters");
  }
  if (!qrPath.startsWith("/")) {
    throw new Error("Workplace QR path must start with /");
  }
  return { ...workplace, name, qrPath };
}

function redactSensitiveEmployee(employee: Employee): Employee {
  return {
    ...employee,
    residentRegistrationNumber: undefined,
    birthday: undefined,
    address: undefined,
    mobile: undefined,
    emergencyContact: undefined,
    familyRelations: undefined,
    payrollBank: undefined,
    payrollAccount: undefined,
    annualSalary: undefined,
    severancePay: undefined,
    incomeDeductionDependents: undefined,
    customAdminFields: undefined
  };
}

function assertActiveEmployment(employee: Employee, action: string) {
  if ((employee.employmentStatus ?? "ACTIVE") !== "ACTIVE") {
    throw new Error(`Active employment required to ${action}`);
  }
}

function assertPendingRequest(status: RequestStatus) {
  if (status !== "PENDING") {
    throw new Error(`Only pending requests can be decided. Current status: ${status}`);
  }
}

function assertRequestDecisionStatus(status: unknown): asserts status is Extract<RequestStatus, "APPROVED" | "REJECTED"> {
  if (status !== "APPROVED" && status !== "REJECTED") {
    throw new Error("Request status must be APPROVED or REJECTED");
  }
}

function assertCorrectionType(type: unknown): asserts type is CorrectionType {
  if (!["APPROVED_LATE", "APPROVED_EARLY_LEAVE", "CLOCK_IN_CORRECTION", "CLOCK_OUT_CORRECTION", "MISSING_RECORD_CREATED"].includes(type as string)) {
    throw new Error("Unsupported attendance correction type");
  }
}

function assertCorrectionDate(attendanceDate: string, timestamp: string) {
  if (timestamp.slice(0, 10) !== attendanceDate) {
    throw new Error("Correction time must match the attendance date");
  }
}

function workDayCode(timestamp: string): import("./types.js").SystemPolicy["workDays"][number] {
  const date = new Date(`${timestamp.slice(0, 10)}T00:00:00Z`);
  return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][date.getUTCDay()] as import("./types.js").SystemPolicy["workDays"][number];
}

function assertSelfServiceEmployeeCardPatch(patch: UpdateEmployeeCardInput["patch"]) {
  const allowedFields = new Set(["birthday", "address", "mobile", "emergencyContact", "familyRelations", "payrollBank", "payrollAccount"]);
  const restrictedField = Object.keys(patch).find((field) => !allowedFields.has(field));
  if (restrictedField) {
    throw new Error(`Admin permission required for employee-card field: ${restrictedField}`);
  }
}

function normalizeOptionalText(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : undefined;
  return normalized || undefined;
}

function normalizeDateOnly(value: unknown, label: string, required = false) {
  const normalized = typeof value === "string" ? value.trim() : undefined;
  if (!normalized) {
    if (required) {
      throw new Error(`${label} is required`);
    }
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }

  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${label} must be a valid calendar date`);
  }

  return normalized;
}

function inclusiveCalendarDays(startsOn: string, endsOn: string) {
  const start = Date.parse(`${startsOn}T00:00:00Z`);
  const end = Date.parse(`${endsOn}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

function validateOvertimeRequestInput(input: SubmitOvertimeRequestInput) {
  const date = normalizeDateOnly(input.date, "근무일", true)!;
  const reason = requiredText(input.reason, "Overtime request reason");

  if (typeof input.startsAt !== "string" || typeof input.endsAt !== "string") {
    throw new Error("Overtime start and end times are invalid");
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    throw new Error("Overtime start and end times are invalid");
  }
  if (!input.startsAt.startsWith(date)) {
    throw new Error("Overtime start time must match the work date");
  }
  const minutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);
  if (minutes <= 0 || minutes > 24 * 60) {
    throw new Error("Overtime end time must be after the start time and within 24 hours");
  }

  return { date, minutes, reason };
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime()) && value.includes("T");
}

const TEMPORARY_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";

async function createTemporaryCredential() {
  const password = createTemporaryPassword();
  return { password, passwordHash: await hashPassword(password) };
}

function assertTemporaryPassword(value: unknown) {
  if (typeof value !== "string" || value.length < 12) {
    throw new Error("Temporary password must be at least 12 characters long.");
  }
  return value;
}

async function hashPassword(password: string) {
  const salt = randomBase64Url(16);
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) {
    throw new Error("Secure password hashing is unavailable.");
  }
  const derivedKey = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 310_000, hash: "SHA-256" },
    await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]),
    256
  );
  return `pbkdf2_sha256$310000$${salt}$${bytesToBase64Url(new Uint8Array(derivedKey))}`;
}

function createTemporaryPassword() {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    throw new Error("Secure password generation is unavailable.");
  }
  const values = crypto.getRandomValues(new Uint32Array(20));
  return Array.from(values, (value) => TEMPORARY_PASSWORD_ALPHABET[value % TEMPORARY_PASSWORD_ALPHABET.length]).join("");
}

function randomBase64Url(length: number) {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    throw new Error("Secure password generation is unavailable.");
  }
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(length)));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
export const getAppBootstrap = defaultHrApi.getAppBootstrap.bind(defaultHrApi);
export const getDashboard = defaultHrApi.getDashboard.bind(defaultHrApi);
export const getEmployeeSnapshot = defaultHrApi.getEmployeeSnapshot.bind(defaultHrApi);
export const getDailyWorkTasks = defaultHrApi.getDailyWorkTasks.bind(defaultHrApi);
export const updateDailyWorkTaskStatus = defaultHrApi.updateDailyWorkTaskStatus.bind(defaultHrApi);
export const createDailyWorkTaskPlan = defaultHrApi.createDailyWorkTaskPlan.bind(defaultHrApi);
export const updateDailyWorkTaskPlan = defaultHrApi.updateDailyWorkTaskPlan.bind(defaultHrApi);
export const updateEmployeeCard = defaultHrApi.updateEmployeeCard.bind(defaultHrApi);
export const revealEmployeeSensitiveData = defaultHrApi.revealEmployeeSensitiveData.bind(defaultHrApi);
export const createEmployeeAccount = defaultHrApi.createEmployeeAccount.bind(defaultHrApi);
export const importEmployeeAccounts = defaultHrApi.importEmployeeAccounts.bind(defaultHrApi);
export const resetEmployeeAccountPassword = defaultHrApi.resetEmployeeAccountPassword.bind(defaultHrApi);
export const setEmployeeAccountAccess = defaultHrApi.setEmployeeAccountAccess.bind(defaultHrApi);
export const getEmployeeAccountStates = defaultHrApi.getEmployeeAccountStates.bind(defaultHrApi);
export const registerUploadedPayrollStatement = defaultHrApi.registerUploadedPayrollStatement.bind(defaultHrApi);
export const getSettings = defaultHrApi.getSettings.bind(defaultHrApi);
export const updateSettings = defaultHrApi.updateSettings.bind(defaultHrApi);
export const createWorkplace = defaultHrApi.createWorkplace.bind(defaultHrApi);
export const updateWorkplace = defaultHrApi.updateWorkplace.bind(defaultHrApi);
export const deleteWorkplace = defaultHrApi.deleteWorkplace.bind(defaultHrApi);
export const clockAttendance = defaultHrApi.clockAttendance.bind(defaultHrApi);
export const submitLeaveRequest = defaultHrApi.submitLeaveRequest.bind(defaultHrApi);
export const submitOvertimeRequest = defaultHrApi.submitOvertimeRequest.bind(defaultHrApi);
export const updateRequestStatus = defaultHrApi.updateRequestStatus.bind(defaultHrApi);
export const cancelRequest = defaultHrApi.cancelRequest.bind(defaultHrApi);
export const setOvertimePayApproval = defaultHrApi.setOvertimePayApproval.bind(defaultHrApi);
export const createAttendanceCorrection = defaultHrApi.createAttendanceCorrection.bind(defaultHrApi);
export const submitAttendanceCorrectionRequest = defaultHrApi.submitAttendanceCorrectionRequest.bind(defaultHrApi);
export const updateAttendanceCorrectionRequestStatus = defaultHrApi.updateAttendanceCorrectionRequestStatus.bind(defaultHrApi);
export const uploadPayrollStatement = defaultHrApi.uploadPayrollStatement.bind(defaultHrApi);
export const downloadPayrollStatement = defaultHrApi.downloadPayrollStatement.bind(defaultHrApi);
export const softDeletePayrollStatement = defaultHrApi.softDeletePayrollStatement.bind(defaultHrApi);
export const getAuditLogs = defaultHrApi.getAuditLogs.bind(defaultHrApi);
