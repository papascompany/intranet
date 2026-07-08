import { describe, expect, it } from "vitest";
import { buildEmployeeViewModel, type EmployeeViewModelSnapshot } from "./employeeViewModel";

const baseSnapshot: EmployeeViewModelSnapshot = {
  employee: {
    id: "emp-ops-1",
    name: "김운영"
  },
  attendanceToday: {
    clockInAt: "2026-07-08T00:05:00Z",
    clockOutAt: "2026-07-08T09:30:00Z",
    earlyLeaveMinutes: 0,
    status: "GPS_PASSED"
  },
  leaveBalance: {
    advanceGrantedDays: 2,
    advanceUsedDays: 0,
    availableDays: 12.5,
    pendingOffsetDays: 0
  },
  leaveRequests: [],
  earlyLeaveTotalMinutes: 30,
  overtimeOffset: {
    appliedMinutes: 30,
    payEligibleMinutes: 60,
    remainingEarlyLeaveMinutes: 0,
    remainingOvertimeMinutes: 60,
    status: "OVERTIME_PAY_APPROVED"
  },
  payrollStatements: [
    {
      filename: "payroll-2026-06.pdf",
      month: "2026-06",
      uploadedAt: "2026-07-01T02:00:00Z"
    }
  ]
};

describe("buildEmployeeViewModel", () => {
  it("shows empty attendance labels when there is no attendance record", () => {
    const viewModel = buildEmployeeViewModel({
      ...baseSnapshot,
      attendanceToday: null
    });

    expect(viewModel.clockInLabel).toBe("출근 기록 없음");
    expect(viewModel.clockOutLabel).toBe("퇴근 기록 없음");
    expect(viewModel.statusLabel).toBe("근태 기록 없음");
  });

  it("shows a GPS failure status label", () => {
    const viewModel = buildEmployeeViewModel({
      ...baseSnapshot,
      attendanceToday: {
        ...baseSnapshot.attendanceToday!,
        status: "GPS_FAILED_ALLOWED"
      }
    });

    expect(viewModel.clockInLabel).toBe("09:05");
    expect(viewModel.clockOutLabel).toBe("18:30");
    expect(viewModel.statusLabel).toBe("GPS 실패 - 허용");
  });

  it("summarizes pending leave requests", () => {
    const viewModel = buildEmployeeViewModel({
      ...baseSnapshot,
      leaveRequests: [
        {
          days: 1,
          status: "PENDING"
        },
        {
          days: 0.5,
          status: "PENDING"
        },
        {
          days: 1,
          status: "APPROVED"
        }
      ]
    });

    expect(viewModel.pendingLeaveSummary).toBe("대기 휴가 2건 · 1.5일");
  });

  it("shows an empty payroll summary when there are no active payroll statements", () => {
    const viewModel = buildEmployeeViewModel({
      ...baseSnapshot,
      payrollStatements: [
        {
          deletedAt: "2026-07-05T01:00:00Z",
          filename: "payroll-2026-06.pdf",
          month: "2026-06",
          uploadedAt: "2026-07-01T02:00:00Z"
        }
      ]
    });

    expect(viewModel.payrollSummary).toBe("급여명세서 없음");
  });
});
