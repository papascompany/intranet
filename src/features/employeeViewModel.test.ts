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
  overtimeRequests: [],
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
    expect(viewModel.statusLabel).toBe("정상 인정 · 대체 인증 완료");
  });

  it("shows the employee-specific late result with the delay duration", () => {
    const viewModel = buildEmployeeViewModel({
      ...baseSnapshot,
      attendanceToday: {
        ...baseSnapshot.attendanceToday!,
        workStatus: "LATE",
        lateMinutes: 5
      }
    });

    expect(viewModel.statusLabel).toBe("지각 5분 · GPS 확인 완료");
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

  it("summarizes pending overtime requests", () => {
    const viewModel = buildEmployeeViewModel({
      ...baseSnapshot,
      overtimeRequests: [
        {
          minutes: 90,
          status: "PENDING"
        },
        {
          minutes: 30,
          status: "PENDING"
        },
        {
          minutes: 60,
          status: "APPROVED"
        }
      ]
    });

    expect(viewModel.pendingOvertimeSummary).toBe("대기 야근 2건 · 2시간");
  });

  it("summarizes pending attendance correction requests", () => {
    const viewModel = buildEmployeeViewModel({
      ...baseSnapshot,
      correctionRequests: [{ status: "PENDING" }, { status: "APPROVED" }]
    });

    expect(viewModel.correctionSummary).toBe("대기 정정 1건 · 관리자 확인 필요");
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
