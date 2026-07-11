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
});
