export type Role = "EMPLOYEE" | "APPROVER" | "HR_ADMIN" | "SYSTEM_ADMIN";

export type Department = "운영팀" | "제작팀";

export type EmployeeCustomAdminField = {
  id: `custom-admin-field-${1 | 2 | 3 | 4 | 5}`;
  label: string;
  value: string;
  sensitive?: boolean;
};

export type EmployeeCustomAdminFields = [
  EmployeeCustomAdminField,
  EmployeeCustomAdminField,
  EmployeeCustomAdminField,
  EmployeeCustomAdminField,
  EmployeeCustomAdminField
];

export type Employee = {
  id: string;
  name: string;
  role: Role;
  department: Department;
  hireDate: string;
  employeeNumber?: string;
  position?: string;
  employmentStatus?: "ACTIVE" | "LEAVE" | "TERMINATED";
  employmentType?: "REGULAR" | "CONTRACT" | "PART_TIME";
  terminationDate?: string;
  residentRegistrationNumber?: string;
  birthday?: string;
  address?: string;
  mobile?: string;
  emergencyContact?: string;
  familyRelations?: string;
  payrollBank?: string;
  payrollAccount?: string;
  annualSalary?: number;
  severancePay?: number;
  incomeDeductionDependents?: number;
  annualLeaveAdjustmentDays?: number;
  annualLeaveAdjustmentYear?: number;
  customAdminFields?: EmployeeCustomAdminFields;
  approverId?: string;
  workplaceId?: string;
  /** Employee-specific schedule overrides. Missing values fall back to system policy. */
  workStartTime?: string;
  workEndTime?: string;
  pilot: boolean;
};

export type Workplace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
  qrPath: string;
};

export type ClockType = "CLOCK_IN" | "CLOCK_OUT";
export type VerificationMethod = "GPS" | "QR" | "WIFI_IP" | "MANUAL_CLICK";
export type VerificationStatus =
  | "GPS_PASSED"
  | "GPS_FAILED_ALLOWED"
  | "GPS_FAILED_QR_ALLOWED"
  | "OUT_OF_RANGE"
  | "MANUAL_REVIEW_REQUIRED";

export type AttendanceWorkStatus = "NORMAL" | "LATE";
export type AttendanceReviewStatus = "NOT_REQUIRED" | "PENDING" | "CONFIRMED" | "EVIDENCE_REQUESTED" | "CORRECTED";

export type VerificationAttempt = {
  id: string;
  employeeId: string;
  workplaceId?: string;
  method: VerificationMethod;
  status: VerificationStatus;
  attemptedAt: string;
  distanceMeters?: number;
  accuracyMeters?: number;
  note?: string;
};

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  date: string;
  clockInAt?: string;
  clockOutAt?: string;
  status: VerificationStatus;
  verificationId: string;
  earlyLeaveMinutes: number;
  /** Minutes between the actual clock-out and the employee's scheduled end time. */
  recognizedWorkMinutes?: number;
  workStatus?: AttendanceWorkStatus;
  lateMinutes?: number;
  reviewStatus?: AttendanceReviewStatus;
  reviewedById?: string;
  reviewedAt?: string;
  reviewNote?: string;
};

export type CorrectionType =
  | "APPROVED_LATE"
  | "APPROVED_EARLY_LEAVE"
  | "CLOCK_IN_CORRECTION"
  | "CLOCK_OUT_CORRECTION"
  | "MISSING_RECORD_CREATED";

export type AttendanceCorrection = {
  id: string;
  attendanceId: string;
  employeeId: string;
  correctedById: string;
  type: CorrectionType;
  beforeValue?: string;
  afterValue: string;
  reason: string;
  createdAt: string;
};

export type AttendanceCorrectionRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type AttendanceCorrectionRequest = {
  id: string;
  attendanceId?: string;
  employeeId: string;
  type: CorrectionType;
  beforeValue?: string;
  requestedValue: string;
  reason: string;
  status: AttendanceCorrectionRequestStatus;
  decidedBy?: string;
  decidedAt?: string;
  createdAt: string;
};

export type LeaveType = "ANNUAL" | "HALF_DAY" | "SPECIAL" | "UNPAID";

export type LeaveBalanceAdjustment = {
  id: string;
  employeeId: string;
  days: number;
  reason: string;
  createdBy: string;
  createdAt: string;
  year?: number;
};
export type RequestStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type LeaveRequest = {
  id: string;
  employeeId: string;
  type: LeaveType;
  startsOn: string;
  endsOn: string;
  days: number;
  reason: string;
  status: RequestStatus;
  decidedBy?: string;
  decidedAt?: string;
};

export type LeaveBalance = {
  statutoryDays: number;
  advanceGrantedDays: number;
  advanceUsedDays: number;
  availableDays: number;
  pendingOffsetDays: number;
  /** Approved annual/half-day usage in the current leave year, calculated from the leave request ledger. */
  usedDays?: number;
  pendingDays?: number;
  currentYearUsedDays?: number;
  currentMonthUsedDays?: number;
};

export type EarlyLeaveStatus =
  | "APPROVED"
  | "FLEX_ALLOWED"
  | "LEAVE_RELATED"
  | "UNAPPROVED"
  | "CORRECTED";

export type EarlyLeaveLedger = {
  id: string;
  employeeId: string;
  date: string;
  minutes: number;
  status: EarlyLeaveStatus;
  reason?: string;
};

export type OvertimeRequest = {
  id: string;
  employeeId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  minutes: number;
  reason: string;
  status: RequestStatus;
  payApproved: boolean;
  decidedBy?: string;
  decidedAt?: string;
};

export type OvertimeOffsetResult = {
  appliedMinutes: number;
  remainingEarlyLeaveMinutes: number;
  remainingOvertimeMinutes: number;
  payEligibleMinutes: number;
  status: "OFFSET_APPLIED" | "OFFSET_EXCLUDED_PEAK_SEASON" | "OVERTIME_PAY_APPROVED" | "OVERTIME_PAY_NOT_COUNTED";
};

export type PayrollStatement = {
  id: string;
  employeeId: string;
  month: string;
  filename: string;
  storageBucket?: string;
  storagePath?: string;
  uploadedBy?: string;
  uploadedAt: string;
  deletedBy?: string;
  deletedAt?: string;
  deleteReason?: string;
};

export type DailyWorkTaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export type DailyWorkTask = {
  id: string;
  employeeId: string;
  department: Department;
  date: string;
  title: string;
  dueLabel?: string;
  displayOrder: number;
  status: DailyWorkTaskStatus;
  completedAt?: string;
};

export type AuditLog = {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
  detail: string;
};
