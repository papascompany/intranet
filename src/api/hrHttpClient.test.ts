import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDailyWorkTaskPlan,
  getDailyWorkTasks,
  getDashboard,
  getEmployeeAccountStates,
  getEmployees,
  getSystemStatus,
  submitLeaveRequest,
  createEmployeeAccount,
  resetEmployeeAccountPassword,
  setEmployeeAccountAccess,
  updateDailyWorkTaskPlan,
  updateDailyWorkTaskStatus
} from "./hrHttpClient";

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

  it("posts daily work task lookup and status actions", async () => {
    const fetch = mockFetch(200, { task: { id: "daily-task-prod-1", status: "DONE" }, auditLog: { id: "audit-3" } });

    await getDailyWorkTasks({ employeeId: "emp-prod-1", date: "2026-07-12" });
    const result = await updateDailyWorkTaskStatus({ taskId: "daily-task-prod-1", status: "DONE" });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/hr",
      expect.objectContaining({
        body: JSON.stringify({ action: "getDailyWorkTasks", payload: { employeeId: "emp-prod-1", date: "2026-07-12" } })
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/hr",
      expect.objectContaining({
        body: JSON.stringify({ action: "updateDailyWorkTaskStatus", payload: { taskId: "daily-task-prod-1", status: "DONE" } })
      })
    );
    expect(result.task.status).toBe("DONE");
  });

  it("posts daily work task plan create and update actions", async () => {
    const fetch = mockFetch(200, { task: { id: "daily-task-3", status: "TODO" }, auditLog: { id: "audit-4" } });
    const createInput = { employeeId: "emp-prod-1", date: "2026-07-13", title: "제작 일정 등록" };
    const updateInput = { taskId: "daily-task-3", displayOrder: 2, status: "IN_PROGRESS" as const };

    await createDailyWorkTaskPlan(createInput);
    await updateDailyWorkTaskPlan(updateInput);

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/hr",
      expect.objectContaining({ body: JSON.stringify({ action: "createDailyWorkTaskPlan", payload: createInput }) })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/hr",
      expect.objectContaining({ body: JSON.stringify({ action: "updateDailyWorkTaskPlan", payload: updateInput }) })
    );
  });

  it("retrieves safe persistence status through the server API", async () => {
    const fetch = mockFetch(200, {
      repositoryMode: "postgres",
      persistence: "persistent",
      demoOnly: false,
      databaseConfigured: true,
      reason: "DATABASE_URL_CONFIGURED"
    });

    await expect(getSystemStatus()).resolves.toMatchObject({ repositoryMode: "postgres", demoOnly: false });
    expect(fetch).toHaveBeenCalledWith(
      "/api/hr",
      expect.objectContaining({ body: JSON.stringify({ action: "getSystemStatus" }) })
    );
  });

  it("posts employee account lifecycle and safe state actions", async () => {
    const fetch = mockFetch(200, { employee: { id: "emp-1" }, temporaryPassword: "temporary-password" });
    await createEmployeeAccount({
      employee: { name: "신규", employeeNumber: "EMP-0099", role: "EMPLOYEE", department: "운영팀", hireDate: "2026-07-14", pilot: false }
    });
    await resetEmployeeAccountPassword("emp-1");
    await setEmployeeAccountAccess("emp-1", false);
    await getEmployeeAccountStates();

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/hr", expect.objectContaining({ body: JSON.stringify({ action: "createEmployeeAccount", payload: {
      employee: { name: "신규", employeeNumber: "EMP-0099", role: "EMPLOYEE", department: "운영팀", hireDate: "2026-07-14", pilot: false }
    } }) }));
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/hr", expect.objectContaining({ body: JSON.stringify({ action: "resetEmployeeAccountPassword", payload: { employeeId: "emp-1" } }) }));
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/hr", expect.objectContaining({ body: JSON.stringify({ action: "setEmployeeAccountAccess", payload: { employeeId: "emp-1", enabled: false } }) }));
    expect(fetch).toHaveBeenNthCalledWith(4, "/api/hr", expect.objectContaining({ body: JSON.stringify({ action: "getEmployeeAccountStates" }) }));
  });

  it("reports the local Vite fallback as demo-only", async () => {
    mockFetch(404, { error: "Not found" });

    await expect(getSystemStatus()).resolves.toMatchObject({
      repositoryMode: "memory",
      demoOnly: true,
      reason: "LOCAL_DEMO_FALLBACK"
    });
  });
});
