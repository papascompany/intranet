import { describe, expect, it } from "vitest";
import { calculateEarlyLeaveMinutes, evaluateVerification } from "./attendance";
import { advanceLeaveGrantedDays, statutoryAnnualLeaveDays } from "./leave";
import { offsetOvertimeWithEarlyLeave } from "./overtime";
import { workplaces } from "./seed";

describe("attendance verification policy", () => {
  it("passes GPS inside the 300m office radius", () => {
    const result = evaluateVerification({
      employeeId: "emp-ops-1",
      workplaces,
      method: "GPS",
      now: "2026-07-08T08:00:00+09:00",
      coordinate: {
        latitude: 37.5666,
        longitude: 126.9781,
        accuracyMeters: 15
      }
    });

    expect(result.status).toBe("GPS_PASSED");
    expect(result.distanceMeters).toBeLessThanOrEqual(300);
  });

  it("allows QR marked attendance when GPS fails", () => {
    const result = evaluateVerification({
      employeeId: "emp-ops-1",
      workplaces,
      method: "QR",
      now: "2026-07-08T08:00:00+09:00",
      gpsError: true
    });

    expect(result.status).toBe("GPS_FAILED_QR_ALLOWED");
    expect(result.note).toBe("GPS수신실패");
  });
});

describe("leave policy", () => {
  it("grants advance leave monthly after three months", () => {
    expect(advanceLeaveGrantedDays("2026-01-10", "2026-04-10")).toBe(1);
    expect(advanceLeaveGrantedDays("2026-01-10", "2026-05-10")).toBe(2);
  });

  it("caps statutory leave at 25 days", () => {
    expect(statutoryAnnualLeaveDays("2000-01-01", "2026-07-08")).toBe(25);
  });
});

describe("early leave and overtime policy", () => {
  it("calculates early leave before 17:00", () => {
    expect(calculateEarlyLeaveMinutes("2026-07-08T16:35:00+09:00")).toBe(25);
  });

  it("offsets overtime with early leave outside January and February", () => {
    const result = offsetOvertimeWithEarlyLeave({
      date: "2026-03-15",
      earlyLeaveMinutes: 30,
      overtimeMinutes: 90,
      payApproved: false
    });

    expect(result.appliedMinutes).toBe(30);
    expect(result.remainingOvertimeMinutes).toBe(60);
    expect(result.payEligibleMinutes).toBe(0);
  });

  it("excludes peak season from offset", () => {
    const result = offsetOvertimeWithEarlyLeave({
      date: "2026-01-15",
      earlyLeaveMinutes: 30,
      overtimeMinutes: 90,
      payApproved: true
    });

    expect(result.status).toBe("OFFSET_EXCLUDED_PEAK_SEASON");
    expect(result.appliedMinutes).toBe(0);
    expect(result.payEligibleMinutes).toBe(90);
  });
});
