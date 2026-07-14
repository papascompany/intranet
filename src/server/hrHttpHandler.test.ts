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

const adminSession = {
  employeeId: "emp-ceo",
  role: "HR_ADMIN" as const,
  authenticatedAt: "2026-07-12T09:00:00+09:00",
  rememberLogin: false
};

describe("hrHttpHandler", () => {
  it("blocks intranet actions until a required password change is completed", async () => {
    const response = await handleHrHttpRequest({
      method: "POST",
      body: { action: "getEmployees" },
      serverSession: { ...productionEmployeeSession, passwordChangeRequired: true }
    });

    expect(response).toEqual({ status: 403, body: { error: "Password change is required before using intranet services." } });
  });

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

  it("serves the initial app data through one authenticated bootstrap action", async () => {
    const response = await handleHrHttpRequest(
      {
        method: "POST",
        body: {
          action: "getAppBootstrap",
          payload: { employeeId: "emp-ops-1", asOf: "2026-07-12T09:00:00+09:00" }
        },
        serverSession: employeeSession
      },
      api()
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      employees: [{ id: "emp-ops-1" }],
      dashboard: { employeesTotal: 1 },
      employeeSnapshot: { employee: { id: "emp-ops-1" } },
      employeeAccountStates: []
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

  it("routes admin employee account and Blob payroll registration actions with the trusted actor", async () => {
    const hrApi = api();
    const created = await handleHrHttpRequest(
      {
        method: "POST",
        body: {
          action: "createEmployeeAccount",
          payload: {
            actorId: "emp-ops-1",
            loginId: "http-staff",
            employee: {
              name: "HTTP 신규",
              role: "EMPLOYEE",
              department: "운영팀",
              hireDate: "2026-07-12",
              employeeNumber: "EMP-0200",
              pilot: false
            }
          }
        },
        serverSession: adminSession
      },
      hrApi
    );

    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ employee: { employeeNumber: "EMP-0200" }, auditLog: { actorId: "emp-ceo" } });
    const employeeId = (created.body as { employee: { id: string } }).employee.id;
    const reset = await handleHrHttpRequest(
      {
        method: "POST",
        body: {
          action: "resetEmployeeAccountPassword",
          payload: { employeeId, temporaryPassword: "HandlerReset-2026!", actorId: "emp-ops-1" }
        },
        serverSession: adminSession
      },
      hrApi
    );

    expect(reset).toMatchObject({ status: 200, body: { employeeId, auditLog: { action: "EMPLOYEE_ACCOUNT_PASSWORD_RESET", actorId: "emp-ceo" } } });
    expect(JSON.stringify(reset.body)).not.toContain("HandlerReset-2026!");
    const registered = await handleHrHttpRequest(
      {
        method: "POST",
        body: {
          action: "registerUploadedPayrollStatement",
          payload: {
            employeeId,
            month: "2026-07",
            filename: "2026-07-payroll-http.pdf",
            storagePath: `${employeeId}/2026-07/2026-07-payroll-http.pdf`
          }
        },
        serverSession: adminSession
      },
      hrApi
    );

    expect(registered.status).toBe(200);
    expect(registered.body).toMatchObject({ auditLog: { action: "PAYROLL_STATEMENT_REGISTERED", actorId: "emp-ceo" } });
    const accountStates = await handleHrHttpRequest(
      { method: "POST", body: { action: "getEmployeeAccountStates" }, serverSession: adminSession },
      hrApi
    );
    expect(accountStates).toMatchObject({
      status: 200,
      body: [expect.objectContaining({ employeeId, enabled: true, passwordChangedAt: expect.any(String) })]
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
