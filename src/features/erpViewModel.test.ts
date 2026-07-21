import { describe, expect, it } from "vitest";
import type { Dashboard, EmployeeSnapshot } from "../api/types";
import type { Employee } from "../domain/types";
import { buildErpViewModel, type ErpActiveSection } from "./erpViewModel";

const employees: Employee[] = [
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
    role: "APPROVER",
    department: "제작팀",
    hireDate: "2025-08-20",
    approverId: "emp-ceo",
    pilot: false
  }
];

const dashboard: Dashboard = {
  asOf: "2026-07-08T10:00:00+09:00",
  employeesTotal: 3,
  pilotEmployees: 2,
  todayAttendance: [
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
      employeeId: "emp-prod-1",
      date: "2026-07-08",
      clockInAt: "2026-07-08T08:05:00+09:00",
      status: "GPS_FAILED_QR_ALLOWED",
      verificationId: "ver-2",
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
  pendingLeaveRequests: [
    {
      id: "leave-1",
      employeeId: "emp-ops-1",
      type: "HALF_DAY",
      startsOn: "2026-07-12",
      endsOn: "2026-07-12",
      days: 0.5,
      reason: "오전 병원 방문",
      status: "PENDING"
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
      employeeId: "emp-prod-1",
      correctedById: "emp-ceo",
      type: "APPROVED_LATE",
      beforeValue: "2026-07-08T08:05:00+09:00",
      afterValue: "2026-07-08T08:00:00+09:00",
      reason: "GPS수신실패 후 QR 출근",
      createdAt: "2026-07-08T08:30:00+09:00"
    }
  ],
  gpsFailedAttendance: [
    {
      id: "att-2",
      employeeId: "emp-prod-1",
      date: "2026-07-08",
      clockInAt: "2026-07-08T08:05:00+09:00",
      status: "GPS_FAILED_QR_ALLOWED",
      verificationId: "ver-2",
      earlyLeaveMinutes: 0
    }
  ],
  attendanceReviewQueue: [
    {
      id: "att-review-1",
      employeeId: "emp-ops-1",
      date: "2026-07-08",
      clockInAt: "2026-07-08T08:00:00+09:00",
      status: "OUT_OF_RANGE",
      verificationId: "ver-review-1",
      earlyLeaveMinutes: 0,
      workStatus: "NORMAL",
      lateMinutes: 0,
      reviewStatus: "PENDING"
    }
  ],
  activePayrollStatements: [
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
  recentAuditLogs: [
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

const employeeSnapshot: EmployeeSnapshot = {
  asOf: "2026-07-08T10:00:00+09:00",
  employee: employees[1],
  workplaceOptions: [
    {
      id: "office-main",
      name: "본사 사무실",
      latitude: 37.5665,
      longitude: 126.978,
      allowedRadiusMeters: 300,
      qrPath: "/qr/office-main"
    }
  ],
  todayAttendance: dashboard.todayAttendance[0],
  attendanceRecords: [dashboard.todayAttendance[0]],
  leaveBalance: {
    statutoryDays: 15,
    advanceGrantedDays: 2,
    advanceUsedDays: 0,
    availableDays: 12.5,
    pendingOffsetDays: 0
  },
  leaveRequests: [dashboard.leaveRequests[0]],
  earlyLeaveLedger: [],
  overtimeRequests: [dashboard.overtimeRequests[0]],
  overtimeOffset: {
    appliedMinutes: 30,
    remainingEarlyLeaveMinutes: 0,
    remainingOvertimeMinutes: 60,
    payEligibleMinutes: 60,
    status: "OVERTIME_PAY_APPROVED"
  },
  attendanceCorrections: [],
  payrollStatements: [dashboard.activePayrollStatements[0]],
  dailyWorkTasks: [],
  recentAuditLogs: []
};

function buildViewModel(activeSection: ErpActiveSection = "approvals") {
  return buildErpViewModel({
    dashboard,
    employeeSnapshot,
    employees,
    activeSection
  });
}

describe("buildErpViewModel", () => {
  it("builds nav counts and active state", () => {
    const viewModel = buildViewModel("approvals");

    expect(viewModel.navItems.find((item) => item.section === "approvals")).toEqual({
      section: "approvals",
      label: "승인",
      count: 2,
      isActive: true
    });
    expect(viewModel.navItems.find((item) => item.section === "payroll")?.count).toBe(2);
  });

  it("builds the approval work queue", () => {
    const viewModel = buildViewModel();

    expect(viewModel.workQueueRows).toEqual(
      expect.arrayContaining([
        {
          id: "queue-leave-1",
          label: "김운영",
          value: "2026-07-12 · 0.5일",
          meta: "휴가 승인 대기",
          status: "PENDING"
        },
        {
          id: "queue-ot-1",
          label: "김운영",
          value: "2026-07-09 · 1시간 30분",
          meta: "야근 승인 대기",
          status: "PENDING"
        }
      ])
    );
    expect(viewModel.workQueueRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "queue-att-review-1", meta: "근태 인증 검토 대기" })
    ]));
    expect(viewModel.workQueueRows.some((row) => row.id === "queue-att-2")).toBe(false);
  });

  it("builds payroll rows with employee name fallback", () => {
    const viewModel = buildViewModel("payroll");

    expect(viewModel.payrollRows).toEqual([
      {
        id: "pay-1",
        label: "김운영",
        value: "2026-06-payroll-kim.pdf",
        meta: "2026-06 · 2026-07-05",
        status: "ACTIVE"
      },
      {
        id: "pay-2",
        label: "missing-employee",
        value: "2026-06-payroll-missing.pdf",
        meta: "2026-06 · 2026-07-05",
        status: "ACTIVE"
      }
    ]);
  });

  it("builds the selected employee summary", () => {
    const viewModel = buildViewModel("self-service");

    expect(viewModel.employeeSummary).toEqual({
      id: "emp-ops-1",
      name: "김운영",
      department: "운영팀",
      hireDate: "2026-01-10",
      role: "직원",
      isPilot: true,
      pilotLabel: "파일럿 대상"
    });
  });

  it("carries the selected employee's daily work tasks to the employee screen", () => {
    const task = {
      id: "daily-task-ops-1",
      employeeId: "emp-ops-1",
      department: "운영팀" as const,
      date: "2026-07-08",
      title: "오전 주문 정산 확인",
      displayOrder: 1,
      status: "IN_PROGRESS" as const
    };
    const viewModel = buildErpViewModel({
      dashboard,
      employeeSnapshot: { ...employeeSnapshot, dailyWorkTasks: [task] },
      employees,
      activeSection: "self-service"
    });

    expect(viewModel.dailyWorkTasks).toEqual([task]);
  });

  it("includes policy decision checks", () => {
    const viewModel = buildViewModel("settings");

    expect(viewModel.decisionChecks.map((check) => check.label)).toEqual([
      "GPS 허용 반경",
      "GPS 실패 대체 인증",
      "급여명세서 접근",
      "야근 수당 인정",
      "휴직/장기결근 선사용휴가 예외"
    ]);
    expect(viewModel.decisionChecks[0]).toMatchObject({
      value: "300m 기본 적용",
      meta: "관리자 설정에서 변경 가능",
      status: "ACTIVE"
    });
  });
});
