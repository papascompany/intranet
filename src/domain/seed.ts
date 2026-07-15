import type {
  AttendanceCorrection,
  AttendanceRecord,
  AuditLog,
  DailyWorkTask,
  EarlyLeaveLedger,
  Employee,
  LeaveRequest,
  OvertimeRequest,
  PayrollStatement,
  Workplace
} from "./types.js";

export const employees: Employee[] = [
  {
    id: "emp-ceo",
    name: "대표",
    role: "HR_ADMIN",
    department: "운영팀",
    hireDate: "2024-03-01",
    employeeNumber: "EMP-0001",
    position: "대표",
    residentRegistrationNumber: "000000-0000001",
    birthday: "1988-01-01",
    address: "서울시 샘플구 테스트로 1",
    mobile: "010-0000-0001",
    emergencyContact: "010-9999-0001 (샘플 연락처)",
    familyRelations: "샘플 배우자 1명",
    payrollBank: "샘플은행",
    payrollAccount: "000-0000-000001",
    annualSalary: 120000000,
    severancePay: 18000000,
    incomeDeductionDependents: 1,
    customAdminFields: [
      { id: "custom-admin-field-1", label: "관리 메모 1", value: "샘플: 법인카드 지급" },
      { id: "custom-admin-field-2", label: "관리 메모 2", value: "샘플: 임원 계약서 보관" },
      { id: "custom-admin-field-3", label: "관리 메모 3", value: "샘플: 보안교육 완료" },
      { id: "custom-admin-field-4", label: "관리 메모 4", value: "샘플: 건강검진 안내" },
      { id: "custom-admin-field-5", label: "관리 메모 5", value: "샘플: 비상연락망 확인" }
    ],
    workplaceId: "office-main",
    pilot: true
  },
  {
    id: "emp-ops-1",
    name: "김운영",
    role: "EMPLOYEE",
    department: "운영팀",
    hireDate: "2026-01-10",
    employeeNumber: "EMP-0002",
    position: "운영 매니저",
    residentRegistrationNumber: "000000-0000002",
    birthday: "1992-04-12",
    address: "서울시 예시구 샘플길 2",
    mobile: "010-0000-0002",
    emergencyContact: "010-9999-0002 (샘플 가족)",
    familyRelations: "샘플 부모 2명",
    payrollBank: "예시은행",
    payrollAccount: "000-0000-000002",
    annualSalary: 52000000,
    severancePay: 3200000,
    incomeDeductionDependents: 2,
    customAdminFields: [
      { id: "custom-admin-field-1", label: "관리 메모 1", value: "샘플: 노트북 지급" },
      { id: "custom-admin-field-2", label: "관리 메모 2", value: "샘플: 온보딩 완료" },
      { id: "custom-admin-field-3", label: "관리 메모 3", value: "샘플: 급여계좌 확인" },
      { id: "custom-admin-field-4", label: "관리 메모 4", value: "샘플: 연차 산정 검토" },
      { id: "custom-admin-field-5", label: "관리 메모 5", value: "샘플: 파일럿 대상" }
    ],
    approverId: "emp-ceo",
    workplaceId: "office-main",
    pilot: true
  },
  {
    id: "emp-ops-2",
    name: "이정산",
    role: "APPROVER",
    department: "운영팀",
    hireDate: "2025-11-15",
    employeeNumber: "EMP-0003",
    position: "정산 리드",
    residentRegistrationNumber: "000000-0000003",
    birthday: "1990-09-20",
    address: "서울시 샘플구 데모로 3",
    mobile: "010-0000-0003",
    emergencyContact: "010-9999-0003 (샘플 보호자)",
    familyRelations: "샘플 형제 1명",
    payrollBank: "테스트은행",
    payrollAccount: "000-0000-000003",
    annualSalary: 68000000,
    severancePay: 6100000,
    incomeDeductionDependents: 1,
    customAdminFields: [
      { id: "custom-admin-field-1", label: "관리 메모 1", value: "샘플: 승인권한 부여" },
      { id: "custom-admin-field-2", label: "관리 메모 2", value: "샘플: 정산권한 확인" },
      { id: "custom-admin-field-3", label: "관리 메모 3", value: "샘플: 교육자료 배포" },
      { id: "custom-admin-field-4", label: "관리 메모 4", value: "샘플: 보안서약 완료" },
      { id: "custom-admin-field-5", label: "관리 메모 5", value: "샘플: 파일럿 대상" }
    ],
    approverId: "emp-ceo",
    workplaceId: "office-main",
    pilot: true
  },
  {
    id: "emp-prod-1",
    name: "박제작",
    role: "EMPLOYEE",
    department: "제작팀",
    hireDate: "2025-08-20",
    employeeNumber: "EMP-0004",
    position: "제작 스태프",
    residentRegistrationNumber: "000000-0000004",
    birthday: "1995-12-05",
    address: "서울시 예시구 제작샘플로 4",
    mobile: "010-0000-0004",
    emergencyContact: "010-9999-0004 (샘플 지인)",
    familyRelations: "샘플 단독 세대",
    payrollBank: "데모은행",
    payrollAccount: "000-0000-000004",
    annualSalary: 46000000,
    severancePay: 4200000,
    incomeDeductionDependents: 0,
    customAdminFields: [
      { id: "custom-admin-field-1", label: "관리 메모 1", value: "샘플: 작업복 지급" },
      { id: "custom-admin-field-2", label: "관리 메모 2", value: "샘플: 스튜디오 출입 등록" },
      { id: "custom-admin-field-3", label: "관리 메모 3", value: "샘플: 안전교육 완료" },
      { id: "custom-admin-field-4", label: "관리 메모 4", value: "샘플: 장비교육 예정" },
      { id: "custom-admin-field-5", label: "관리 메모 5", value: "샘플: 제작팀 배정" }
    ],
    approverId: "emp-ops-2",
    workplaceId: "office-studio",
    pilot: false
  }
];

export const workplaces: Workplace[] = [
  {
    id: "office-main",
    name: "삼송테크노밸리",
    latitude: 37.64907,
    longitude: 126.901901,
    allowedRadiusMeters: 300,
    qrPath: "/qr/samsong-techno-valley"
  },
  {
    id: "office-studio",
    name: "에이스하이엔드타워 지축역",
    latitude: 37.643093,
    longitude: 126.883733,
    allowedRadiusMeters: 300,
    qrPath: "/qr/ace-highend-jichuk"
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
    storageBucket: "payroll-statements",
    storagePath: "emp-ops-1/2026-06/2026-06-payroll-kim.pdf",
    uploadedBy: "emp-ceo",
    uploadedAt: "2026-07-05T10:00:00+09:00"
  }
];

export const dailyWorkTasks: DailyWorkTask[] = [
  {
    id: "daily-task-ops-1",
    employeeId: "emp-ops-1",
    department: "운영팀",
    date: "2026-07-12",
    title: "오전 주문 정산 확인",
    dueLabel: "오전 11:00",
    displayOrder: 1,
    status: "IN_PROGRESS"
  },
  {
    id: "daily-task-prod-1",
    employeeId: "emp-prod-1",
    department: "제작팀",
    date: "2026-07-12",
    title: "제품 상세컷 1차 보정",
    dueLabel: "오후 3:00",
    displayOrder: 1,
    status: "TODO"
  },
  {
    id: "daily-task-prod-2",
    employeeId: "emp-prod-1",
    department: "제작팀",
    date: "2026-07-12",
    title: "촬영 원본 업로드 확인",
    dueLabel: "퇴근 전",
    displayOrder: 2,
    status: "DONE",
    completedAt: "2026-07-12T09:10:00+09:00"
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
