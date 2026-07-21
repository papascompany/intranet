import { describe, expect, it } from "vitest";
import type { AttendanceRecord, Employee } from "../domain/types";
import { buildRecognizedWorkStats, buildRecognizedWorkSummary, formatRecognizedMinutes } from "./recognizedWork";

const employees: Employee[] = [
  { id: "emp-1", name: "김하나", role: "EMPLOYEE", department: "운영팀", hireDate: "2026-01-01", pilot: false },
  { id: "emp-2", name: "이둘", role: "EMPLOYEE", department: "제작팀", hireDate: "2026-01-01", pilot: false }
];

const records: AttendanceRecord[] = [
  { id: "a-1", employeeId: "emp-1", date: "2026-07-08", status: "GPS_PASSED", verificationId: "v-1", earlyLeaveMinutes: 60, recognizedWorkMinutes: 60 },
  { id: "a-2", employeeId: "emp-1", date: "2026-07-09", status: "GPS_PASSED", verificationId: "v-2", earlyLeaveMinutes: 30, recognizedWorkMinutes: 30 },
  { id: "a-3", employeeId: "emp-2", date: "2026-06-30", status: "GPS_PASSED", verificationId: "v-3", earlyLeaveMinutes: 120, recognizedWorkMinutes: 120 }
];

describe("recognized work aggregation", () => {
  it("separates current month and cumulative employee totals", () => {
    expect(buildRecognizedWorkSummary(records, "2026-07-09T09:00:00+09:00")).toEqual({ monthMinutes: 90, cumulativeMinutes: 210, monthRecordCount: 2 });
  });

  it("groups a filtered period by employee and date", () => {
    const result = buildRecognizedWorkStats(records, employees, { startDate: "2026-07-08", endDate: "2026-07-09" });
    expect(result.totalMinutes).toBe(90);
    expect(result.employeeTotals).toMatchObject([{ employeeId: "emp-1", minutes: 90, days: 2 }]);
    expect(result.dateTotals).toHaveLength(2);
    expect(formatRecognizedMinutes(90)).toBe("1시간 30분");
  });
});
