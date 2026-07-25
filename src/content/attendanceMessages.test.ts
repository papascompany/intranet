import { describe, expect, it } from "vitest";

import { attendanceMessages, pickAttendanceMessage } from "./attendanceMessages";

describe("attendance messages", () => {
  it("provides one concise and unique message for every day of the year", () => {
    expect(attendanceMessages).toHaveLength(365);
    expect(new Set(attendanceMessages).size).toBe(365);

    for (const message of attendanceMessages) {
      expect(message).toBe(message.trim());
      expect(message.length).toBeGreaterThan(0);
      expect(message.length).toBeLessThanOrEqual(40);
    }
  });

  it("selects a message across the complete random range", () => {
    expect(pickAttendanceMessage(0)).toBe(attendanceMessages[0]);
    expect(pickAttendanceMessage(0.5)).toBe(attendanceMessages[Math.floor(attendanceMessages.length / 2)]);
    expect(pickAttendanceMessage(1)).toBe(attendanceMessages[attendanceMessages.length - 1]);
    expect(pickAttendanceMessage(Number.NaN)).toBe(attendanceMessages[0]);
  });
});
