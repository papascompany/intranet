import type {
  AttendanceCorrection,
  AttendanceRecord,
  AuditLog,
  EarlyLeaveLedger,
  Employee,
  LeaveRequest,
  OvertimeRequest,
  PayrollStatement,
  Workplace
} from "./types";

export const employees: Employee[] = [
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
    id: "emp-ops-2",
    name: "이정산",
    role: "APPROVER",
    department: "운영팀",
    hireDate: "2025-11-15",
    approverId: "emp-ceo",
    pilot: true
  },
  {
    id: "emp-prod-1",
    name: "박제작",
    role: "EMPLOYEE",
    department: "제작팀",
    hireDate: "2025-08-20",
    approverId: "emp-ops-2",
    pilot: false
  }
];

export const workplaces: Workplace[] = [
  {
    id: "office-main",
    name: "본사 사무실",
    latitude: 37.5665,
    longitude: 126.978,
    allowedRadiusMeters: 300,
    qrPath: "/qr/office-main"
  },
  {
    id: "office-studio",
    name: "제작 스튜디오",
    latitude: 37.5651,
    longitude: 126.98955,
    allowedRadiusMeters: 300,
    qrPath: "/qr/office-studio"
  }
];

export const attendanceRecords: AttendanceRecord[] = [
  {
    id: "att-2026-07-08-emp-ops-1",
    employeeId: "emp-ops-1",
    date: "2026-07-08",
    clockInAt: "2026-07-08T07:58:00+09:00",
    clockOutAt: "2026-07-08T16:35:00+09:00",
    status: "GPS_PASSED",
    verificationId: "ver-seed-1",
    earlyLeaveMinutes: 25
  },
  {
    id: "att-2026-07-08-emp-ops-2",
    employeeId: "emp-ops-2",
    date: "2026-07-08",
    clockInAt: "2026-07-08T08:05:00+09:00",
    status: "GPS_FAILED_QR_ALLOWED",
    verificationId: "ver-seed-2",
    earlyLeaveMinutes: 0
  }
];

export const leaveRequests: LeaveRequest[] = [
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
    employeeId: "emp-ops-1",
    type: "ANNUAL",
    startsOn: "2026-06-20",
    endsOn: "2026-06-20",
    days: 1,
    reason: "가족 일정",
    status: "APPROVED"
  }
];

export const earlyLeaveLedger: EarlyLeaveLedger[] = [
  {
    id: "early-1",
    employeeId: "emp-ops-1",
    date: "2026-07-08",
    minutes: 25,
    status: "UNAPPROVED",
    reason: "실제 퇴근 기록 기준"
  },
  {
    id: "early-2",
    employeeId: "emp-ops-2",
    date: "2026-07-03",
    minutes: 40,
    status: "FLEX_ALLOWED",
    reason: "성수기 이후 물량 조정"
  }
];

export const overtimeRequests: OvertimeRequest[] = [
  {
    id: "ot-1",
    employeeId: "emp-ops-1",
    date: "2026-07-09",
    startsAt: "2026-07-09T17:30:00+09:00",
    endsAt: "2026-07-09T19:00:00+09:00",
    minutes: 90,
    reason: "월말 정산 마감",
    status: "APPROVED",
    payApproved: false
  }
];

export const corrections: AttendanceCorrection[] = [
  {
    id: "corr-1",
    attendanceId: "att-2026-07-08-emp-ops-2",
    employeeId: "emp-ops-2",
    correctedById: "emp-ceo",
    type: "APPROVED_LATE",
    beforeValue: "2026-07-08T08:05:00+09:00",
    afterValue: "2026-07-08T08:00:00+09:00",
    reason: "GPS수신실패 후 QR 출근, 사무실 도착 확인",
    createdAt: "2026-07-08T08:30:00+09:00"
  }
];

export const payrollStatements: PayrollStatement[] = [
  {
    id: "pay-1",
    employeeId: "emp-ops-1",
    month: "2026-06",
    filename: "2026-06-payroll-kim.pdf",
    uploadedAt: "2026-07-05T10:00:00+09:00"
  }
];

export const auditLogs: AuditLog[] = [
  {
    id: "audit-1",
    actorId: "emp-ceo",
    action: "ATTENDANCE_CORRECTED",
    targetType: "AttendanceRecord",
    targetId: "att-2026-07-08-emp-ops-2",
    createdAt: "2026-07-08T08:30:00+09:00",
    detail: "인정지각 처리 및 보정 사유 기록"
  },
  {
    id: "audit-2",
    actorId: "emp-ops-1",
    action: "PAYROLL_VIEWED",
    targetType: "PayrollStatement",
    targetId: "pay-1",
    createdAt: "2026-07-08T09:10:00+09:00",
    detail: "본인 급여명세서 열람"
  }
];
