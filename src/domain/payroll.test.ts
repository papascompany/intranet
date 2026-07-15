import { describe, expect, it } from "vitest";
import { isPayrollNoticeDay, payrollNoticeDate } from "./payroll";

describe("payroll notice date", () => {
  it("uses the 10th when it is a business day", () => {
    expect(payrollNoticeDate("2026-07-15T09:00:00+09:00")).toBe("2026-07-10");
    expect(isPayrollNoticeDay("2026-07-10T09:00:00+09:00")).toBe(true);
  });

  it("moves a weekend notice to the preceding business day", () => {
    expect(payrollNoticeDate("2026-01-10T09:00:00+09:00")).toBe("2026-01-09");
  });

  it("skips a public holiday followed by a weekend", () => {
    expect(payrollNoticeDate("2026-10-10T09:00:00+09:00")).toBe("2026-10-08");
  });

  it("accepts additional holidays for lunar or one-off holidays", () => {
    expect(payrollNoticeDate("2026-07-10T09:00:00+09:00", ["2026-07-10"])).toBe("2026-07-09");
  });
});
