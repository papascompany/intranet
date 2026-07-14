import { describe, expect, it } from "vitest";
import { InMemoryDatabase } from "./inMemoryDatabase";
import { createHrApi } from "./hrApi";
import type { AuthSession } from "./auth";
import type { HrRepository } from "./hrRepository";

const fixedNow = "2026-07-08T09:00:00+09:00";
const payrollFile = { contentBase64: "JVBERi0xLjQK", contentType: "application/pdf" as const, sizeBytes: 9 };

function api() {
  return createHrApi(new InMemoryDatabase(), () => fixedNow);
}

function asyncRepository(db = new InMemoryDatabase()): HrRepository {
  return new Proxy(db as unknown as Record<PropertyKey, unknown>, {
    get(target, property) {
      const value = target[property];
      if (typeof value !== "function") {
        return value;
      }

      return async (...args: unknown[]) => {
        await Promise.resolve();
        return (value as (...args: unknown[]) => unknown).apply(target, args);
      };
    }
  }) as unknown as HrRepository;
}

const employeeSession: AuthSession = {
  employeeId: "emp-ops-1",
  role: "EMPLOYEE",
  authenticatedAt: fixedNow,
  rememberLogin: false
};

const approverSession: AuthSession = {
  employeeId: "emp-ops-2",
  role: "APPROVER",
  authenticatedAt: fixedNow,
  rememberLogin: false
};

const adminSession: AuthSession = {
  employeeId: "emp-ceo",
  role: "HR_ADMIN",
  authenticatedAt: fixedNow,
  rememberLogin: false
};

describe("hr api", () => {
  it("awaits async repository permission checks before payroll writes", async () => {
    const hrApi = createHrApi(asyncRepository(), () => fixedNow);

    await expect(
      hrApi.uploadPayrollStatement({
        employeeId: "emp-ops-1",
        actorId: employeeSession.employeeId,
        session: employeeSession,
        month: "2026-07",
        filename: "2026-07-payroll-kim.pdf",
        file: payrollFile
      })
    ).rejects.toThrow("Admin permission required");
    await expect(hrApi.getAuditLogs({ action: "PAYROLL_STATEMENT_UPLOADED" })).resolves.toHaveLength(0);
  });

  it("clocks attendance with GPS, calculates early leave, and writes an audit log", async () => {
    const hrApi = api();

    const result = await hrApi.clockAttendance({
      employeeId: "emp-ops-1",
      type: "CLOCK_OUT",
      method: "GPS",
      now: "2026-07-09T16:30:00+09:00",
      coordinate: {
        latitude: 37.5666,
        longitude: 126.9781,
        accuracyMeters: 14
      }
    });

    expect(result.verification.status).toBe("GPS_PASSED");
    expect(result.attendance.clockOutAt).toBe("2026-07-09T16:30:00+09:00");
    expect(result.attendance.earlyLeaveMinutes).toBe(30);
    expect(result.earlyLeaveLedger?.minutes).toBe(30);
    expect(result.auditLog.action).toBe("ATTENDANCE_CLOCKED_OUT");
    await expect(hrApi.getAuditLogs({ action: "ATTENDANCE_CLOCKED_OUT" })).resolves.toHaveLength(1);
  });

  it("persists verification before the attendance record required by Postgres foreign keys", async () => {
    const db = new InMemoryDatabase();
    let verificationPersisted = false;
    const addVerificationAttempt = db.addVerificationAttempt.bind(db);
    const upsertAttendanceRecord = db.upsertAttendanceRecord.bind(db);
    db.addVerificationAttempt = (attempt) => {
      verificationPersisted = true;
      return addVerificationAttempt(attempt);
    };
    db.upsertAttendanceRecord = (record) => {
      if (!verificationPersisted) throw new Error("verification must be stored first");
      return upsertAttendanceRecord(record);
    };
    const hrApi = createHrApi(db, () => fixedNow);

    await expect(hrApi.clockAttendance({
      employeeId: "emp-ops-1",
      type: "CLOCK_IN",
      method: "GPS",
      now: "2026-07-10T08:00:00+09:00",
      coordinate: { latitude: 37.5666, longitude: 126.9781 }
    })).resolves.toMatchObject({ verification: { status: "GPS_PASSED" } });
  });

  it("allows QR attendance when GPS fails", async () => {
    const hrApi = api();

    const result = await hrApi.clockAttendance({
      employeeId: "emp-ops-2",
      type: "CLOCK_IN",
      method: "QR",
      now: "2026-07-09T08:04:00+09:00",
      gpsError: true
    });

    expect(result.verification.status).toBe("GPS_FAILED_QR_ALLOWED");
    expect(result.attendance.status).toBe("GPS_FAILED_QR_ALLOWED");
    expect(result.verification.note).toBe("GPS수신실패");
  });

  it("submits leave as pending and records the write", async () => {
    const hrApi = api();

    const result = await hrApi.submitLeaveRequest({
      employeeId: "emp-ops-1",
      type: "ANNUAL",
      startsOn: "2026-07-20",
      endsOn: "2026-07-20",
      days: 1,
      reason: "개인 일정"
    });

    expect(result.request.status).toBe("PENDING");
    expect(result.auditLog.targetId).toBe(result.request.id);
    await expect(hrApi.getAuditLogs({ targetType: "LeaveRequest", targetId: result.request.id })).resolves.toHaveLength(
      1
    );
  });

  it("excludes approved leave requests from pending leave dashboard list", async () => {
    const hrApi = api();
    const submitted = await hrApi.submitLeaveRequest({
      employeeId: "emp-ops-1",
      type: "ANNUAL",
      startsOn: "2026-07-21",
      endsOn: "2026-07-21",
      days: 1,
      reason: "정책 회귀 확인"
    });

    const approved = await hrApi.updateRequestStatus({
      targetType: "LeaveRequest",
      requestId: submitted.request.id,
      status: "APPROVED",
      actorId: "emp-ceo",
      detail: "휴가 승인"
    });
    const dashboard = await hrApi.getDashboard(fixedNow);

    expect(approved.request.status).toBe("APPROVED");
    expect(dashboard.leaveRequests.map((request) => request.id)).toContain(submitted.request.id);
    expect(dashboard.pendingLeaveRequests.map((request) => request.id)).not.toContain(submitted.request.id);
  });

  it("submits overtime as pending with pay approval off and records the write", async () => {
    const hrApi = api();

    const result = await hrApi.submitOvertimeRequest({
      employeeId: "emp-ops-1",
      date: "2026-07-10",
      startsAt: "2026-07-10T17:30:00+09:00",
      endsAt: "2026-07-10T19:00:00+09:00",
      minutes: 90,
      reason: "정산 마감"
    });

    expect(result.request.status).toBe("PENDING");
    expect(result.request.payApproved).toBe(false);
    expect(result.auditLog.action).toBe("OVERTIME_REQUEST_SUBMITTED");
    await expect(
      hrApi.getAuditLogs({ targetType: "OvertimeRequest", targetId: result.request.id })
    ).resolves.toHaveLength(1);
  });

  it("updates overtime approval status and writes audit history", async () => {
    const hrApi = api();
    const submitted = await hrApi.submitOvertimeRequest({
      employeeId: "emp-ops-1",
      date: "2026-07-10",
      startsAt: "2026-07-10T17:30:00+09:00",
      endsAt: "2026-07-10T19:00:00+09:00",
      minutes: 90,
      reason: "정산 마감"
    });

    const result = await hrApi.updateRequestStatus({
      targetType: "OvertimeRequest",
      requestId: submitted.request.id,
      status: "APPROVED",
      actorId: "emp-ceo",
      detail: "관리자 승인"
    });

    expect(result.request.status).toBe("APPROVED");
    expect(result.auditLog.targetId).toBe(submitted.request.id);
    expect(result.auditLog.detail).toBe("관리자 승인");
    await expect(
      hrApi.getAuditLogs({ targetType: "OvertimeRequest", targetId: submitted.request.id })
    ).resolves.toHaveLength(2);
  });

  it("allows approver sessions to change request status", async () => {
    const hrApi = api();
    const submitted = await hrApi.submitLeaveRequest({
      employeeId: "emp-ops-1",
      type: "ANNUAL",
      startsOn: "2026-07-22",
      endsOn: "2026-07-22",
      days: 1,
      reason: "승인자 세션 확인"
    });

    const result = await hrApi.updateRequestStatus({
      targetType: "LeaveRequest",
      requestId: submitted.request.id,
      status: "APPROVED",
      actorId: approverSession.employeeId,
      session: approverSession
    });

    expect(result.request.status).toBe("APPROVED");
    expect(result.auditLog.actorId).toBe(approverSession.employeeId);
  });

  it("rejects employee sessions from changing request status", async () => {
    const hrApi = api();
    const submitted = await hrApi.submitLeaveRequest({
      employeeId: "emp-ops-1",
      type: "ANNUAL",
      startsOn: "2026-07-23",
      endsOn: "2026-07-23",
      days: 1,
      reason: "직원 승인 차단 확인"
    });

    await expect(
      hrApi.updateRequestStatus({
        targetType: "LeaveRequest",
        requestId: submitted.request.id,
        status: "APPROVED",
        actorId: employeeSession.employeeId,
        session: employeeSession
      })
    ).rejects.toThrow("Approval permission required");
  });

  it("sets overtime pay approval and records the change", async () => {
    const hrApi = api();
    const submitted = await hrApi.submitOvertimeRequest({
      employeeId: "emp-ops-1",
      date: "2026-07-10",
      startsAt: "2026-07-10T17:30:00+09:00",
      endsAt: "2026-07-10T19:00:00+09:00",
      minutes: 90,
      reason: "정산 마감",
      status: "APPROVED"
    });

    const result = await hrApi.setOvertimePayApproval({
      requestId: submitted.request.id,
      payApproved: true,
      actorId: "emp-ceo",
      detail: "수당 지급 대상"
    });

    expect(result.request.payApproved).toBe(true);
    expect(result.auditLog.action).toBe("OVERTIME_PAY_APPROVED");
    expect(result.auditLog.detail).toBe("수당 지급 대상");
    await expect(hrApi.getAuditLogs({ action: "OVERTIME_PAY_APPROVED" })).resolves.toHaveLength(1);
  });

  it("updates employee overtime pay eligible minutes after overtime approval and pay approval", async () => {
    const hrApi = api();
    const submitted = await hrApi.submitOvertimeRequest({
      employeeId: "emp-ops-1",
      date: "2026-07-11",
      startsAt: "2026-07-11T17:30:00+09:00",
      endsAt: "2026-07-11T19:30:00+09:00",
      minutes: 120,
      reason: "정책 회귀 확인"
    });

    await hrApi.updateRequestStatus({
      targetType: "OvertimeRequest",
      requestId: submitted.request.id,
      status: "APPROVED",
      actorId: "emp-ceo",
      detail: "야근 승인"
    });
    await hrApi.setOvertimePayApproval({
      requestId: submitted.request.id,
      payApproved: true,
      actorId: "emp-ceo",
      detail: "수당 지급 대상"
    });
    const snapshot = await hrApi.getEmployeeSnapshot("emp-ops-1", fixedNow);

    expect(snapshot.overtimeOffset?.payEligibleMinutes).toBe(95);
    expect(snapshot.overtimeOffset?.remainingOvertimeMinutes).toBe(95);
    expect(snapshot.overtimeOffset?.status).toBe("OVERTIME_PAY_APPROVED");
  });

  it("returns admin dashboard lists for leave, overtime, and corrections", async () => {
    const hrApi = api();

    const dashboard = await hrApi.getDashboard(fixedNow);

    expect(dashboard.leaveRequests.map((request) => request.id)).toEqual(
      expect.arrayContaining(["leave-1", "leave-2"])
    );
    expect(dashboard.pendingLeaveRequests.map((request) => request.id)).toContain("leave-1");
    expect(dashboard.overtimeRequests.map((request) => request.id)).toContain("ot-1");
    expect(dashboard.corrections.map((correction) => correction.id)).toContain("corr-1");
  });

  it("scopes dashboard lists to the authenticated employee", async () => {
    const hrApi = api();

    const dashboard = await hrApi.getDashboard({ asOf: fixedNow, session: employeeSession });

    expect(dashboard.employeesTotal).toBe(1);
    expect(dashboard.pilotEmployees).toBe(1);
    expect(dashboard.leaveRequests.every((request) => request.employeeId === employeeSession.employeeId)).toBe(true);
    expect(dashboard.overtimeRequests.every((request) => request.employeeId === employeeSession.employeeId)).toBe(true);
    expect(dashboard.activePayrollStatements.every((statement) => statement.employeeId === employeeSession.employeeId)).toBe(
      true
    );
  });

  it("rejects employee access to another employee snapshot", async () => {
    const hrApi = api();

    await expect(hrApi.getEmployeeSnapshot("emp-ops-2", fixedNow, employeeSession)).rejects.toThrow(
      "Employee access denied"
    );
  });

  it("returns only self in the employee directory for employee sessions", async () => {
    const hrApi = api();

    await expect(hrApi.getEmployeeDirectory({ session: employeeSession })).resolves.toEqual([
      expect.objectContaining({ id: "emp-ops-1" })
    ]);
  });

  it("lists only the employee's daily work tasks and records self completion", async () => {
    const hrApi = api();

    const tasks = await hrApi.getDailyWorkTasks({
      employeeId: "emp-prod-1",
      date: "2026-07-12",
      session: {
        ...employeeSession,
        employeeId: "emp-prod-1"
      }
    });
    const result = await hrApi.updateDailyWorkTaskStatus({
      taskId: "daily-task-prod-1",
      status: "DONE",
      completedAt: "2026-07-12T14:30:00+09:00",
      session: {
        ...employeeSession,
        employeeId: "emp-prod-1"
      }
    });

    expect(tasks.map((task) => task.id)).toEqual(["daily-task-prod-1", "daily-task-prod-2"]);
    expect(result.task).toMatchObject({
      id: "daily-task-prod-1",
      status: "DONE",
      completedAt: "2026-07-12T14:30:00+09:00"
    });
    expect(result.auditLog).toMatchObject({
      action: "DAILY_WORK_TASK_STATUS_UPDATED",
      targetType: "DailyWorkTask",
      targetId: "daily-task-prod-1"
    });

    const reopened = await hrApi.updateDailyWorkTaskStatus({
      taskId: "daily-task-prod-2",
      status: "IN_PROGRESS",
      session: {
        ...employeeSession,
        employeeId: "emp-prod-1"
      }
    });
    expect(reopened.task.completedAt).toBeUndefined();
  });

  it("rejects a daily work task status change by anyone other than the assignee", async () => {
    const hrApi = api();

    await expect(
      hrApi.updateDailyWorkTaskStatus({
        taskId: "daily-task-prod-1",
        status: "DONE",
        session: employeeSession
      })
    ).rejects.toThrow("Daily work task access denied");
  });

  it("allows an approver to create and update an assigned employee's daily task plan", async () => {
    const hrApi = api();
    const created = await hrApi.createDailyWorkTaskPlan({
      employeeId: "emp-prod-1",
      date: "2026-07-13",
      title: "  제품 컷 최종 검수  ",
      dueLabel: "오후 4:00",
      displayOrder: 3,
      status: "IN_PROGRESS",
      session: approverSession
    });

    const updated = await hrApi.updateDailyWorkTaskPlan({
      taskId: created.task.id,
      employeeId: "emp-ops-1",
      title: "운영 검수 요청 확인",
      dueLabel: null,
      displayOrder: 1,
      status: "DONE",
      completedAt: "2026-07-13T16:00:00+09:00",
      session: approverSession
    });

    expect(created).toMatchObject({
      task: { employeeId: "emp-prod-1", department: "제작팀", title: "제품 컷 최종 검수", status: "IN_PROGRESS" },
      auditLog: { action: "DAILY_WORK_TASK_PLAN_CREATED" }
    });
    expect(updated).toMatchObject({
      task: {
        employeeId: "emp-ops-1",
        department: "운영팀",
        dueLabel: undefined,
        displayOrder: 1,
        status: "DONE",
        completedAt: "2026-07-13T16:00:00+09:00"
      },
      auditLog: { action: "DAILY_WORK_TASK_PLAN_UPDATED" }
    });
  });

  it("rejects employee daily task plan changes", async () => {
    const hrApi = api();

    await expect(
      hrApi.createDailyWorkTaskPlan({
        employeeId: "emp-ops-1",
        date: "2026-07-13",
        title: "권한 없는 계획 등록",
        session: employeeSession
      })
    ).rejects.toThrow("Approval permission required");
  });

  it("allows admins to update employee card fields", async () => {
    const hrApi = api();

    const result = await hrApi.updateEmployeeCard({
      employeeId: "emp-ops-1",
      actorId: adminSession.employeeId,
      session: adminSession,
      patch: {
        position: "운영 리드",
        annualSalary: 56000000,
        incomeDeductionDependents: 2
      },
      reason: "직원카드 정기 갱신"
    });
    const snapshot = await hrApi.getEmployeeSnapshot("emp-ops-1", fixedNow, adminSession);

    expect(result.employee.position).toBe("운영 리드");
    expect(result.employee.annualSalary).toBe(56000000);
    expect(result.auditLog).toMatchObject({
      action: "EMPLOYEE_CARD_UPDATED",
      targetType: "Employee",
      targetId: "emp-ops-1",
      detail: "직원카드 정기 갱신"
    });
    expect(snapshot.employee.position).toBe("운영 리드");
  });

  it("rejects employee sessions from updating employee cards", async () => {
    const hrApi = api();

    await expect(
      hrApi.updateEmployeeCard({
        employeeId: "emp-ops-1",
        actorId: employeeSession.employeeId,
        session: employeeSession,
        patch: {
          position: "직원 직접 수정"
        }
      })
    ).rejects.toThrow("Admin permission required");
  });

  it("allows admins to update settings", async () => {
    const hrApi = api();

    const result = await hrApi.updateSettings({
      actorId: "emp-ceo",
      settings: {
        gpsAllowedRadiusMeters: 250
      }
    });
    const settings = await hrApi.getSettings();

    expect(result.settings.gpsAllowedRadiusMeters).toBe(250);
    expect(settings.gpsAllowedRadiusMeters).toBe(250);
    expect(settings.gpsFailureFallback).toBe("QR_OR_MANUAL_EQUAL");
    expect(result.auditLog.action).toBe("SETTINGS_UPDATED");
  });

  it("rejects employee settings updates", async () => {
    const hrApi = api();

    await expect(
      hrApi.updateSettings({
        actorId: "emp-ops-1",
        settings: {
          gpsAllowedRadiusMeters: 250
        }
      })
    ).rejects.toThrow("Admin permission required");
    await expect(hrApi.getSettings()).resolves.toMatchObject({
      gpsAllowedRadiusMeters: 300,
      payrollEmployeeAccess: "VIEW_ONLY"
    });
  });

  it("rejects session actor mismatch on admin writes", async () => {
    const hrApi = api();

    await expect(
      hrApi.updateSettings({
        actorId: "emp-ceo",
        session: employeeSession,
        settings: {
          gpsAllowedRadiusMeters: 250
        }
      })
    ).rejects.toThrow("Session actor mismatch");
  });

  it("includes settings in the dashboard", async () => {
    const hrApi = api();

    const dashboard = await hrApi.getDashboard(fixedNow);

    expect(dashboard.settings).toEqual({
      gpsAllowedRadiusMeters: 300,
      gpsFailureFallback: "QR_OR_MANUAL_EQUAL",
      payrollEmployeeAccess: "VIEW_ONLY",
      payrollDeleteMode: "ADMIN_ONLY_SOFT_DELETE",
      overtimePayApproverRole: "ADMIN_ONLY",
      advanceLeaveExceptionHandling: "HR_CORRECTION"
    });
  });

  it("creates attendance correction audit history", async () => {
    const hrApi = api();

    const result = await hrApi.createAttendanceCorrection({
      attendanceId: "att-2026-07-08-emp-ops-1",
      employeeId: "emp-ops-1",
      correctedById: "emp-ceo",
      type: "APPROVED_EARLY_LEAVE",
      beforeValue: "2026-07-08T16:35:00+09:00",
      afterValue: "2026-07-08T17:00:00+09:00",
      reason: "승인된 조기퇴근"
    });

    expect(result.correction.correctedById).toBe("emp-ceo");
    expect(result.auditLog.action).toBe("ATTENDANCE_CORRECTION_CREATED");
    expect(result.auditLog.detail).toContain("승인된 조기퇴근");
  });

  it("shows created attendance corrections in the admin dashboard", async () => {
    const hrApi = api();

    const result = await hrApi.createAttendanceCorrection({
      attendanceId: "att-2026-07-08-emp-ops-1",
      employeeId: "emp-ops-1",
      correctedById: "emp-ceo",
      type: "CLOCK_OUT_CORRECTION",
      beforeValue: "2026-07-08T16:35:00+09:00",
      afterValue: "2026-07-08T17:00:00+09:00",
      reason: "대시보드 반영 회귀 확인"
    });
    const dashboard = await hrApi.getDashboard(fixedNow);

    expect(dashboard.corrections.map((correction) => correction.id)).toContain(result.correction.id);
    expect(dashboard.corrections.find((correction) => correction.id === result.correction.id)).toMatchObject({
      attendanceId: "att-2026-07-08-emp-ops-1",
      type: "CLOCK_OUT_CORRECTION"
    });
  });

  it("soft deletes payroll statements without returning them in active lists", async () => {
    const hrApi = api();

    const upload = await hrApi.uploadPayrollStatement({
      employeeId: "emp-ops-1",
      actorId: "emp-ceo",
      month: "2026-07",
      filename: "2026-07-payroll-kim.pdf",
      file: payrollFile
    });
    const deleted = await hrApi.softDeletePayrollStatement({
      statementId: upload.statement.id,
      actorId: "emp-ceo",
      deleteReason: "재발행된 명세서로 교체",
      deletedAt: "2026-07-08T10:00:00+09:00"
    });
    const snapshot = await hrApi.getEmployeeSnapshot("emp-ops-1", fixedNow);
    const dashboard = await hrApi.getDashboard(fixedNow);

    expect(deleted.statement.deletedAt).toBe("2026-07-08T10:00:00+09:00");
    expect(deleted.statement.deletedBy).toBe("emp-ceo");
    expect(deleted.statement.deleteReason).toBe("재발행된 명세서로 교체");
    expect(snapshot.payrollStatements.some((statement) => statement.id === upload.statement.id)).toBe(false);
    expect(dashboard.activePayrollStatements.some((statement) => statement.id === upload.statement.id)).toBe(false);
    await expect(hrApi.getAuditLogs({ action: "PAYROLL_STATEMENT_SOFT_DELETED" })).resolves.toHaveLength(1);
  });

  it("rejects deleted payroll statement downloads without writing a download audit log", async () => {
    const hrApi = api();
    const upload = await hrApi.uploadPayrollStatement({
      employeeId: "emp-ops-1",
      actorId: adminSession.employeeId,
      session: adminSession,
      month: "2026-07",
      filename: "2026-07-payroll-kim.pdf",
      file: payrollFile
    });

    await hrApi.softDeletePayrollStatement({
      statementId: upload.statement.id,
      actorId: adminSession.employeeId,
      session: adminSession,
      deleteReason: "재발행된 명세서로 교체"
    });

    await expect(
      hrApi.downloadPayrollStatement({
        statementId: upload.statement.id,
        session: adminSession
      })
    ).rejects.toThrow("Payroll statement deleted");
    await expect(hrApi.getAuditLogs({ action: "PAYROLL_STATEMENT_DOWNLOADED" })).resolves.toHaveLength(0);
  });

  it("requires a delete reason for payroll statement deletion", async () => {
    const hrApi = api();
    const upload = await hrApi.uploadPayrollStatement({
      employeeId: "emp-ops-1",
      actorId: "emp-ceo",
      month: "2026-07",
      filename: "2026-07-payroll-kim.pdf",
      file: payrollFile
    });

    await expect(
      hrApi.softDeletePayrollStatement({
        statementId: upload.statement.id,
        actorId: "emp-ceo",
        deleteReason: "  ",
        deletedAt: "2026-07-08T10:00:00+09:00"
      })
    ).rejects.toThrow("Payroll delete reason required");
  });

  it("rejects employee payroll statement deletion", async () => {
    const hrApi = api();
    const upload = await hrApi.uploadPayrollStatement({
      employeeId: "emp-ops-1",
      actorId: "emp-ceo",
      month: "2026-07",
      filename: "2026-07-payroll-kim.pdf",
      file: payrollFile
    });

    await expect(
      hrApi.softDeletePayrollStatement({
        statementId: upload.statement.id,
        actorId: "emp-ops-1",
        deleteReason: "직원 직접 삭제 시도",
        deletedAt: "2026-07-08T10:00:00+09:00"
      })
    ).rejects.toThrow("Admin permission required");
    const snapshot = await hrApi.getEmployeeSnapshot("emp-ops-1", fixedNow);

    expect(snapshot.payrollStatements.map((statement) => statement.id)).toContain(upload.statement.id);
  });

  it("rejects employee payroll uploads", async () => {
    const hrApi = api();

    await expect(
      hrApi.uploadPayrollStatement({
        employeeId: "emp-ops-1",
        actorId: employeeSession.employeeId,
        session: employeeSession,
        month: "2026-07",
        filename: "2026-07-payroll-kim.pdf",
        file: payrollFile
      })
    ).rejects.toThrow("Admin permission required");
  });

  it("allows admin payroll uploads with an admin session", async () => {
    const hrApi = api();

    const result = await hrApi.uploadPayrollStatement({
      employeeId: "emp-ops-1",
      actorId: adminSession.employeeId,
      session: adminSession,
      month: "2026-07",
      filename: "2026-07-payroll-kim.pdf",
      file: payrollFile
    });

    expect(result.statement.employeeId).toBe("emp-ops-1");
    expect(result.statement.storageBucket).toBe("memory-payroll");
    expect(result.statement.storagePath).toBe("emp-ops-1/2026-07/2026-07-payroll-kim.pdf");
    expect(result.statement.uploadedBy).toBe(adminSession.employeeId);
    expect(result.auditLog.actorId).toBe(adminSession.employeeId);
  });

  it("allows employees to download only their own payroll statement and writes an audit log", async () => {
    const hrApi = api();

    const result = await hrApi.downloadPayrollStatement({
      statementId: "pay-1",
      session: employeeSession
    });

    expect(result.statement.employeeId).toBe(employeeSession.employeeId);
    expect(result.storageBucket).toBe("payroll-statements");
    expect(result.storagePath).toBe("emp-ops-1/2026-06/2026-06-payroll-kim.pdf");
    expect(result.signedUrl).toBe("/api/payroll?statementId=pay-1");
    expect(result.auditLog).toMatchObject({
      actorId: employeeSession.employeeId,
      action: "PAYROLL_STATEMENT_DOWNLOADED",
      targetId: "pay-1"
    });
    await expect(hrApi.getAuditLogs({ action: "PAYROLL_STATEMENT_DOWNLOADED" })).resolves.toHaveLength(1);
  });

  it("rejects employee payroll downloads for another employee", async () => {
    const hrApi = api();
    const upload = await hrApi.uploadPayrollStatement({
      employeeId: "emp-ops-2",
      actorId: adminSession.employeeId,
      session: adminSession,
      month: "2026-07",
      filename: "2026-07-payroll-lee.pdf",
      file: payrollFile
    });

    await expect(
      hrApi.downloadPayrollStatement({
        statementId: upload.statement.id,
        session: employeeSession
      })
    ).rejects.toThrow("Payroll access denied");
    await expect(hrApi.getAuditLogs({ action: "PAYROLL_STATEMENT_DOWNLOADED" })).resolves.toHaveLength(0);
  });

  it("allows admin payroll downloads for any employee", async () => {
    const hrApi = api();

    const result = await hrApi.downloadPayrollStatement({
      statementId: "pay-1",
      session: adminSession
    });

    expect(result.statement.employeeId).toBe("emp-ops-1");
    expect(result.auditLog.actorId).toBe(adminSession.employeeId);
  });

  it("rejects employee overtime pay approval", async () => {
    const hrApi = api();
    const submitted = await hrApi.submitOvertimeRequest({
      employeeId: "emp-ops-1",
      date: "2026-07-10",
      startsAt: "2026-07-10T17:30:00+09:00",
      endsAt: "2026-07-10T19:00:00+09:00",
      minutes: 90,
      reason: "정산 마감",
      status: "APPROVED"
    });

    await expect(
      hrApi.setOvertimePayApproval({
        requestId: submitted.request.id,
        payApproved: true,
        actorId: "emp-ops-1",
        detail: "직원 직접 인정"
      })
    ).rejects.toThrow("Admin permission required");
    const snapshot = await hrApi.getEmployeeSnapshot("emp-ops-1", fixedNow);

    expect(snapshot.overtimeRequests.find((request) => request.id === submitted.request.id)?.payApproved).toBe(false);
  });

  it("excludes soft deleted payroll statements from employee snapshots", async () => {
    const hrApi = api();
    const upload = await hrApi.uploadPayrollStatement({
      employeeId: "emp-ops-1",
      actorId: "emp-ceo",
      month: "2026-08",
      filename: "2026-08-payroll-kim.pdf",
      file: payrollFile
    });

    const beforeDelete = await hrApi.getEmployeeSnapshot("emp-ops-1", fixedNow);
    await hrApi.softDeletePayrollStatement({
      statementId: upload.statement.id,
      actorId: "emp-ceo",
      deleteReason: "직원 스냅샷 제외 검증",
      deletedAt: "2026-08-31T10:00:00+09:00"
    });
    const afterDelete = await hrApi.getEmployeeSnapshot("emp-ops-1", fixedNow);

    expect(beforeDelete.payrollStatements.map((statement) => statement.id)).toContain(upload.statement.id);
    expect(afterDelete.payrollStatements.map((statement) => statement.id)).not.toContain(upload.statement.id);
  });
});
