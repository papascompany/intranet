import type {
  AttendanceRecord,
  ClockType,
  VerificationAttempt,
  VerificationMethod,
  VerificationStatus,
  Workplace
} from "./types.js";

type Coordinate = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

export function distanceMeters(a: Coordinate, b: Coordinate) {
  const radius = 6371000;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function evaluateVerification(params: {
  employeeId: string;
  workplaces: Workplace[];
  coordinate?: Coordinate;
  method: VerificationMethod;
  now: string;
  gpsError?: boolean;
}): VerificationAttempt {
  const id = `ver-${Date.parse(params.now)}-${params.employeeId}`;
  const fallback = params.workplaces[0];

  if (!params.coordinate || params.gpsError) {
    const status: VerificationStatus =
      params.method === "QR" ? "GPS_FAILED_QR_ALLOWED" : "GPS_FAILED_ALLOWED";

    return {
      id,
      employeeId: params.employeeId,
      workplaceId: fallback?.id,
      method: params.method,
      status,
      attemptedAt: params.now,
      accuracyMeters: params.coordinate?.accuracyMeters,
      note: "GPS수신실패"
    };
  }

  const measured = params.workplaces
    .map((workplace) => ({
      workplace,
      distance: distanceMeters(params.coordinate!, workplace)
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  if (!measured) {
    return {
      id,
      employeeId: params.employeeId,
      method: params.method,
      status: "MANUAL_REVIEW_REQUIRED",
      attemptedAt: params.now,
      note: "등록된 근무지가 없습니다."
    };
  }

  const inside = measured.distance <= measured.workplace.allowedRadiusMeters;

  return {
    id,
    employeeId: params.employeeId,
    workplaceId: measured.workplace.id,
    method: params.method,
    status: inside ? "GPS_PASSED" : "OUT_OF_RANGE",
    attemptedAt: params.now,
    distanceMeters: Math.round(measured.distance),
    accuracyMeters: params.coordinate.accuracyMeters
  };
}

export function buildAttendanceRecord(params: {
  employeeId: string;
  type: ClockType;
  verification: VerificationAttempt;
  existing?: AttendanceRecord;
  now: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  scheduledEndHour?: number;
}): AttendanceRecord {
  const date = params.now.slice(0, 10);
  const lateMinutes = params.type === "CLOCK_IN"
    ? calculateLateMinutes(params.now, params.scheduledStartTime)
    : params.existing?.lateMinutes ?? 0;
  const reviewStatus = requiresAttendanceReview(params.verification.status)
    ? "PENDING"
    : params.existing?.reviewStatus ?? "NOT_REQUIRED";
  const record: AttendanceRecord =
    params.existing ??
    {
      id: `att-${date}-${params.employeeId}`,
      employeeId: params.employeeId,
      date,
      status: params.verification.status,
      verificationId: params.verification.id,
      earlyLeaveMinutes: 0,
      workStatus: lateMinutes > 0 ? "LATE" : "NORMAL",
      lateMinutes,
      reviewStatus
    };

  if (params.type === "CLOCK_IN") {
    return {
      ...record,
      clockInAt: params.now,
      status: params.verification.status,
      verificationId: params.verification.id,
      workStatus: lateMinutes > 0 ? "LATE" : "NORMAL",
      lateMinutes,
      reviewStatus
    };
  }

  const existingReviewIsOpen = params.existing?.reviewStatus === "PENDING"
    || params.existing?.reviewStatus === "EVIDENCE_REQUESTED"
    || (!params.existing?.reviewStatus && params.existing && requiresAttendanceReview(params.existing.status));
  const incomingReviewIsOpen = requiresAttendanceReview(params.verification.status);
  const verificationStatus = !incomingReviewIsOpen && existingReviewIsOpen
    ? record.status
    : params.verification.status;
  const verificationId = !incomingReviewIsOpen && existingReviewIsOpen
    ? record.verificationId
    : params.verification.id;

  return {
    ...record,
    clockOutAt: params.now,
    status: verificationStatus,
    verificationId,
    workStatus: record.workStatus ?? "NORMAL",
    lateMinutes: record.lateMinutes ?? 0,
    reviewStatus,
    reviewedById: incomingReviewIsOpen ? undefined : record.reviewedById,
    reviewedAt: incomingReviewIsOpen ? undefined : record.reviewedAt,
    reviewNote: incomingReviewIsOpen ? undefined : record.reviewNote,
    earlyLeaveMinutes: calculateRecognizedWorkMinutes(
      params.now,
      params.scheduledEndTime ?? `${String(params.scheduledEndHour ?? 17).padStart(2, "0")}:00`
    ),
    recognizedWorkMinutes: calculateRecognizedWorkMinutes(
      params.now,
      params.scheduledEndTime ?? `${String(params.scheduledEndHour ?? 17).padStart(2, "0")}:00`
    )
  };
}

export function calculateEarlyLeaveMinutes(clockOutAt: string, scheduledEndHour = 17) {
  return calculateRecognizedWorkMinutes(clockOutAt, `${String(scheduledEndHour).padStart(2, "0")}:00`);
}

export function calculateRecognizedWorkMinutes(clockOutAt: string, scheduledEndTime = "17:00") {
  const actualSeconds = koreaTimeSeconds(clockOutAt);
  const scheduledSeconds = parseTimeSeconds(scheduledEndTime);
  if (actualSeconds === undefined || scheduledSeconds === undefined) {
    return 0;
  }

  return Math.max(Math.ceil((scheduledSeconds - actualSeconds) / 60), 0);
}

export function calculateLateMinutes(clockInAt: string, scheduledStartTime?: string) {
  if (!scheduledStartTime) return 0;
  const actualSeconds = koreaTimeSeconds(clockInAt);
  const scheduledSeconds = parseTimeSeconds(scheduledStartTime);
  if (actualSeconds === undefined || scheduledSeconds === undefined) return 0;
  return Math.max(Math.ceil((actualSeconds - scheduledSeconds) / 60), 0);
}

export function requiresAttendanceReview(status: VerificationStatus) {
  return status === "OUT_OF_RANGE" || status === "MANUAL_REVIEW_REQUIRED";
}

function koreaTimeSeconds(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);
  return Number.isFinite(hour) && Number.isFinite(minute) && Number.isFinite(second)
    ? hour * 3600 + minute * 60 + second
    : undefined;
}

function parseTimeSeconds(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return undefined;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 3600 + minute * 60;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
