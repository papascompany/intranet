import { describe, expect, it } from "vitest";
import { calculateLeaveDays, chargeableLeaveDates, workDayCode } from "./leave";

describe("leave workday calculation", () => {
  const workDays = ["MON", "TUE", "WED", "THU", "FRI"] as const;

  it("excludes weekends and company holidays from a date range", () => {
    expect(chargeableLeaveDates({
      startsOn: "2026-08-14",
      endsOn: "2026-08-18",
      workDays: [...workDays],
      holidayDates: ["2026-08-17"]
    })).toEqual(["2026-08-14", "2026-08-18"]);
    expect(calculateLeaveDays({
      type: "ANNUAL",
      startsOn: "2026-08-14",
      endsOn: "2026-08-18",
      workDays: [...workDays],
      holidayDates: ["2026-08-17"]
    })).toBe(2);
  });

  it("charges a half day only when AM or PM is selected on a workday", () => {
    expect(calculateLeaveDays({
      type: "HALF_DAY",
      startsOn: "2026-08-14",
      endsOn: "2026-08-14",
      halfDayPeriod: "PM",
      workDays: [...workDays]
    })).toBe(0.5);
    expect(calculateLeaveDays({
      type: "HALF_DAY",
      startsOn: "2026-08-15",
      endsOn: "2026-08-15",
      halfDayPeriod: "AM",
      workDays: [...workDays]
    })).toBe(0);
  });

  it("uses stable UTC weekday codes for date-only values", () => {
    expect(workDayCode("2026-08-14")).toBe("FRI");
    expect(workDayCode("2026-08-15")).toBe("SAT");
  });
});
