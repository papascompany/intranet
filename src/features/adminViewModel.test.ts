import { describe, expect, it } from "vitest";
import type { AdminDashboardResponse } from "./adminViewModel";
import { buildAdminViewModel } from "./adminViewModel";

const dashboard: AdminDashboardResponse = {
  employees: [
    {
      id: "emp-ceo",
      name: "대표",
      role: "HR_ADMIN",
      department: "운영팀",
      hireDate: "2024-03-01",
      pilot: true
    },
    {
      id: "emp-ops-1",
      name: "김운영",
      role: "EMPLOYEE",
      department: "운영팀",
      hireDate: "2026-01-10",
      approverId: "emp-ceo",
      pilot: true
    },
    {
      id: "emp-prod-1",
      name: "박제작",
      role: "EMPLOYEE",
      department: "제작팀",
      hireDate: "2025-08-20",
      approverId: "emp-ceo",
      pilot: false
    }
  ],
  attendanceRecords: [
    {
      id: "att-1",
      employeeId: "emp-ops-1",
      date: "2026-07-08",
      clockInAt: "2026-07-08T07:58:00+09:00",
      clockOutAt: "2026-07-08T16:35:00+09:00",
      status: "GPS_PASSED",
      verificationId: "ver-1",
      earlyLeaveMinutes: 25
    },
    {
      id: "att-2",
      employeeId: "emp-ceo",
      date: "2026-07-08",
      clockInAt: "2026-07-08T08:05:00+09:00",
      status: "GPS_FAILED_ALLOWED",
      verificationId: "ver-2",
      earlyLeaveMinutes: 0
    },
    {
      id: "att-3",
      employeeId: "emp-prod-1",
      date: "2026-07-08",
      clockInAt: "2026-07-08T08:12:00+09:00",
      status: "GPS_FAILED_QR_ALLOWED",
      verificationId: "ver-3",
      earlyLeaveMinutes: 0
    }
  ],
  leaveRequests: [
    {
      id: "leave-1",
      employeeId: "emp-ops-1",
      type: "HALF_DAY",
      startsOn: "2026-07-12",
      endsOn: "2026-07-12",
      days: 0.5,
      reason: "오전 병원 방문",
      status: "PENDING"
    },
    {
      id: "leave-2",
      employeeId: "emp-prod-1",
      type: "ANNUAL",
      startsOn: "2026-06-20",
      endsOn: "2026-06-20",
      days: 1,
      reason: "가족 일정",
      status: "APPROVED"
    }
  ],
  overtimeRequests: [
    {
      id: "ot-1",
      employeeId: "emp-ops-1",
      date: "2026-07-09",
      startsAt: "2026-07-09T18:00:00+09:00",
      endsAt: "2026-07-09T19:30:00+09:00",
      minutes: 90,
      reason: "월말 정산",
      status: "PENDING",
      payApproved: false
    },
    {
      id: "ot-2",
      employeeId: "emp-prod-1",
      date: "2026-07-05",
      startsAt: "2026-07-05T18:00:00+09:00",
      endsAt: "2026-07-05T19:00:00+09:00",
      minutes: 60,
      reason: "배포 지원",
      status: "APPROVED",
      payApproved: true
    }
  ],
  corrections: [
    {
      id: "corr-1",
      attendanceId: "att-2",
      employeeId: "emp-ceo",
      correctedById: "emp-ceo",
      type: "APPROVED_LATE",
      beforeValue: "2026-07-08T08:05:00+09:00",
      afterValue: "2026-07-08T08:00:00+09:00",
      reason: "사무실 도착 확인",
      createdAt: "2026-07-08T08:30:00+09:00"
    },
    {
      id: "corr-2",
      attendanceId: "att-1",
      employeeId: "emp-ops-1",
      correctedById: "emp-ceo",
      type: "CLOCK_OUT_CORRECTION",
      beforeValue: "2026-07-08T16:35:00+09:00",
      afterValue: "2026-07-08T17:00:00+09:00",
      reason: "퇴근시각 승인 보정",
      createdAt: "2026-07-08T17:10:00+09:00"
    }
  ],
  payrollStatements: [
    {
      id: "pay-1",
      employeeId: "emp-ops-1",
      month: "2026-06",
      filename: "2026-06-payroll-kim.pdf",
      uploadedAt: "2026-07-05T10:00:00+09:00"
    },
    {
      id: "pay-2",
      employeeId: "missing-employee",
      month: "2026-06",
      filename: "2026-06-payroll-missing.pdf",
      uploadedAt: "2026-07-05T11:00:00+09:00"
    }
  ],
  auditLogs: [
    {
      id: "audit-1",
      actorId: "emp-ceo",
      action: "ATTENDANCE_CORRECTED",
      targetType: "AttendanceRecord",
      targetId: "att-2",
      createdAt: "2026-07-08T08:30:00+09:00",
      detail: "인정지각 처리"
    }
  ]
};

describe("buildAdminViewModel", () => {
  it("builds the pilot employee count label", () => {
    const viewModel = buildAdminViewModel(dashboard, "emp-ops-1");

    expect(viewModel.pilotCountLabel).toBe("2명");
  });

  it("builds the GPS failure count label", () => {
    const viewModel = buildAdminViewModel(dashboard, "emp-ops-1");

    expect(viewModel.gpsFailedCountLabel).toBe("2건");
  });

  it("builds pending leave request rows", () => {
    const viewModel = buildAdminViewModel(dashboard, "emp-ops-1");

    expect(viewModel.pendingRequestCountLabel).toBe("2건");
    expect(viewModel.leaveRequestRows).toEqual([
      {
        id: "leave-1",
        label: "김운영",
        value: "2026-07-12 · 0.5일",
        meta: "대기"
      }
    ]);
  });

  it("builds pending overtime rows", () => {
    const viewModel = buildAdminViewModel(dashboard, "emp-ops-1");

    expect(viewModel.overtimeRows).toEqual([
      {
        id: "ot-1",
        label: "김운영",
        value: "2026-07-09 · 1시간 30분",
        meta: "대기"
      }
    ]);
  });

  it("filters correction rows to the selected employee", () => {
    const viewModel = buildAdminViewModel(dashboard, "emp-ops-1");

    expect(viewModel.correctionRows).toEqual([
      {
        id: "corr-2",
        label: "퇴근시각 보정",
        value: "퇴근시각 승인 보정",
        meta: "17:10"
      }
    ]);
  });

  it("builds payroll rows with employee names and fallback ids", () => {
    const viewModel = buildAdminViewModel(dashboard, "emp-ops-1");

    expect(viewModel.payrollCountLabel).toBe("2개");
    expect(viewModel.payrollRows).toEqual([
      {
        id: "pay-1",
        label: "김운영",
        value: "2026-06-payroll-kim.pdf",
        meta: "2026-06"
      },
      {
        id: "pay-2",
        label: "missing-employee",
        value: "2026-06-payroll-missing.pdf",
        meta: "2026-06"
      }
    ]);
  });
});
