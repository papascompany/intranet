import { describe, expect, it } from "vitest";
import { createHrApi } from "../api/hrApi";
import { InMemoryDatabase } from "../api/inMemoryDatabase";
import { handleHrHttpRequest } from "./hrHttpHandler";

function api() {
  return createHrApi(new InMemoryDatabase(), () => "2026-07-12T09:00:00+09:00");
}

const employeeSession = {
  employeeId: "emp-ops-1",
  role: "EMPLOYEE" as const,
  authenticatedAt: "2026-07-12T09:00:00+09:00",
  rememberLogin: false
};

const approverSession = {
  employeeId: "emp-ops-2",
  role: "APPROVER" as const,
  authenticatedAt: "2026-07-12T09:00:00+09:00",
  rememberLogin: false
};

const productionEmployeeSession = {
  employeeId: "emp-prod-1",
  role: "EMPLOYEE" as const,
  authenticatedAt: "2026-07-12T09:00:00+09:00",
  rememberLogin: false
};

describe("hrHttpHandler", () => {
  it("serves dashboard data through the GET API surface", async () => {
    const response = await handleHrHttpRequest(
      {
        method: "GET",
        query: {
          resource: "dashboard",
          asOf: "2026-07-12T09:00:00+09:00"
        },
        serverSession: employeeSession
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
        },
        serverSession: employeeSession
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

  it("serves persistence status without database credentials", async () => {
    const response = await handleHrHttpRequest(
      {
        method: "GET",
        query: { resource: "status" }
      },
      api(),
      {
        repositoryMode: "postgres",
        persistence: "persistent",
        demoOnly: false,
        databaseConfigured: true,
        reason: "DATABASE_URL_CONFIGURED"
      }
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      repositoryMode: "postgres",
      persistence: "persistent",
      demoOnly: false,
      databaseConfigured: true,
      reason: "DATABASE_URL_CONFIGURED"
    });
    expect(JSON.stringify(response.body)).not.toContain("DATABASE_URL=");
  });

  it("serves persistence status through the POST API surface", async () => {
    const response = await handleHrHttpRequest(
      { method: "POST", body: { action: "getSystemStatus" } },
      api(),
      {
        repositoryMode: "memory",
        persistence: "ephemeral",
        demoOnly: true,
        databaseConfigured: false,
        reason: "DATABASE_URL_MISSING"
      }
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ repositoryMode: "memory", demoOnly: true });
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
        },
        serverSession: employeeSession
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

  it("ignores a client supplied session and uses the trusted server session", async () => {
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
        },
        serverSession: employeeSession
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
        },
        serverSession: productionEmployeeSession
      },
      api()
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      task: { id: "daily-task-prod-1", status: "DONE" },
      auditLog: { action: "DAILY_WORK_TASK_STATUS_UPDATED" }
    });
  });

  it("routes approver daily work task plan actions through the HTTP API", async () => {
    const response = await handleHrHttpRequest(
      {
        method: "POST",
        body: {
          action: "createDailyWorkTaskPlan",
          payload: {
            employeeId: "emp-prod-1",
            date: "2026-07-13",
            title: "제작 일정 등록",
            displayOrder: 2,
            session: {
              employeeId: "emp-ops-2",
              role: "APPROVER",
              authenticatedAt: "2026-07-12T09:00:00+09:00",
              rememberLogin: false
            }
          }
        },
        serverSession: approverSession
      },
      api()
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      task: { employeeId: "emp-prod-1", title: "제작 일정 등록" },
      auditLog: { action: "DAILY_WORK_TASK_PLAN_CREATED" }
    });
  });

  it("returns a 400 response for unsupported actions", async () => {
    const response = await handleHrHttpRequest(
      {
        method: "POST",
        body: {
          action: "missingAction"
        },
        serverSession: employeeSession
      },
      api()
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "Unsupported POST action: missingAction"
    });
  });

  it("rejects protected resources without a server-authenticated session", async () => {
    const response = await handleHrHttpRequest(
      { method: "POST", body: { action: "getDashboard", payload: {} } },
      api()
    );

    expect(response).toEqual({ status: 401, body: { error: "Authentication required." } });
  });
});
