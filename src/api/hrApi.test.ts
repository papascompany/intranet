import { describe, expect, it } from "vitest";
import { InMemoryDatabase } from "./inMemoryDatabase";
import { createHrApi } from "./hrApi";
import type { AuthSession } from "./auth";
import type { HrRepository } from "./hrRepository";
import { employees } from "../domain/seed";
import { verifyPassword } from "../server/sessionAuth";
import { defaultSystemPolicy } from "./types";

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
  it("creates an employee account with a server-generated temporary password and audits it", async () => {
    const db = new InMemoryDatabase();
    const hrApi = createHrApi(db, () => fixedNow);

    const result = await hrApi.createEmployeeAccount({
      actorId: adminSession.employeeId,
      session: adminSession,
      loginId: "new-staff",
      employee: {
        name: "신규 직원",
        role: "EMPLOYEE",
        department: "운영팀",
        hireDate: "2026-07-08",
        employeeNumber: "emp-0099",
        pilot: false
      }
    });

    expect(result.employee).toMatchObject({ employeeNumber: "EMP-0099" });
    expect(result.temporaryPassword).toHaveLength(20);
    expect(result.auditLog).toMatchObject({ action: "EMPLOYEE_ACCOUNT_CREATED", actorId: adminSession.employeeId });
    const account = await db.findEmployeeAccount(result.employee.id);
    expect(account && await verifyPassword(result.temporaryPassword, account.passwordHash)).toBe(true);

    await expect(
      hrApi.createEmployeeAccount({
        actorId: adminSession.employeeId,
        session: adminSession,
        loginId: "new-staff-duplicate",
        employee: { ...result.employee, employeeNumber: "emp-0099" }
      })
    ).rejects.toThrow("Employee number already exists");
  });

  it("prevents HR administrators from creating another administrator account", async () => {
    const hrApi = api();

    await expect(hrApi.createEmployeeAccount({
      actorId: adminSession.employeeId,
      session: adminSession,
      loginId: "unauthorized-admin",
      employee: {
        name: "권한 검증",
        role: "SYSTEM_ADMIN",
        department: "운영팀",
        hireDate: "2026-07-14",
        employeeNumber: "EMP-0999",
        pilot: false
      }
    })).rejects.toThrow("System administrator permission required");
  });

  it("allows only admins to reset, disable, and re-enable employee account access", async () => {
    const db = new InMemoryDatabase();
    const hrApi = createHrApi(db, () => fixedNow);
    const created = await hrApi.createEmployeeAccount({
      actorId: adminSession.employeeId,
      session: adminSession,
      loginId: "account-staff",
      employee: {
        name: "계정 직원",
        role: "EMPLOYEE",
        department: "제작팀",
        hireDate: "2026-07-08",
        employeeNumber: "EMP-0100",
        pilot: false
      }
    });

    await expect(hrApi.resetEmployeeAccountPassword({ actorId: employeeSession.employeeId, employeeId: created.employee.id, temporaryPassword: "EmployeeReset-2026!", session: employeeSession }))
      .rejects.toThrow("Admin permission required");

    const accountBeforeReset = await db.findEmployeeAccount(created.employee.id);
    await db.updateEmployeeAccount({ ...accountBeforeReset!, failedSignInCount: 5, lockedUntil: "2026-07-09T09:00:00+09:00" });
    const temporaryPassword = "AdminReset-2026!";
    const reset = await hrApi.resetEmployeeAccountPassword({ actorId: adminSession.employeeId, employeeId: created.employee.id, temporaryPassword, session: adminSession });
    expect(reset).toMatchObject({ employeeId: created.employee.id, auditLog: { action: "EMPLOYEE_ACCOUNT_PASSWORD_RESET" } });
    expect(reset).not.toHaveProperty("temporaryPassword");
    expect(JSON.stringify(reset.auditLog)).not.toContain(temporaryPassword);
    const resetAccount = await db.findEmployeeAccount(created.employee.id);
    expect(resetAccount).toMatchObject({ passwordChangeRequired: true, failedSignInCount: 0, lockedUntil: undefined });
    expect(resetAccount && await verifyPassword(temporaryPassword, resetAccount.passwordHash)).toBe(true);

    await expect(hrApi.resetEmployeeAccountPassword({
      actorId: adminSession.employeeId,
      employeeId: created.employee.id,
      temporaryPassword: "too-short",
      session: adminSession
    })).rejects.toThrow("Temporary password must be at least 12 characters long.");

    await expect(hrApi.setEmployeeAccountAccess({ actorId: adminSession.employeeId, employeeId: created.employee.id, enabled: false, session: adminSession }))
      .resolves.toMatchObject({ enabled: false, auditLog: { action: "EMPLOYEE_ACCOUNT_DISABLED" } });
    await expect(hrApi.setEmployeeAccountAccess({ actorId: adminSession.employeeId, employeeId: created.employee.id, enabled: true, session: adminSession }))
      .resolves.toMatchObject({ enabled: true, auditLog: { action: "EMPLOYEE_ACCOUNT_ENABLED" } });
    expect((await hrApi.getEmployees()).some((employee) => employee.id === created.employee.id)).toBe(true);
    await expect(hrApi.getEmployeeAccountStates({ actorId: adminSession.employeeId, session: adminSession })).resolves.toContainEqual({
      employeeId: created.employee.id,
      loginId: "account-staff",
      enabled: true,
      passwordChangedAt: expect.any(String),
      lastSignedInAt: undefined
    });
    await expect(hrApi.getEmployeeAccountStates({ actorId: employeeSession.employeeId, session: employeeSession }))
      .rejects.toThrow("Admin permission required");
  });

  it("registers Blob-uploaded payroll only at the expected employee path", async () => {
    const hrApi = api();
    const input = {
      actorId: adminSession.employeeId,
      session: adminSession,
      employeeId: "emp-ops-1",
      month: "2026-07",
      filename: "2026-07-payroll-kim.pdf",
      storagePath: "emp-ops-1/2026-07/2026-07-payroll-kim.pdf"
    };

    await expect(hrApi.registerUploadedPayrollStatement(input)).resolves.toMatchObject({
      statement: { storagePath: input.storagePath },
      auditLog: { action: "PAYROLL_STATEMENT_REGISTERED" }
    });
    await expect(hrApi.registerUploadedPayrollStatement({ ...input, storagePath: "emp-ops-2/2026-07/2026-07-payroll-kim.pdf" }))
      .rejects.toThrow("Payroll storage path must match");
  });

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
    const hrApi = createHrApi(
      new InMemoryDatabase({
        employees: employees.map((employee) =>
          employee.id === "emp-ops-1" ? { ...employee, workplaceId: "office-main" } : employee
        )
      }),
      () => fixedNow
    );

    await hrApi.clockAttendance({
      employeeId: "emp-ops-1",
      type: "CLOCK_IN",
      method: "GPS",
      now: "2026-07-09T08:00:00+09:00",
      coordinate: {
        latitude: 37.5666,
        longitude: 126.9781,
        accuracyMeters: 14
      }
    });

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

  it("enforces the attendance state machine for out-of-order and duplicate clicks", async () => {
    const hrApi = api();

    await expect(hrApi.clockAttendance({
      employeeId: "emp-ops-1",
      type: "CLOCK_OUT",
      method: "MANUAL_CLICK",
      now: "2026-07-10T17:00:00+09:00",
      gpsError: true
    })).rejects.toThrow("출근 기록 후 퇴근 처리할 수 있습니다");

    await hrApi.clockAttendance({
      employeeId: "emp-ops-1",
      type: "CLOCK_IN",
      method: "MANUAL_CLICK",
      now: "2026-07-10T08:00:00+09:00",
      gpsError: true
    });
    await expect(hrApi.clockAttendance({
      employeeId: "emp-ops-1",
      type: "CLOCK_IN",
      method: "MANUAL_CLICK",
      now: "2026-07-10T08:01:00+09:00",
      gpsError: true
    })).rejects.toThrow("이미 출근 처리된 날짜입니다");
  });

  it("persists verification before the attendance record required by Postgres foreign keys", async () => {
    const db = new InMemoryDatabase({
      employees: employees.map((employee) =>
        employee.id === "emp-ops-1" ? { ...employee, workplaceId: "office-main" } : employee
      )
    });
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

  it("allows employees to cancel only their own pending leave request", async () => {
    const hrApi = api();
    const submitted = await hrApi.submitLeaveRequest({
      employeeId: employeeSession.employeeId,
      type: "ANNUAL",
      startsOn: "2026-07-25",
      endsOn: "2026-07-25",
      days: 1,
      reason: "일정 변경",
      session: employeeSession
    });

    const cancelled = await hrApi.cancelRequest({
      targetType: "LeaveRequest",
      requestId: submitted.request.id,
      session: employeeSession
    });
    expect(cancelled.request).toMatchObject({ status: "CANCELLED", decidedBy: employeeSession.employeeId });
    await expect(hrApi.cancelRequest({
      targetType: "LeaveRequest",
      requestId: submitted.request.id,
      session: employeeSession
    })).rejects.toThrow("Only pending requests can be decided");
  });

  it("enforces annual leave policy units and applies HR balance corrections", async () => {
    const hrApi = createHrApi(new InMemoryDatabase({ leaveRequests: [] }), () => fixedNow);
    const leaveInput = {
      employeeId: employeeSession.employeeId,
      startsOn: "2026-07-20",
      endsOn: "2026-07-20",
      reason: "연차 정책 검증",
      session: employeeSession
    };

    await hrApi.updateSettings({
      actorId: adminSession.employeeId,
      session: adminSession,
      settings: {
        annualLeaveAutoAccrual: false,
        annualLeaveOveruseAllowed: false,
        annualLeaveUnit: 1,
        partialLeaveAllowed: false
      }
    });

    await expect(hrApi.submitLeaveRequest({ ...leaveInput, type: "HALF_DAY", days: 0.5 }))
      .rejects.toThrow("Half-day leave is not allowed by the current policy");
    await expect(hrApi.submitLeaveRequest({ ...leaveInput, type: "ANNUAL", days: 0.5 }))
      .rejects.toThrow("Leave must be requested in 1-day units");
    await expect(hrApi.submitLeaveRequest({ ...leaveInput, type: "ANNUAL", days: 1 }))
      .rejects.toThrow("Requested leave exceeds the available balance");

    await hrApi.updateEmployeeCard({
      employeeId: employeeSession.employeeId,
      actorId: adminSession.employeeId,
      session: adminSession,
      patch: { annualLeaveAdjustmentDays: 2 },
      reason: "HR 연차 보정"
    });
    const correctedSnapshot = await hrApi.getEmployeeSnapshot(employeeSession.employeeId, fixedNow, employeeSession);
    expect(correctedSnapshot.leaveBalance).toMatchObject({ availableDays: 2 });

    await expect(hrApi.submitLeaveRequest({ ...leaveInput, type: "ANNUAL", days: 1 }))
      .resolves.toMatchObject({ request: { status: "PENDING", days: 1 } });
    await expect(hrApi.submitLeaveRequest({ ...leaveInput, startsOn: "2026-07-21", endsOn: "2026-07-22", type: "ANNUAL", days: 2 }))
      .rejects.toThrow("Requested leave exceeds the available balance");
  });

  it("blocks attendance and new requests while an employee is on leave", async () => {
    const db = new InMemoryDatabase({
      employees: employees.map((employee) => employee.id === "emp-ops-1" ? { ...employee, employmentStatus: "LEAVE" } : employee)
    });
    const hrApi = createHrApi(db, () => fixedNow);

    await expect(hrApi.clockAttendance({ employeeId: "emp-ops-1", type: "CLOCK_IN", method: "MANUAL_CLICK" }))
      .rejects.toThrow("Active employment required");
    await expect(hrApi.submitLeaveRequest({
      employeeId: "emp-ops-1",
      type: "ANNUAL",
      startsOn: "2026-07-20",
      endsOn: "2026-07-20",
      days: 1,
      reason: "휴직 중 신청"
    })).rejects.toThrow("Active employment required");
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

  it("forces authenticated overtime submissions into the pending queue", async () => {
    const hrApi = api();
    const result = await hrApi.submitOvertimeRequest({
      employeeId: employeeSession.employeeId,
      date: "2026-07-14",
      startsAt: "2026-07-14T17:30:00+09:00",
      endsAt: "2026-07-14T19:00:00+09:00",
      minutes: 90,
      reason: "직접 승인 우회 시도",
      status: "APPROVED",
      session: employeeSession
    });

    expect(result.request.status).toBe("PENDING");
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

  it("lets employees re-check approval outcomes for their own requests", async () => {
    const hrApi = api();
    const submitted = await hrApi.submitLeaveRequest({
      employeeId: employeeSession.employeeId,
      type: "SPECIAL",
      startsOn: "2026-07-20",
      endsOn: "2026-07-20",
      days: 1,
      reason: "개인 일정",
      session: employeeSession
    });

    await hrApi.updateRequestStatus({
      requestId: submitted.request.id,
      targetType: "LeaveRequest",
      status: "APPROVED",
      actorId: adminSession.employeeId,
      session: adminSession,
      detail: "승인 완료"
    });

    await expect(hrApi.getAuditLogs({ session: employeeSession, targetId: submitted.request.id })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "LEAVEREQUEST_APPROVED", targetId: submitted.request.id, detail: "승인 완료" })
      ])
    );
  });

  it("allows approver sessions to change request status", async () => {
    const hrApi = api();
    const submitted = await hrApi.submitLeaveRequest({
      employeeId: "emp-prod-1",
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

  it("limits approver directory and dashboard visibility to assigned employees", async () => {
    const hrApi = api();
    const directory = await hrApi.getEmployeeDirectory({ session: approverSession });
    const ids = directory.map((employee) => employee.id);
    expect(ids).toEqual(expect.arrayContaining(["emp-ops-2", "emp-prod-1"]));
    expect(ids).not.toContain("emp-ops-1");

    const dashboard = await hrApi.getDashboard({ asOf: fixedNow, session: approverSession });
    expect(dashboard.leaveRequests.every((request) => request.employeeId === "emp-prod-1" || request.employeeId === "emp-ops-2")).toBe(true);
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
        workplaceId: "office-studio",
        annualSalary: 56000000,
        incomeDeductionDependents: 2
      },
      reason: "직원카드 정기 갱신"
    });
    const snapshot = await hrApi.getEmployeeSnapshot("emp-ops-1", fixedNow, adminSession);

    expect(result.employee.position).toBe("운영 리드");
    expect(result.employee.workplaceId).toBe("office-studio");
    expect(result.employee.annualSalary).toBe(56000000);
    expect(result.auditLog).toMatchObject({
      action: "EMPLOYEE_CARD_UPDATED",
      targetType: "Employee",
      targetId: "emp-ops-1",
      detail: "직원카드 정기 갱신"
    });
    expect(snapshot.employee.position).toBe("운영 리드");
    expect(snapshot.employee.residentRegistrationNumber).toBeUndefined();
  });

  it("prevents HR administrators from escalating account roles or changing immutable employee numbers", async () => {
    const hrApi = api();

    await expect(hrApi.updateEmployeeCard({
      employeeId: "emp-ops-1",
      actorId: adminSession.employeeId,
      session: adminSession,
      patch: { role: "SYSTEM_ADMIN" },
      reason: "권한 변경"
    })).rejects.toThrow("System administrator permission required");

    await expect(hrApi.updateEmployeeCard({
      employeeId: "emp-ops-1",
      actorId: adminSession.employeeId,
      session: adminSession,
      patch: { employeeNumber: "EMP-9999" },
      reason: "사번 변경"
    })).rejects.toThrow("Employee number cannot be changed");
  });

  it("records administrator access to employee resident and payroll identifiers", async () => {
    const hrApi = api();

    await expect(hrApi.revealEmployeeSensitiveData({
      employeeId: "emp-ops-1",
      actorId: adminSession.employeeId,
      session: adminSession
    })).resolves.toMatchObject({
      employee: {
        residentRegistrationNumber: "000000-0000002",
        payrollAccount: "000-0000-000002"
      },
      auditLog: {
        action: "EMPLOYEE_SENSITIVE_DATA_VIEWED",
        targetType: "Employee",
        targetId: "emp-ops-1",
        detail: "residentRegistrationNumber,payrollAccount"
      }
    });
    await expect(hrApi.revealEmployeeSensitiveData({
      employeeId: "emp-ops-1",
      actorId: employeeSession.employeeId,
      session: employeeSession
    })).rejects.toThrow("Admin permission required");
  });

  it("redacts sensitive fields from the administrator directory until an audited reveal", async () => {
    const directory = await api().getEmployeeDirectory({ session: adminSession });
    const employee = directory.find((item) => item.id === "emp-ops-1");

    expect(employee).toMatchObject({ name: "김운영", employeeNumber: "EMP-0002" });
    expect(employee?.residentRegistrationNumber).toBeUndefined();
    expect(employee?.payrollAccount).toBeUndefined();
    expect(employee?.annualSalary).toBeUndefined();
  });

  it("rejects unknown workplace assignments before updating an employee card", async () => {
    const hrApi = api();

    await expect(
      hrApi.updateEmployeeCard({
        employeeId: "emp-ops-1",
        actorId: adminSession.employeeId,
        session: adminSession,
        patch: { workplaceId: "unknown-workplace" }
      })
    ).rejects.toThrow("Workplace not found: unknown-workplace");
  });

  it("allows an admin to clear an employee workplace assignment", async () => {
    const hrApi = createHrApi(
      new InMemoryDatabase({
        employees: employees.map((employee) =>
          employee.id === "emp-ops-1" ? { ...employee, workplaceId: "office-main" } : employee
        )
      }),
      () => fixedNow
    );

    const result = await hrApi.updateEmployeeCard({
      employeeId: "emp-ops-1",
      actorId: adminSession.employeeId,
      session: adminSession,
      patch: { workplaceId: null },
      reason: "근무지 해제"
    });

    expect(result.employee.workplaceId).toBeUndefined();
  });

  it("rejects employee sessions from updating employee cards", async () => {
    const hrApi = api();

    await expect(
      hrApi.updateEmployeeCard({
        employeeId: "emp-ops-1",
        actorId: employeeSession.employeeId,
        session: employeeSession,
        patch: {
          workplaceId: "office-main"
        }
      })
    ).rejects.toThrow("Admin permission required");
  });

  it("evaluates GPS against only the employee's assigned workplace", async () => {
    const hrApi = createHrApi(
      new InMemoryDatabase({
        employees: employees.map((employee) =>
          employee.id === "emp-ops-1" ? { ...employee, workplaceId: "office-studio" } : employee
        )
      }),
      () => fixedNow
    );

    const result = await hrApi.clockAttendance({
      employeeId: "emp-ops-1",
      type: "CLOCK_IN",
      method: "GPS",
      now: "2026-07-10T08:00:00+09:00",
      coordinate: { latitude: 37.5665, longitude: 126.978 }
    });

    expect(result.verification).toMatchObject({ workplaceId: "office-studio", status: "OUT_OF_RANGE" });
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

  it("rejects invalid work policy values at the API boundary", async () => {
    const hrApi = api();

    await expect(hrApi.updateSettings({
      actorId: "emp-ceo",
      settings: { workStartTime: "18:00", workEndTime: "09:00" }
    })).rejects.toThrow("valid schedule");
    await expect(hrApi.updateSettings({
      actorId: "emp-ceo",
      settings: { workDays: [] }
    })).rejects.toThrow("work day");
    await expect(hrApi.getSettings()).resolves.toMatchObject(defaultSystemPolicy);
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

    expect(dashboard.settings).toEqual(defaultSystemPolicy);
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
