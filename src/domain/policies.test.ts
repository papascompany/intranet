import { describe, expect, it } from "vitest";
import { calculateEarlyLeaveMinutes, calculateRecognizedWorkMinutes, evaluateVerification } from "./attendance";
import { advanceLeaveGrantedDays, getLeaveBalance, monthsSinceHire, statutoryAnnualLeaveDays } from "./leave";
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
        latitude: 37.6491,
        longitude: 126.9019,
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

  it("calculates statutory accrual on the hire-date anniversary without server timezone drift", () => {
    expect(monthsSinceHire("2025-07-21", "2026-07-20T23:59:59+09:00")).toBe(11);
    expect(monthsSinceHire("2025-07-21", "2026-07-21T00:00:00+09:00")).toBe(12);
    expect(statutoryAnnualLeaveDays("2025-07-21", "2026-07-21T00:00:00+09:00")).toBe(15);
    expect(statutoryAnnualLeaveDays("2023-07-21", "2026-07-21T00:00:00+09:00")).toBe(16);
  });

  it("updates used, pending, current-year, and current-month leave immediately from the request ledger", () => {
    const balance = getLeaveBalance({
      employee: { id: "emp-1", name: "직원", role: "EMPLOYEE", department: "운영팀", hireDate: "2026-01-01", pilot: false },
      asOf: "2026-07-21T09:00:00+09:00",
      approvedRequests: [
        { id: "leave-2026-1", employeeId: "emp-1", type: "ANNUAL", startsOn: "2026-07-03", endsOn: "2026-07-03", days: 1, reason: "사용", status: "APPROVED" },
        { id: "leave-2026-2", employeeId: "emp-1", type: "HALF_DAY", startsOn: "2026-06-30", endsOn: "2026-06-30", days: 0.5, reason: "사용", status: "APPROVED" },
        { id: "leave-pending", employeeId: "emp-1", type: "ANNUAL", startsOn: "2026-07-28", endsOn: "2026-07-28", days: 1, reason: "대기", status: "PENDING" }
      ]
    });

    expect(balance).toMatchObject({ usedDays: 1.5, pendingDays: 1, currentYearUsedDays: 1.5, currentMonthUsedDays: 1 });
    expect(balance.availableDays).toBe(8.5);
  });

  it("does not carry a prior-year manual correction into the current year's accrual", () => {
    const balance = getLeaveBalance({
      employee: { id: "emp-1", name: "직원", role: "EMPLOYEE", department: "운영팀", hireDate: "2025-01-01", annualLeaveAdjustmentDays: -5, annualLeaveAdjustmentYear: 2025, pilot: false },
      asOf: "2026-07-21T09:00:00+09:00",
      approvedRequests: []
    });

    expect(balance.availableDays).toBe(30);
  });

  it("does not carry prior-year approved leave into the current year's balance", () => {
    const balance = getLeaveBalance({
      employee: { id: "emp-1", name: "직원", role: "EMPLOYEE", department: "운영팀", hireDate: "2025-01-01", pilot: false },
      asOf: "2026-07-21T09:00:00+09:00",
      approvedRequests: [
        { id: "leave-2025", employeeId: "emp-1", type: "ANNUAL", startsOn: "2025-12-29", endsOn: "2025-12-29", days: 1, reason: "전년도 사용", status: "APPROVED" },
        { id: "leave-2026", employeeId: "emp-1", type: "ANNUAL", startsOn: "2026-07-03", endsOn: "2026-07-03", days: 1, reason: "올해 사용", status: "APPROVED" }
      ]
    });

    expect(balance).toMatchObject({ usedDays: 1, currentYearUsedDays: 1, currentMonthUsedDays: 1 });
    expect(balance.availableDays).toBe(29);
  });
});

describe("early leave and overtime policy", () => {
  it("calculates early leave before 17:00", () => {
    expect(calculateEarlyLeaveMinutes("2026-07-08T16:35:00+09:00")).toBe(25);
  });

  it("calculates employee-specific recognized work minutes with minute precision", () => {
    expect(calculateRecognizedWorkMinutes("2026-07-08T16:00:00+09:00", "17:00")).toBe(60);
    expect(calculateRecognizedWorkMinutes("2026-07-08T17:30:00+09:00", "17:00")).toBe(0);
    expect(calculateRecognizedWorkMinutes("2026-07-08T16:00:00+09:00", "17:30")).toBe(90);
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
