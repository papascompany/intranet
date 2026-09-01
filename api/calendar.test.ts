import { describe, expect, it } from "vitest";
import { createDemoAuthSession } from "../src/api/auth";
import { handleCalendarHttpRequest } from "./calendar";
import type { CompanyCalendarResponse } from "../src/api/calendarTypes";
import type { Employee } from "../src/domain/types";

const employee: Employee = {
  id: "employee-1",
  name: "테스트 직원",
  role: "EMPLOYEE",
  department: "운영팀",
  hireDate: "2026-01-01",
  pilot: false
};

const calendar: CompanyCalendarResponse = {
  month: "2026-09",
  timeZone: "Asia/Seoul",
  calendars: [{ id: "calendar-1", label: "회사일반", color: "#facc15" }],
  events: [],
  fetchedAt: "2026-09-01T00:00:00.000Z",
  source: "google"
};

describe("calendar HTTP handler", () => {
  it("requires an authenticated session", async () => {
    const result = await handleCalendarHttpRequest({ method: "GET", query: { month: "2026-09" } }, async () => calendar);
    expect(result).toEqual({ status: 401, body: { error: "Authentication required." } });
  });

  it("returns the requested month for an authenticated employee", async () => {
    const result = await handleCalendarHttpRequest(
      { method: "GET", query: { month: "2026-09" }, serverSession: createDemoAuthSession(employee) },
      async (month) => ({ ...calendar, month })
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ month: "2026-09", source: "google" });
  });

  it("does not allow calendar access before a required password change", async () => {
    const result = await handleCalendarHttpRequest(
      { method: "GET", serverSession: { ...createDemoAuthSession(employee), passwordChangeRequired: true } },
      async () => calendar
    );
    expect(result).toEqual({ status: 403, body: { error: "Password change is required before using intranet services." } });
  });
});
