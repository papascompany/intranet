import { describe, expect, it } from "vitest";
import { PostgresHrRepository, type PostgresQuery } from "./postgresRepository";

type QueryCall = {
  sql: string;
  params: unknown[];
};

function repositoryWithRows(rows: Record<string, unknown>[][]) {
  const calls: QueryCall[] = [];
  const query: PostgresQuery = async (sql, params = []) => {
    calls.push({ sql, params });
    return (rows.shift() ?? []) as never;
  };

  return {
    calls,
    repository: new PostgresHrRepository({ query })
  };
}

describe("PostgresHrRepository", () => {
  it("creates the employee and auth account atomically", async () => {
    const { calls, repository } = repositoryWithRows([[{ employee_id: "emp-0099", account_id: "account-0099" }]]);

    await repository.createEmployeeWithAccount(
      {
        id: "emp-0099", name: "신규 직원", role: "EMPLOYEE", department: "운영팀", hireDate: "2026-07-14", employeeNumber: "EMP-0099", pilot: false
      },
      {
        id: "account-0099", employeeId: "emp-0099", employeeNumber: "EMP-0099", passwordHash: "pbkdf2_sha256$310000$salt$hash", passwordChangedAt: "2026-07-14T00:00:00Z", failedSignInCount: 0
      }
    );

    expect(calls[0].sql).toContain("with new_employee as");
    expect(calls[0].sql).toContain("insert into auth_accounts");
    expect(calls[0].params).toContain("EMP-0099");
    const placeholders = [...calls[0].sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
    expect([...new Set(placeholders)].sort((left, right) => left - right)).toEqual(
      Array.from({ length: calls[0].params.length }, (_, index) => index + 1)
    );
  });

  it("maps and persists the employee workplace assignment", async () => {
    const employeeRow = {
      id: "emp-ops-1",
      name: "김운영",
      role: "EMPLOYEE",
      department: "운영팀",
      hire_date: "2026-01-10",
      employee_number: "EMP-0002",
      workplace_id: "samsong-techno-valley",
      custom_admin_fields: [],
      pilot: true
    };
    const { calls, repository } = repositoryWithRows([[employeeRow]]);

    const employee = await repository.updateEmployee({
      id: "emp-ops-1",
      name: "김운영",
      role: "EMPLOYEE",
      department: "운영팀",
      hireDate: "2026-01-10",
      employeeNumber: "EMP-0002",
      workplaceId: "samsong-techno-valley",
      pilot: true
    });

    expect(calls[0].sql).toContain("workplace_id");
    expect(calls[0].params).toContain("samsong-techno-valley");
    expect(employee.workplaceId).toBe("samsong-techno-valley");
  });

  it("persists an unassigned employee workplace as null", async () => {
    const { calls, repository } = repositoryWithRows([
      [
        {
          id: "emp-ops-1",
          name: "김운영",
          role: "EMPLOYEE",
          department: "운영팀",
          hire_date: "2026-01-10",
          employee_number: "EMP-0002",
          workplace_id: null,
          custom_admin_fields: [],
          pilot: true
        }
      ]
    ]);

    const employee = await repository.updateEmployee({
      id: "emp-ops-1",
      name: "김운영",
      role: "EMPLOYEE",
      department: "운영팀",
      hireDate: "2026-01-10",
      employeeNumber: "EMP-0002",
      pilot: true
    });

    expect(calls[0].params).toContain(null);
    expect(employee.workplaceId).toBeUndefined();
  });

  it("maps active payroll statements and excludes soft deleted rows by default", async () => {
    const { calls, repository } = repositoryWithRows([
      [
        {
          id: "pay-1",
          employee_id: "emp-ops-1",
          payroll_month: "2026-06",
          filename: "payroll.pdf",
          storage_bucket: "vercel-blob",
          storage_path: "emp-ops-1/2026-06/payroll.pdf",
          uploaded_by: "emp-ceo",
          uploaded_at: "2026-07-01T00:00:00+09:00"
        }
      ]
    ]);

    const statements = await repository.listPayrollStatements();

    expect(calls[0].sql).toContain("from payroll_statements where deleted_at is null");
    expect(statements[0]).toMatchObject({
      id: "pay-1",
      employeeId: "emp-ops-1",
      month: "2026-06",
      storageBucket: "vercel-blob",
      storagePath: "emp-ops-1/2026-06/payroll.pdf"
    });
  });

  it("updates system policies with parameterized snake case columns", async () => {
    const { calls, repository } = repositoryWithRows([
      [
        {
          id: "system-policy",
          gps_allowed_radius_meters: 500,
          gps_failure_fallback: "QR_OR_MANUAL_EQUAL",
          payroll_employee_access: "VIEW_ONLY",
          payroll_delete_mode: "ADMIN_ONLY_SOFT_DELETE",
          overtime_pay_approver_role: "ADMIN_ONLY",
          advance_leave_exception_handling: "HR_CORRECTION"
        }
      ]
    ]);

    const settings = await repository.updateSettings({ gpsAllowedRadiusMeters: 500 });

    expect(calls[0].sql).toContain("update system_policies set gps_allowed_radius_meters = $2 where id = $1 returning *");
    expect(calls[0].params).toEqual(["system-policy", 500]);
    expect(settings.gpsAllowedRadiusMeters).toBe(500);
  });

  it("writes audit logs with database column names", async () => {
    const { calls, repository } = repositoryWithRows([
      [
        {
          id: "audit-1",
          actor_employee_id: "emp-ceo",
          action: "SETTINGS_UPDATED",
          target_type: "SystemPolicy",
          target_id: "system-policy",
          created_at: "2026-07-11T10:00:00+09:00",
          detail: "gpsAllowedRadiusMeters"
        }
      ]
    ]);

    const log = await repository.addAuditLog({
      id: "audit-1",
      actorId: "emp-ceo",
      action: "SETTINGS_UPDATED",
      targetType: "SystemPolicy",
      targetId: "system-policy",
      createdAt: "2026-07-11T10:00:00+09:00",
      detail: "gpsAllowedRadiusMeters"
    });

    expect(calls[0].sql).toContain("insert into audit_logs");
    expect(calls[0].sql).toContain("actor_employee_id");
    expect(calls[0].params).toContain("emp-ceo");
    expect(log.actorId).toBe("emp-ceo");
  });

  it("maps and persists daily work task status using database column names", async () => {
    const { calls, repository } = repositoryWithRows([
      [
        {
          id: "daily-task-1",
          employee_id: "emp-prod-1",
          department: "제작팀",
          work_date: "2026-07-12",
          title: "제품 상세컷 보정",
          due_label: "오후 3:00",
          display_order: 1,
          status: "TODO",
          completed_at: null
        }
      ],
      [
        {
          id: "daily-task-1",
          employee_id: "emp-prod-1",
          department: "제작팀",
          work_date: "2026-07-12",
          title: "제품 상세컷 보정",
          due_label: "오후 3:00",
          display_order: 1,
          status: "DONE",
          completed_at: "2026-07-12T14:30:00+09:00"
        }
      ]
    ]);

    const [task] = await repository.listDailyWorkTasks();
    const saved = await repository.updateDailyWorkTask({
      ...task,
      status: "DONE",
      completedAt: "2026-07-12T14:30:00+09:00"
    });

    expect(calls[0].sql).toContain("from daily_work_tasks order by work_date desc, display_order asc, id asc");
    expect(calls[1].sql).toContain("update daily_work_tasks set employee_id = $2");
    expect(calls[1].params).toContain("DONE");
    expect(saved.completedAt).toBe("2026-07-12T14:30:00+09:00");
  });

  it("inserts daily work task plans with assignment and planning fields", async () => {
    const { calls, repository } = repositoryWithRows([
      [
        {
          id: "daily-task-3",
          employee_id: "emp-prod-1",
          department: "제작팀",
          work_date: "2026-07-13",
          title: "제작 일정 등록",
          due_label: "오후 4:00",
          display_order: 2,
          status: "TODO",
          completed_at: null
        }
      ]
    ]);

    const saved = await repository.addDailyWorkTask({
      id: "daily-task-3",
      employeeId: "emp-prod-1",
      department: "제작팀",
      date: "2026-07-13",
      title: "제작 일정 등록",
      dueLabel: "오후 4:00",
      displayOrder: 2,
      status: "TODO"
    });

    expect(calls[0].sql).toContain("insert into daily_work_tasks");
    expect(calls[0].params).toEqual(expect.arrayContaining(["emp-prod-1", "제작 일정 등록", 2, "TODO"]));
    expect(saved).toMatchObject({ employeeId: "emp-prod-1", displayOrder: 2, status: "TODO" });
  });
});
