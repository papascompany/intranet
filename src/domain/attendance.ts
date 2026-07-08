import type {
  AttendanceRecord,
  ClockType,
  VerificationAttempt,
  VerificationMethod,
  VerificationStatus,
  Workplace
} from "./types";

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
  scheduledEndHour?: number;
}) {
  const date = params.now.slice(0, 10);
  const record: AttendanceRecord =
    params.existing ??
    {
      id: `att-${date}-${params.employeeId}`,
      employeeId: params.employeeId,
      date,
      status: params.verification.status,
      verificationId: params.verification.id,
      earlyLeaveMinutes: 0
    };

  if (params.type === "CLOCK_IN") {
    return {
      ...record,
      clockInAt: params.now,
      status: params.verification.status,
      verificationId: params.verification.id
    };
  }

  return {
    ...record,
    clockOutAt: params.now,
    status: params.verification.status,
    verificationId: params.verification.id,
    earlyLeaveMinutes: calculateEarlyLeaveMinutes(params.now, params.scheduledEndHour ?? 17)
  };
}

export function calculateEarlyLeaveMinutes(clockOutAt: string, scheduledEndHour = 17) {
  const clockOut = new Date(clockOutAt);
  const scheduledEnd = new Date(clockOutAt);
  scheduledEnd.setHours(scheduledEndHour, 0, 0, 0);

  if (clockOut >= scheduledEnd) {
    return 0;
  }

  return Math.round((scheduledEnd.getTime() - clockOut.getTime()) / 60000);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
