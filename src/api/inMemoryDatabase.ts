import type {
  AttendanceCorrection,
  AttendanceCorrectionRequest,
  AttendanceRecord,
  AuditLog,
  DailyWorkTask,
  EarlyLeaveLedger,
  Employee,
  LeaveBalanceAdjustment,
  LeaveRequest,
  OvertimeRequest,
  PayrollStatement,
  VerificationAttempt,
  Workplace
} from "../domain/types.js";
import { defaultSystemPolicy, type EmployeeAuthAccount, type SystemPolicy } from "./types.js";
import type { HrRepository } from "./hrRepository.js";
import {
  auditLogs,
  attendanceRecords,
  corrections,
  dailyWorkTasks,
  earlyLeaveLedger,
  employees,
  leaveRequests,
  overtimeRequests,
  payrollStatements,
  workplaces
} from "../domain/seed.js";

export type InMemoryDatabaseSeed = {
  employees?: Employee[];
  workplaces?: Workplace[];
  attendanceRecords?: AttendanceRecord[];
  verificationAttempts?: VerificationAttempt[];
  leaveRequests?: LeaveRequest[];
  earlyLeaveLedger?: EarlyLeaveLedger[];
  leaveBalanceAdjustments?: LeaveBalanceAdjustment[];
  overtimeRequests?: OvertimeRequest[];
  corrections?: AttendanceCorrection[];
  correctionRequests?: AttendanceCorrectionRequest[];
  payrollStatements?: PayrollStatement[];
  auditLogs?: AuditLog[];
  dailyWorkTasks?: DailyWorkTask[];
  employeeAccounts?: EmployeeAuthAccount[];
  settings?: SystemPolicy;
};

export class InMemoryDatabase implements HrRepository {
  private readonly employees: Employee[];
  private readonly workplaces: Workplace[];
  private readonly attendanceRecords: AttendanceRecord[];
  private readonly verificationAttempts: VerificationAttempt[];
  private readonly leaveRequests: LeaveRequest[];
  private readonly earlyLeaveLedger: EarlyLeaveLedger[];
  private readonly leaveBalanceAdjustments: LeaveBalanceAdjustment[];
  private readonly overtimeRequests: OvertimeRequest[];
  private readonly corrections: AttendanceCorrection[];
  private readonly correctionRequests: AttendanceCorrectionRequest[];
  private readonly payrollStatements: PayrollStatement[];
  private readonly auditLogs: AuditLog[];
  private readonly dailyWorkTasks: DailyWorkTask[];
  private readonly employeeAccounts: EmployeeAuthAccount[];
  private settings: SystemPolicy;

  constructor(seed: InMemoryDatabaseSeed = {}) {
    this.employees = cloneList(seed.employees ?? employees);
    this.workplaces = cloneList(seed.workplaces ?? workplaces);
    this.attendanceRecords = cloneList(seed.attendanceRecords ?? attendanceRecords);
    this.verificationAttempts = cloneList(seed.verificationAttempts ?? []);
    this.leaveRequests = cloneList(seed.leaveRequests ?? leaveRequests);
    this.earlyLeaveLedger = cloneList(seed.earlyLeaveLedger ?? earlyLeaveLedger);
    this.leaveBalanceAdjustments = cloneList(seed.leaveBalanceAdjustments ?? []);
    this.overtimeRequests = cloneList(seed.overtimeRequests ?? overtimeRequests);
    this.corrections = cloneList(seed.corrections ?? corrections);
    this.correctionRequests = cloneList(seed.correctionRequests ?? []);
    this.payrollStatements = cloneList(seed.payrollStatements ?? payrollStatements);
    this.auditLogs = cloneList(seed.auditLogs ?? auditLogs);
    this.dailyWorkTasks = cloneList(seed.dailyWorkTasks ?? dailyWorkTasks);
    this.employeeAccounts = cloneList(seed.employeeAccounts ?? []);
    this.settings = cloneItem(seed.settings ?? defaultSystemPolicy);
  }

  listEmployees() {
    return cloneList(this.employees);
  }

  findEmployee(employeeId: string) {
    const employee = this.employees.find((item) => item.id === employeeId);
    return employee ? cloneItem(employee) : undefined;
  }

  updateEmployee(employee: Employee) {
    const index = this.employees.findIndex((item) => item.id === employee.id);
    if (index < 0) {
      throw new Error(`Employee not found: ${employee.id}`);
    }

    this.employees[index] = cloneItem(employee);
    return cloneItem(this.employees[index]);
  }

  createEmployeeWithAccount(employee: Employee, account: EmployeeAuthAccount) {
    if (this.employees.some((item) => item.id === employee.id)) {
      throw new Error(`Employee already exists: ${employee.id}`);
    }
    if (this.employees.some((item) => sameEmployeeNumber(item.employeeNumber, employee.employeeNumber))) {
      throw new Error(`Employee number already exists: ${employee.employeeNumber}`);
    }
    if (this.employeeAccounts.some((item) => sameEmployeeNumber(item.employeeNumber, account.employeeNumber))) {
      throw new Error(`Employee number already exists: ${account.employeeNumber}`);
    }
    if (this.employeeAccounts.some((item) => sameLoginId(item.loginId, account.loginId))) {
      throw new Error(`Login ID already exists: ${account.loginId}`);
    }

    this.employees.push(cloneItem(employee));
    this.employeeAccounts.push(cloneItem(account));
    return { employee: cloneItem(employee), account: cloneItem(account) };
  }

  listEmployeeAccounts() {
    return cloneList(this.employeeAccounts);
  }

  findEmployeeAccount(employeeId: string) {
    return cloneItem(this.employeeAccounts.find((account) => account.employeeId === employeeId));
  }

  updateEmployeeAccount(account: EmployeeAuthAccount) {
    const index = this.employeeAccounts.findIndex((item) => item.id === account.id);
    if (index < 0) {
      throw new Error(`Employee account not found: ${account.employeeId}`);
    }

    this.employeeAccounts[index] = cloneItem(account);
    return cloneItem(this.employeeAccounts[index]);
  }

  listWorkplaces() {
    return cloneList(this.workplaces);
  }

  addWorkplace(workplace: Workplace) {
    if (this.workplaces.some((item) => item.id === workplace.id)) {
      throw new Error(`Workplace already exists: ${workplace.id}`);
    }
    this.workplaces.push(cloneItem(workplace));
    return cloneItem(workplace);
  }

  updateWorkplace(workplace: Workplace) {
    const index = this.workplaces.findIndex((item) => item.id === workplace.id);
    if (index < 0) {
      throw new Error(`Workplace not found: ${workplace.id}`);
    }
    this.workplaces[index] = cloneItem(workplace);
    return cloneItem(this.workplaces[index]);
  }

  deleteWorkplace(workplaceId: string) {
    const index = this.workplaces.findIndex((item) => item.id === workplaceId);
    if (index < 0) {
      throw new Error(`Workplace not found: ${workplaceId}`);
    }
    const [deleted] = this.workplaces.splice(index, 1);
    return cloneItem(deleted);
  }

  listAttendanceRecords() {
    return cloneList(this.attendanceRecords);
  }

  findAttendanceByEmployeeDate(employeeId: string, date: string) {
    return cloneItem(this.attendanceRecords.find((record) => record.employeeId === employeeId && record.date === date));
  }

  upsertAttendanceRecord(record: AttendanceRecord) {
    const index = this.attendanceRecords.findIndex((item) => item.id === record.id);

    if (index >= 0) {
      this.attendanceRecords[index] = cloneItem(record);
      return cloneItem(this.attendanceRecords[index]);
    }

    this.attendanceRecords.unshift(cloneItem(record));
    return cloneItem(record);
  }

  addVerificationAttempt(attempt: VerificationAttempt) {
    this.verificationAttempts.unshift(cloneItem(attempt));
    return cloneItem(attempt);
  }

  listLeaveRequests() {
    return cloneList(this.leaveRequests);
  }

  addLeaveRequest(request: LeaveRequest) {
    this.leaveRequests.unshift(cloneItem(request));
    return cloneItem(request);
  }

  updateLeaveRequest(request: LeaveRequest) {
    const index = this.leaveRequests.findIndex((item) => item.id === request.id);
    if (index < 0) {
      throw new Error(`Leave request not found: ${request.id}`);
    }

    this.leaveRequests[index] = cloneItem(request);
    return cloneItem(this.leaveRequests[index]);
  }

  listLeaveBalanceAdjustments() {
    return cloneList(this.leaveBalanceAdjustments);
  }

  addLeaveBalanceAdjustment(adjustment: LeaveBalanceAdjustment) {
    this.leaveBalanceAdjustments.unshift(cloneItem(adjustment));
    return cloneItem(adjustment);
  }

  listEarlyLeaveLedger() {
    return cloneList(this.earlyLeaveLedger);
  }

  upsertEarlyLeaveLedger(entry: EarlyLeaveLedger) {
    const index = this.earlyLeaveLedger.findIndex((item) => item.id === entry.id);

    if (index >= 0) {
      this.earlyLeaveLedger[index] = cloneItem(entry);
      return cloneItem(this.earlyLeaveLedger[index]);
    }

    this.earlyLeaveLedger.unshift(cloneItem(entry));
    return cloneItem(entry);
  }

  listOvertimeRequests() {
    return cloneList(this.overtimeRequests);
  }

  addOvertimeRequest(request: OvertimeRequest) {
    this.overtimeRequests.unshift(cloneItem(request));
    return cloneItem(request);
  }

  updateOvertimeRequest(request: OvertimeRequest) {
    const index = this.overtimeRequests.findIndex((item) => item.id === request.id);
    if (index < 0) {
      throw new Error(`Overtime request not found: ${request.id}`);
    }

    this.overtimeRequests[index] = cloneItem(request);
    return cloneItem(this.overtimeRequests[index]);
  }

  listCorrections() {
    return cloneList(this.corrections);
  }

  addCorrection(correction: AttendanceCorrection) {
    this.corrections.unshift(cloneItem(correction));
    return cloneItem(correction);
  }

  listCorrectionRequests() {
    return cloneList(this.correctionRequests);
  }

  addCorrectionRequest(request: AttendanceCorrectionRequest) {
    this.correctionRequests.unshift(cloneItem(request));
    return cloneItem(request);
  }

  updateCorrectionRequest(request: AttendanceCorrectionRequest) {
    const index = this.correctionRequests.findIndex((item) => item.id === request.id);
    if (index < 0) {
      throw new Error(`Attendance correction request not found: ${request.id}`);
    }

    this.correctionRequests[index] = cloneItem(request);
    return cloneItem(this.correctionRequests[index]);
  }

  listPayrollStatements(includeDeleted = false) {
    const statements = includeDeleted
      ? this.payrollStatements
      : this.payrollStatements.filter((statement) => !statement.deletedAt);

    return cloneList(statements);
  }

  addPayrollStatement(statement: PayrollStatement) {
    this.payrollStatements.unshift(cloneItem(statement));
    return cloneItem(statement);
  }

  updatePayrollStatement(statement: PayrollStatement) {
    const index = this.payrollStatements.findIndex((item) => item.id === statement.id);
    if (index < 0) {
      throw new Error(`Payroll statement not found: ${statement.id}`);
    }

    this.payrollStatements[index] = cloneItem(statement);
    return cloneItem(this.payrollStatements[index]);
  }

  listDailyWorkTasks() {
    return cloneList(this.dailyWorkTasks);
  }

  addDailyWorkTask(task: DailyWorkTask) {
    if (this.dailyWorkTasks.some((item) => item.id === task.id)) {
      throw new Error(`Daily work task already exists: ${task.id}`);
    }

    this.dailyWorkTasks.push(cloneItem(task));
    return cloneItem(task);
  }

  updateDailyWorkTask(task: DailyWorkTask) {
    const index = this.dailyWorkTasks.findIndex((item) => item.id === task.id);
    if (index < 0) {
      throw new Error(`Daily work task not found: ${task.id}`);
    }

    this.dailyWorkTasks[index] = cloneItem(task);
    return cloneItem(this.dailyWorkTasks[index]);
  }

  getSettings() {
    return cloneItem(this.settings);
  }

  updateSettings(settings: Partial<SystemPolicy>) {
    this.settings = {
      ...this.settings,
      ...settings
    };

    return cloneItem(this.settings);
  }

  listAuditLogs() {
    return cloneList(this.auditLogs);
  }

  addAuditLog(log: AuditLog) {
    this.auditLogs.unshift(cloneItem(log));
    return cloneItem(log);
  }

  nextId(prefix: string) {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now()}-${random}`;
  }
}

function cloneList<T extends object>(items: T[]) {
  return items.map((item) => cloneItem(item));
}

function cloneItem<T extends object>(item: T): T;
function cloneItem<T extends object>(item: T | undefined): T | undefined;
function cloneItem<T extends object>(item: T | undefined) {
  return item ? ({ ...item } as T) : undefined;
}

function sameEmployeeNumber(left: string | undefined, right: string | undefined) {
  return Boolean(left && right && left.trim().toUpperCase() === right.trim().toUpperCase());
}

function sameLoginId(left: string | undefined, right: string | undefined) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}
