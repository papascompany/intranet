import { afterEach, describe, expect, it, vi } from "vitest";
import { getDashboard, getEmployees, submitLeaveRequest } from "./hrHttpClient";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  const fetch = vi.fn(async () => {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json"
      }
    });
  });
  globalThis.fetch = fetch as typeof globalThis.fetch;
  return fetch;
}

describe("hrHttpClient", () => {
  it("posts typed actions to the server API", async () => {
    const fetch = mockFetch(200, [{ id: "emp-ops-1", name: "김운영" }]);

    const employees = await getEmployees();

    expect(fetch).toHaveBeenCalledWith(
      "/api/hr",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "getEmployees" })
      })
    );
    expect(employees).toEqual([{ id: "emp-ops-1", name: "김운영" }]);
  });

  it("throws server API errors", async () => {
    mockFetch(400, { error: "Admin permission required" });

    await expect(
      submitLeaveRequest({
        employeeId: "emp-ops-1",
        type: "HALF_DAY",
        startsOn: "2026-07-20",
        endsOn: "2026-07-20",
        days: 0.5,
        reason: "오후 개인 일정"
      })
    ).rejects.toThrow("Admin permission required");
  });

  it("falls back to the local demo API when Vite dev server has no /api/hr route", async () => {
    mockFetch(404, { error: "Not found" });

    const dashboard = await getDashboard({
      asOf: "2026-07-12T09:00:00+09:00"
    });

    expect(dashboard.asOf).toBe("2026-07-12T09:00:00+09:00");
    expect(dashboard.employeesTotal).toBeGreaterThan(0);
  });
});
