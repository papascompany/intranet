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

    expect(deleted.statement.deletedAt).toBe("2026-07-08T10:00:00+09:00");
    expect(snapshot.payrollStatements.some((statement) => statement.id === upload.statement.id)).toBe(false);
    await expect(hrApi.getAuditLogs({ action: "PAYROLL_STATEMENT_SOFT_DELETED" })).resolves.toHaveLength(1);
  });
});
