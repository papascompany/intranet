import { describe, expect, it } from "vitest";
import { createHrApi } from "../api/hrApi";
import { InMemoryDatabase } from "../api/inMemoryDatabase";
import { handleHrHttpRequest } from "./hrHttpHandler";

function api() {
  return createHrApi(new InMemoryDatabase(), () => "2026-07-12T09:00:00+09:00");
}

describe("hrHttpHandler", () => {
  it("serves dashboard data through the GET API surface", async () => {
    const response = await handleHrHttpRequest(
      {
        method: "GET",
        query: {
          resource: "dashboard",
          asOf: "2026-07-12T09:00:00+09:00"
        }
      },
      api()
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      asOf: "2026-07-12T09:00:00+09:00"
    });
  });

  it("serves employee snapshots through the GET API surface", async () => {
    const response = await handleHrHttpRequest(
      {
        method: "GET",
        query: {
          resource: "snapshot",
          employeeId: "emp-ops-1"
        }
      },
      api()
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      employee: {
        id: "emp-ops-1"
      }
    });
  });

  it("routes POST actions to HrApi methods", async () => {
    const response = await handleHrHttpRequest(
      {
        method: "POST",
        body: {
          action: "submitLeaveRequest",
          payload: {
            employeeId: "emp-ops-1",
            type: "HALF_DAY",
            startsOn: "2026-07-20",
            endsOn: "2026-07-20",
            days: 0.5,
            reason: "오후 개인 일정"
          }
        }
      },
      api()
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      request: {
        employeeId: "emp-ops-1",
        status: "PENDING"
      }
    });
  });

  it("routes POST lookup actions with session payloads", async () => {
    const response = await handleHrHttpRequest(
      {
        method: "POST",
        body: {
          action: "getEmployeeDirectory",
          payload: {
            session: {
              employeeId: "emp-ops-1",
              role: "EMPLOYEE",
              authenticatedAt: "2026-07-12T09:00:00+09:00",
              rememberLogin: false
            }
          }
        }
      },
      api()
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: "emp-ops-1"
      })
    ]);
  });

  it("routes daily work task status updates through the HTTP API", async () => {
    const response = await handleHrHttpRequest(
      {
        method: "POST",
        body: {
          action: "updateDailyWorkTaskStatus",
          payload: {
            taskId: "daily-task-prod-1",
            status: "DONE",
            session: {
              employeeId: "emp-prod-1",
              role: "EMPLOYEE",
              authenticatedAt: "2026-07-12T09:00:00+09:00",
              rememberLogin: false
            }
          }
        }
      },
      api()
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      task: { id: "daily-task-prod-1", status: "DONE" },
      auditLog: { action: "DAILY_WORK_TASK_STATUS_UPDATED" }
    });
  });

  it("returns a 400 response for unsupported actions", async () => {
    const response = await handleHrHttpRequest(
      {
        method: "POST",
        body: {
          action: "missingAction"
        }
      },
      api()
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Unsupported POST action: missingAction"
    });
  });
});
