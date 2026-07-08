import { describe, expect, it } from "vitest";
import { InMemoryDatabase } from "./inMemoryDatabase";
import { createHrApi } from "./hrApi";

const fixedNow = "2026-07-08T09:00:00+09:00";

function api() {
  return createHrApi(new InMemoryDatabase(), () => fixedNow);
}

describe("hr api", () => {
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
      filename: "2026-07-payroll-kim.pdf"
    });
    const deleted = await hrApi.softDeletePayrollStatement({
      statementId: upload.statement.id,
      actorId: "emp-ceo",
      deletedAt: "2026-07-08T10:00:00+09:00"
    });
    const snapshot = await hrApi.getEmployeeSnapshot("emp-ops-1", fixedNow);
    const dashboard = await hrApi.getDashboard(fixedNow);

    expect(deleted.statement.deletedAt).toBe("2026-07-08T10:00:00+09:00");
    expect(snapshot.payrollStatements.some((statement) => statement.id === upload.statement.id)).toBe(false);
    expect(dashboard.activePayrollStatements.some((statement) => statement.id === upload.statement.id)).toBe(false);
    await expect(hrApi.getAuditLogs({ action: "PAYROLL_STATEMENT_SOFT_DELETED" })).resolves.toHaveLength(1);
  });

  it("excludes soft deleted payroll statements from employee snapshots", async () => {
    const hrApi = api();
    const upload = await hrApi.uploadPayrollStatement({
      employeeId: "emp-ops-1",
      actorId: "emp-ceo",
      month: "2026-08",
      filename: "2026-08-payroll-kim.pdf"
    });

    const beforeDelete = await hrApi.getEmployeeSnapshot("emp-ops-1", fixedNow);
    await hrApi.softDeletePayrollStatement({
      statementId: upload.statement.id,
      actorId: "emp-ceo",
      deletedAt: "2026-08-31T10:00:00+09:00"
    });
    const afterDelete = await hrApi.getEmployeeSnapshot("emp-ops-1", fixedNow);

    expect(beforeDelete.payrollStatements.map((statement) => statement.id)).toContain(upload.statement.id);
    expect(afterDelete.payrollStatements.map((statement) => statement.id)).not.toContain(upload.statement.id);
  });
});
