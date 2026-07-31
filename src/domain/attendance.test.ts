import { describe, expect, it } from "vitest";
import { isMissingClockOut } from "./attendance";
import type { AttendanceRecord } from "./types";

const record: AttendanceRecord = {
  id: "att-1",
  employeeId: "emp-1",
  date: "2026-07-31",
  clockInAt: "2026-07-31T08:00:00+09:00",
  status: "GPS_PASSED",
  verificationId: "ver-1",
  earlyLeaveMinutes: 0
};

describe("missing checkout detection", () => {
  it("opens the queue after the employee schedule ends", () => {
    expect(isMissingClockOut({ record, asOf: "2026-07-31T16:59:00+09:00", scheduledEndTime: "17:00", isScheduledWorkDay: true })).toBe(false);
    expect(isMissingClockOut({ record, asOf: "2026-07-31T17:00:00+09:00", scheduledEndTime: "17:00", isScheduledWorkDay: true })).toBe(true);
  });

  it("keeps completed or non-workday records out of the queue", () => {
    expect(isMissingClockOut({ record: { ...record, clockOutAt: "2026-07-31T16:00:00+09:00" }, asOf: "2026-08-01T09:00:00+09:00", scheduledEndTime: "17:00", isScheduledWorkDay: true })).toBe(false);
    expect(isMissingClockOut({ record, asOf: "2026-08-01T09:00:00+09:00", scheduledEndTime: "17:00", isScheduledWorkDay: false })).toBe(false);
  });
});
