import type { Dashboard, EmployeeSnapshot } from "../api/types";
import type {
  AttendanceCorrection,
  AttendanceRecord,
  Employee,
  LeaveRequest,
  OvertimeRequest,
  PayrollStatement,
  RequestStatus
} from "../domain/types";

export type ErpActiveSection =
  | "self-service"
  | "employee-card"
  | "attendance"
  | "approvals"
  | "leave"
  | "overtime"
  | "payroll"
  | "settings"
  | "audit";

export type ErpViewModelInput = {
  dashboard: Dashboard;
  employeeSnapshot: EmployeeSnapshot;
  employees: Employee[];
  activeSection: ErpActiveSection;
};

export type ErpNavItem = {
  section: ErpActiveSection;
  label: string;
  count: number;
  isActive: boolean;
};

export type ErpViewModelRow = {
  id: string;
  label: string;
  value: string;
  meta: string;
  status?: string;
};

export type ErpEmployeeSummary = {
  id: string;
  name: string;
  department: string;
  hireDate: string;
  role: string;
  isPilot: boolean;
  pilotLabel: string;
};

export type ErpViewModel = {
  navItems: ErpNavItem[];
  kpis: ErpViewModelRow[];
  workQueueRows: ErpViewModelRow[];
  attendanceRows: ErpViewModelRow[];
  leaveRows: ErpViewModelRow[];
  overtimeRows: ErpViewModelRow[];
  payrollRows: ErpViewModelRow[];
  correctionRows: ErpViewModelRow[];
  auditRows: ErpViewModelRow[];
  employeeSummary: ErpEmployeeSummary;
  decisionChecks: ErpViewModelRow[];
};

const navLabels = {
  "self-service": "셀프서비스",
  "employee-card": "직원카드",
  attendance: "근태",
  approvals: "승인",
  leave: "휴가",
  overtime: "야근",
  payroll: "급여",
  settings: "설정",
  audit: "감사"
} satisfies Record<ErpActiveSection, string>;

const statusLabels = {
  GPS_PASSED: "GPS 정상",
  GPS_FAILED_ALLOWED: "GPS 실패 허용",
  GPS_FAILED_QR_ALLOWED: "GPS 실패 QR 허용",
  OUT_OF_RANGE: "근무지 반경 밖",
  MANUAL_REVIEW_REQUIRED: "수기 검토 필요"
} satisfies Record<AttendanceRecord["status"], string>;

const requestStatusLabels = {
  DRAFT: "초안",
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "반려"
} satisfies Record<RequestStatus, string>;

const correctionLabels = {
  APPROVED_LATE: "인정지각",
  APPROVED_EARLY_LEAVE: "인정조퇴",
  CLOCK_IN_CORRECTION: "출근시각 보정",
  CLOCK_OUT_CORRECTION: "퇴근시각 보정",
  MISSING_RECORD_CREATED: "누락 기록 추가"
} satisfies Record<AttendanceCorrection["type"], string>;

const roleLabels = {
  EMPLOYEE: "직원",
  APPROVER: "승인자",
  HR_ADMIN: "HR 관리자",
  SYSTEM_ADMIN: "시스템 관리자"
} satisfies Record<Employee["role"], string>;

export function buildErpViewModel({
  dashboard,
  employeeSnapshot,
  employees,
  activeSection
}: ErpViewModelInput): ErpViewModel {
  const pendingOvertimeRequests = dashboard.overtimeRequests.filter((request) => request.status === "PENDING");
  const pendingApprovalCount = dashboard.pendingLeaveRequests.length + pendingOvertimeRequests.length;
  const selectedEmployee = employeeSnapshot.employee;
  const employeeDirectory = upsertEmployee(employees, selectedEmployee);

  return {
    navItems: buildNavItems({
      dashboard,
      employeeSnapshot,
      employees: employeeDirectory,
      activeSection,
      pendingApprovalCount
    }),
    kpis: [
      {
        id: "kpi-pilot-employees",
        label: "파일럿 인원",
        value: `${dashboard.pilotEmployees}명`,
        meta: `전체 ${dashboard.employeesTotal}명`
      },
      {
        id: "kpi-gps-failures",
        label: "GPS 실패",
        value: `${dashboard.gpsFailedAttendance.length}건`,
        meta: "보조 인증 또는 관리자 확인 필요"
      },
      {
        id: "kpi-pending-approvals",
        label: "승인 대기",
        value: `${pendingApprovalCount}건`,
        meta: `휴가 ${dashboard.pendingLeaveRequests.length}건 · 야근 ${pendingOvertimeRequests.length}건`
      },
      {
        id: "kpi-payroll-files",
        label: "급여 파일",
        value: `${dashboard.activePayrollStatements.length}개`,
        meta: "활성 급여명세서"
      }
    ],
    workQueueRows: buildWorkQueueRows(dashboard, pendingOvertimeRequests, employeeDirectory),
    attendanceRows: dashboard.todayAttendance.map((record) => attendanceRow(record, employeeDirectory)),
    leaveRows: dashboard.leaveRequests.map((request) => leaveRow(request, employeeDirectory)),
    overtimeRows: dashboard.overtimeRequests.map((request) => overtimeRow(request, employeeDirectory)),
    payrollRows: dashboard.activePayrollStatements.map((statement) => payrollRow(statement, employeeDirectory)),
    correctionRows: dashboard.corrections.map((correction) => correctionRow(correction, employeeDirectory)),
    auditRows: dashboard.recentAuditLogs.map((log) => ({
      id: log.id,
      label: log.action,
      value: log.detail,
      meta: `${log.targetType} · ${formatTime(log.createdAt)}`
    })),
    employeeSummary: {
      id: selectedEmployee.id,
      name: selectedEmployee.name,
      department: selectedEmployee.department,
      hireDate: selectedEmployee.hireDate,
      role: roleLabels[selectedEmployee.role],
      isPilot: selectedEmployee.pilot,
      pilotLabel: selectedEmployee.pilot ? "파일럿 대상" : "일반 대상"
    },
    decisionChecks: buildDecisionChecks(dashboard.settings)
  };
}

function buildNavItems({
  dashboard,
  employeeSnapshot,
  employees,
  activeSection,
  pendingApprovalCount
}: {
  dashboard: Dashboard;
  employeeSnapshot: EmployeeSnapshot;
  employees: Employee[];
  activeSection: ErpActiveSection;
  pendingApprovalCount: number;
}) {
  const sectionCounts = {
    "self-service":
      employeeSnapshot.leaveRequests.filter((request) => request.status === "PENDING").length +
      employeeSnapshot.overtimeRequests.filter((request) => request.status === "PENDING").length,
    "employee-card": 1,
    attendance: dashboard.todayAttendance.length,
    approvals: pendingApprovalCount,
    leave: dashboard.leaveRequests.length,
    overtime: dashboard.overtimeRequests.length,
    payroll: dashboard.activePayrollStatements.length,
    settings: employees.length,
    audit: dashboard.recentAuditLogs.length
  } satisfies Record<ErpActiveSection, number>;

  return (Object.keys(navLabels) as ErpActiveSection[]).map((section) => ({
    section,
    label: navLabels[section],
    count: sectionCounts[section],
    isActive: section === activeSection
  }));
}

function buildWorkQueueRows(
  dashboard: Dashboard,
  pendingOvertimeRequests: OvertimeRequest[],
  employees: Employee[]
): ErpViewModelRow[] {
  return [
    ...dashboard.pendingLeaveRequests.map((request) => ({
      ...leaveRow(request, employees),
      id: `queue-${request.id}`,
      meta: "휴가 승인 대기"
    })),
    ...pendingOvertimeRequests.map((request) => ({
      ...overtimeRow(request, employees),
      id: `queue-${request.id}`,
      meta: "야근 승인 대기"
    })),
    ...dashboard.gpsFailedAttendance.map((record) => ({
      ...attendanceRow(record, employees),
      id: `queue-${record.id}`,
      meta: "GPS 실패 확인"
    })),
    ...dashboard.corrections.map((correction) => ({
      ...correctionRow(correction, employees),
      id: `queue-${correction.id}`,
      meta: "근태 보정 확인"
    }))
  ];
}

function attendanceRow(record: AttendanceRecord, employees: Employee[]): ErpViewModelRow {
  return {
    id: record.id,
    label: employeeName(employees, record.employeeId),
    value: `${formatTime(record.clockInAt)} / ${formatTime(record.clockOutAt)}`,
    meta: `${record.date} · ${statusLabels[record.status]}`,
    status: record.status
  };
}

function leaveRow(request: LeaveRequest, employees: Employee[]): ErpViewModelRow {
  return {
    id: request.id,
    label: employeeName(employees, request.employeeId),
    value: `${formatDateRange(request.startsOn, request.endsOn)} · ${formatDays(request.days)}일`,
    meta: request.reason,
    status: request.status
  };
}

function overtimeRow(request: OvertimeRequest, employees: Employee[]): ErpViewModelRow {
  return {
    id: request.id,
    label: employeeName(employees, request.employeeId),
    value: `${request.date} · ${formatMinutes(request.minutes)}`,
    meta: request.payApproved ? "수당 인정" : requestStatusLabels[request.status],
    status: request.status
  };
}

function payrollRow(statement: PayrollStatement, employees: Employee[]): ErpViewModelRow {
  return {
    id: statement.id,
    label: employeeName(employees, statement.employeeId),
    value: statement.filename,
    meta: `${statement.month} · ${formatDate(statement.uploadedAt)}`,
    status: statement.deletedAt ? "DELETED" : "ACTIVE"
  };
}

function correctionRow(correction: AttendanceCorrection, employees: Employee[]): ErpViewModelRow {
  return {
    id: correction.id,
    label: employeeName(employees, correction.employeeId),
    value: correction.reason,
    meta: `${correctionLabels[correction.type]} · ${formatTime(correction.createdAt)}`,
    status: correction.type
  };
}

function buildDecisionChecks(settings: Dashboard["settings"]): ErpViewModelRow[] {
  const gpsRadius = settings?.gpsAllowedRadiusMeters ?? 300;

  return [
    {
      id: "policy-gps-radius",
      label: "GPS 허용 반경",
      value: `${gpsRadius}m 기본 적용`,
      meta: "관리자 설정에서 변경 가능",
      status: "ACTIVE"
    },
    {
      id: "policy-fixed-qr",
      label: "GPS 실패 대체 인증",
      value: "QR과 수동 클릭 동등 허용",
      meta: "두 방식 모두 감사 로그 보존",
      status: "ACTIVE"
    },
    {
      id: "policy-payroll-soft-delete",
      label: "급여명세서 접근",
      value: "직원 View only · 관리자 삭제",
      meta: "삭제는 soft delete 처리",
      status: "ACTIVE"
    },
    {
      id: "policy-overtime-pay-approver",
      label: "야근 수당 인정",
      value: "관리자 지정 계정만 가능",
      meta: "HR/SYSTEM 관리자 권한 검사",
      status: "ACTIVE"
    },
    {
      id: "policy-advance-leave-exception",
      label: "휴직/장기결근 선사용휴가 예외",
      value: "자동 중단 없이 HR 보정",
      meta: "예외 처리는 보정 이력으로 추적",
      status: "ACTIVE"
    }
  ];
}

function upsertEmployee(employees: Employee[], selectedEmployee: Employee) {
  return employees.some((employee) => employee.id === selectedEmployee.id)
    ? employees
    : [selectedEmployee, ...employees];
}

function employeeName(employees: Employee[], employeeId: string) {
  return employees.find((employee) => employee.id === employeeId)?.name ?? employeeId;
}

function formatTime(value?: string) {
  if (!value) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

function formatDateRange(startsOn: string, endsOn: string) {
  return startsOn === endsOn ? startsOn : `${startsOn}~${endsOn}`;
}

function formatDays(days: number) {
  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) {
    return "0분";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}분`;
  }

  if (remainingMinutes === 0) {
    return `${hours}시간`;
  }

  return `${hours}시간 ${remainingMinutes}분`;
}
