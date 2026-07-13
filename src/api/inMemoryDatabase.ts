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
} from "../domain/types.js";
import { defaultSystemPolicy, type SystemPolicy } from "./types.js";
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
  overtimeRequests?: OvertimeRequest[];
  corrections?: AttendanceCorrection[];
  payrollStatements?: PayrollStatement[];
  auditLogs?: AuditLog[];
  dailyWorkTasks?: DailyWorkTask[];
  settings?: SystemPolicy;
};

export class InMemoryDatabase implements HrRepository {
  private readonly employees: Employee[];
  private readonly workplaces: Workplace[];
  private readonly attendanceRecords: AttendanceRecord[];
  private readonly verificationAttempts: VerificationAttempt[];
  private readonly leaveRequests: LeaveRequest[];
  private readonly earlyLeaveLedger: EarlyLeaveLedger[];
  private readonly overtimeRequests: OvertimeRequest[];
  private readonly corrections: AttendanceCorrection[];
  private readonly payrollStatements: PayrollStatement[];
  private readonly auditLogs: AuditLog[];
  private readonly dailyWorkTasks: DailyWorkTask[];
  private settings: SystemPolicy;

  constructor(seed: InMemoryDatabaseSeed = {}) {
    this.employees = cloneList(seed.employees ?? employees);
    this.workplaces = cloneList(seed.workplaces ?? workplaces);
    this.attendanceRecords = cloneList(seed.attendanceRecords ?? attendanceRecords);
    this.verificationAttempts = cloneList(seed.verificationAttempts ?? []);
    this.leaveRequests = cloneList(seed.leaveRequests ?? leaveRequests);
    this.earlyLeaveLedger = cloneList(seed.earlyLeaveLedger ?? earlyLeaveLedger);
    this.overtimeRequests = cloneList(seed.overtimeRequests ?? overtimeRequests);
    this.corrections = cloneList(seed.corrections ?? corrections);
    this.payrollStatements = cloneList(seed.payrollStatements ?? payrollStatements);
    this.auditLogs = cloneList(seed.auditLogs ?? auditLogs);
    this.dailyWorkTasks = cloneList(seed.dailyWorkTasks ?? dailyWorkTasks);
    this.settings = cloneItem(seed.settings ?? defaultSystemPolicy);
  }

  listEmployees() {
    return cloneList(this.employees);
  }

  updateEmployee(employee: Employee) {
    const index = this.employees.findIndex((item) => item.id === employee.id);
    if (index < 0) {
      throw new Error(`Employee not found: ${employee.id}`);
    }

    this.employees[index] = cloneItem(employee);
    return cloneItem(this.employees[index]);
  }

  listWorkplaces() {
    return cloneList(this.workplaces);
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
