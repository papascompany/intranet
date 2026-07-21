import type {
  AttendanceRecord,
  AttendanceCorrectionRequest,
  Employee,
  LeaveBalance,
  LeaveRequest,
  OvertimeOffsetResult,
  OvertimeRequest,
  PayrollStatement,
  VerificationStatus
} from "../domain/types";
import { buildRecognizedWorkSummary, formatRecognizedMinutes } from "./recognizedWork";

type EmployeeSnapshot = Pick<Employee, "id" | "name">;
type AttendanceTodaySnapshot = Pick<
  AttendanceRecord,
  "clockInAt" | "clockOutAt" | "earlyLeaveMinutes" | "status" | "workStatus" | "lateMinutes" | "reviewStatus"
> | null;
type LeaveBalanceSnapshot = Pick<
  LeaveBalance,
  | "advanceGrantedDays"
  | "advanceUsedDays"
  | "availableDays"
  | "pendingOffsetDays"
  | "usedDays"
  | "pendingDays"
  | "currentYearUsedDays"
  | "currentMonthUsedDays"
>;
type LeaveRequestSnapshot = Pick<LeaveRequest, "days" | "status">;
type OvertimeRequestSnapshot = Pick<OvertimeRequest, "minutes" | "status">;
type CorrectionRequestSnapshot = Pick<AttendanceCorrectionRequest, "status">;
type OvertimeOffsetSnapshot = Pick<
  OvertimeOffsetResult,
  "appliedMinutes" | "payEligibleMinutes" | "remainingEarlyLeaveMinutes" | "remainingOvertimeMinutes" | "status"
> | null;
type PayrollStatementSnapshot = Pick<PayrollStatement, "deletedAt" | "filename" | "month" | "uploadedAt">;

export type EmployeeViewModelSnapshot = {
  employee: EmployeeSnapshot;
  attendanceToday: AttendanceTodaySnapshot;
  attendanceRecords?: AttendanceRecord[];
  asOf?: string;
  leaveBalance: LeaveBalanceSnapshot;
  leaveRequests: LeaveRequestSnapshot[];
  overtimeRequests?: OvertimeRequestSnapshot[];
  correctionRequests?: CorrectionRequestSnapshot[];
  earlyLeaveTotalMinutes: number;
  overtimeOffset: OvertimeOffsetSnapshot;
  payrollStatements: PayrollStatementSnapshot[];
};

export type EmployeeViewModel = {
  clockInLabel: string;
  clockOutLabel: string;
  statusLabel: string;
  leaveAvailableLabel: string;
  advanceLeaveLabel: string;
  earlyLeaveLabel: string;
  offsetLabel: string;
  pendingLeaveSummary: string;
  pendingOvertimeSummary: string;
  correctionSummary: string;
  overtimeSummary: string;
  payrollSummary: string;
  recognizedWorkMonthLabel: string;
  recognizedWorkCumulativeLabel: string;
  currentMonthLeaveUsedLabel: string;
  currentYearLeaveUsedLabel: string;
  pendingLeaveDaysLabel: string;
};

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

const statusLabels: Record<VerificationStatus, string> = {
  GPS_PASSED: "GPS 확인 완료",
  GPS_FAILED_ALLOWED: "대체 인증 완료",
  GPS_FAILED_QR_ALLOWED: "QR 대체 인증 완료",
  OUT_OF_RANGE: "근무지 범위 밖",
  MANUAL_REVIEW_REQUIRED: "수기 확인 필요"
};

export function buildEmployeeViewModel(snapshot: EmployeeViewModelSnapshot): EmployeeViewModel {
  const pendingLeaveRequests = snapshot.leaveRequests.filter((request) => request.status === "PENDING");
  const pendingLeaveDays = pendingLeaveRequests.reduce((total, request) => total + request.days, 0);
  const pendingOvertimeRequests = (snapshot.overtimeRequests ?? []).filter((request) => request.status === "PENDING");
  const pendingOvertimeMinutes = pendingOvertimeRequests.reduce((total, request) => total + request.minutes, 0);
  const correctionRequests = snapshot.correctionRequests ?? [];
  const pendingCorrectionRequests = correctionRequests.filter((request) => request.status === "PENDING");
  const activePayrollStatements = snapshot.payrollStatements.filter((statement) => !statement.deletedAt);
  const latestPayrollStatement = activePayrollStatements.sort(comparePayrollStatementsDesc)[0];
  const recognizedWork = buildRecognizedWorkSummary(snapshot.attendanceRecords ?? [], snapshot.asOf ?? new Date().toISOString());

  return {
    clockInLabel: formatClockLabel(snapshot.attendanceToday?.clockInAt, "출근 기록 없음"),
    clockOutLabel: formatClockLabel(snapshot.attendanceToday?.clockOutAt, "퇴근 기록 없음"),
    statusLabel: snapshot.attendanceToday ? attendanceStatusLabel(snapshot.attendanceToday) : "근태 기록 없음",
    leaveAvailableLabel: `사용 가능 연차 ${formatDays(snapshot.leaveBalance.availableDays)}일`,
    advanceLeaveLabel: `선사용 연차 ${formatDays(snapshot.leaveBalance.advanceUsedDays)}일 / ${formatDays(
      snapshot.leaveBalance.advanceGrantedDays
    )}일`,
    earlyLeaveLabel: `조퇴 누적 ${formatMinutes(snapshot.earlyLeaveTotalMinutes)}`,
    offsetLabel: formatOffsetLabel(snapshot.overtimeOffset),
    pendingLeaveSummary:
      pendingLeaveRequests.length === 0
        ? "대기 중인 휴가 없음"
        : `대기 휴가 ${pendingLeaveRequests.length}건 · ${formatDays(pendingLeaveDays)}일`,
    pendingOvertimeSummary:
      pendingOvertimeRequests.length === 0
        ? "대기 중인 야근 없음"
        : `대기 야근 ${pendingOvertimeRequests.length}건 · ${formatMinutes(pendingOvertimeMinutes)}`,
    correctionSummary:
      pendingCorrectionRequests.length === 0
        ? "대기 중인 근태 정정 없음"
        : `대기 정정 ${pendingCorrectionRequests.length}건 · 관리자 확인 필요`,
    overtimeSummary: formatOvertimeSummary(snapshot.overtimeOffset),
    payrollSummary: latestPayrollStatement
      ? `${latestPayrollStatement.month} 급여명세서 · ${latestPayrollStatement.filename}`
      : "급여명세서 없음",
    recognizedWorkMonthLabel: formatRecognizedMinutes(recognizedWork.monthMinutes),
    recognizedWorkCumulativeLabel: formatRecognizedMinutes(recognizedWork.cumulativeMinutes),
    currentMonthLeaveUsedLabel: `${formatDays(snapshot.leaveBalance.currentMonthUsedDays ?? 0)}일`,
    currentYearLeaveUsedLabel: `${formatDays(snapshot.leaveBalance.currentYearUsedDays ?? snapshot.leaveBalance.usedDays ?? 0)}일`,
    pendingLeaveDaysLabel: `${formatDays(snapshot.leaveBalance.pendingDays ?? 0)}일`
  };
}

function attendanceStatusLabel(attendance: NonNullable<EmployeeViewModelSnapshot["attendanceToday"]>) {
  const workStatus = attendance.workStatus === "LATE"
    ? `지각${attendance.lateMinutes ? ` ${attendance.lateMinutes}분` : ""}`
    : "정상 인정";
  const reviewStatus = attendance.reviewStatus === "EVIDENCE_REQUESTED"
    ? " · 증빙 요청됨"
    : attendance.reviewStatus === "PENDING"
      ? " · 관리자 확인 필요"
      : "";
  return `${workStatus} · ${statusLabels[attendance.status]}${reviewStatus}`;
}

function formatClockLabel(value: string | undefined, emptyLabel: string) {
  return value ? formatSeoulTime(value) : emptyLabel;
}

function formatSeoulTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "시간 확인 필요";
  }

  const parts = timeFormatter.formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

function formatOffsetLabel(overtimeOffset: OvertimeOffsetSnapshot) {
  if (!overtimeOffset) {
    return "상계 내역 없음";
  }

  if (overtimeOffset.status === "OFFSET_EXCLUDED_PEAK_SEASON") {
    return "성수기 상계 제외";
  }

  return overtimeOffset.appliedMinutes > 0
    ? `조퇴 ${formatMinutes(overtimeOffset.appliedMinutes)} 상계`
    : "상계 적용 없음";
}

function formatOvertimeSummary(overtimeOffset: OvertimeOffsetSnapshot) {
  if (!overtimeOffset) {
    return "초과근무 정산 없음";
  }

  return `잔여 초과 ${formatMinutes(overtimeOffset.remainingOvertimeMinutes)} · 지급 대상 ${formatMinutes(
    overtimeOffset.payEligibleMinutes
  )}`;
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

function formatDays(days: number) {
  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}

function comparePayrollStatementsDesc(a: PayrollStatementSnapshot, b: PayrollStatementSnapshot) {
  return compareTextDesc(a.month, b.month) || compareTextDesc(a.uploadedAt, b.uploadedAt);
}

function compareTextDesc(a: string, b: string) {
  return b.localeCompare(a);
}
