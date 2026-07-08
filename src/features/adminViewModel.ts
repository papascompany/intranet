import type {
  AttendanceCorrection,
  AttendanceRecord,
  AuditLog,
  Employee,
  LeaveRequest,
  PayrollStatement
} from "../domain/types";

export type AdminDashboardResponse = {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  corrections: AttendanceCorrection[];
  payrollStatements: PayrollStatement[];
  auditLogs: AuditLog[];
};

export type AdminViewModelRow = {
  id: string;
  label: string;
  value: string;
  meta: string;
};

export type AdminViewModel = {
  pilotCountLabel: string;
  gpsFailedCountLabel: string;
  pendingRequestCountLabel: string;
  payrollCountLabel: string;
  attendanceRows: AdminViewModelRow[];
  correctionRows: AdminViewModelRow[];
  payrollRows: AdminViewModelRow[];
  auditRows: AdminViewModelRow[];
};

const statusLabels = {
  GPS_PASSED: "GPS 정상",
  GPS_FAILED_ALLOWED: "GPS수신실패+수동클릭",
  GPS_FAILED_QR_ALLOWED: "GPS수신실패+QR",
  OUT_OF_RANGE: "반경 밖",
  MANUAL_REVIEW_REQUIRED: "관리자 검토"
} satisfies Record<AttendanceRecord["status"], string>;

const correctionLabels = {
  APPROVED_LATE: "인정지각",
  APPROVED_EARLY_LEAVE: "인정조퇴",
  CLOCK_IN_CORRECTION: "출근시각 보정",
  CLOCK_OUT_CORRECTION: "퇴근시각 보정",
  MISSING_RECORD_CREATED: "누락 기록 추가"
} satisfies Record<AttendanceCorrection["type"], string>;

export function buildAdminViewModel(
  dashboard: AdminDashboardResponse,
  selectedEmployeeId: string
): AdminViewModel {
  return {
    pilotCountLabel: `${dashboard.employees.filter((employee) => employee.pilot).length}명`,
    gpsFailedCountLabel: `${dashboard.attendanceRecords.filter((record) => record.status.includes("GPS_FAILED")).length}건`,
    pendingRequestCountLabel: `${dashboard.leaveRequests.filter((request) => request.status === "PENDING").length}건`,
    payrollCountLabel: `${dashboard.payrollStatements.length}개`,
    attendanceRows: dashboard.attendanceRecords.map((record) => {
      const employee = findEmployee(dashboard.employees, record.employeeId);

      return {
        id: record.id,
        label: employee?.name ?? record.employeeId,
        value: `${formatTime(record.clockInAt)} / ${formatTime(record.clockOutAt)}`,
        meta: statusLabels[record.status]
      };
    }),
    correctionRows: dashboard.corrections
      .filter((correction) => correction.employeeId === selectedEmployeeId)
      .map((correction) => ({
        id: correction.id,
        label: correctionLabels[correction.type],
        value: correction.reason,
        meta: formatTime(correction.createdAt)
      })),
    payrollRows: dashboard.payrollStatements.map((statement) => {
      const employee = findEmployee(dashboard.employees, statement.employeeId);

      return {
        id: statement.id,
        label: employee?.name ?? statement.employeeId,
        value: statement.filename,
        meta: statement.month
      };
    }),
    auditRows: dashboard.auditLogs.map((log) => ({
      id: log.id,
      label: log.action,
      value: log.detail,
      meta: formatTime(log.createdAt)
    }))
  };
}

function findEmployee(employees: Employee[], employeeId: string) {
  return employees.find((employee) => employee.id === employeeId);
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
