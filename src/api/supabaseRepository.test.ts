import { describe, expect, it } from "vitest";
import { SupabaseHrRepository } from "./supabaseRepository";

type FetchCall = {
  url: string;
  init: RequestInit | undefined;
};

function repositoryWithResponses(responses: unknown[]) {
  const calls: FetchCall[] = [];
  const fetch = async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: input.toString(), init });
    const body = responses.shift() ?? [];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  };

  return {
    calls,
    repository: new SupabaseHrRepository({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-key",
      fetch
    })
  };
}

describe("SupabaseHrRepository", () => {
  it("maps active payroll statements and excludes soft deleted rows by default", async () => {
    const { calls, repository } = repositoryWithResponses([
      [
        {
          id: "pay-1",
          employee_id: "emp-ops-1",
          payroll_month: "2026-06",
          filename: "payroll.pdf",
          storage_bucket: "payroll-statements",
          storage_path: "emp-ops-1/2026-06/payroll.pdf",
          uploaded_by: "emp-ceo",
          uploaded_at: "2026-07-01T00:00:00+09:00",
          deleted_by: null,
          deleted_at: null,
          delete_reason: null
        }
      ]
    ]);

    const statements = await repository.listPayrollStatements();
    const url = new URL(calls[0].url);

    expect(url.pathname).toBe("/rest/v1/payroll_statements");
    expect(url.searchParams.get("deleted_at")).toBe("is.null");
    expect(statements[0]).toMatchObject({
      id: "pay-1",
      employeeId: "emp-ops-1",
      month: "2026-06",
      storagePath: "emp-ops-1/2026-06/payroll.pdf"
    });
  });

  it("updates system policies with snake case columns", async () => {
    const { calls, repository } = repositoryWithResponses([
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
    const url = new URL(calls[0].url);

    expect(calls[0].init?.method).toBe("PATCH");
    expect(url.pathname).toBe("/rest/v1/system_policies");
    expect(url.searchParams.get("id")).toBe("eq.system-policy");
    expect(JSON.parse(calls[0].init?.body as string)).toMatchObject({
      gps_allowed_radius_meters: 500
    });
    expect(settings.gpsAllowedRadiusMeters).toBe(500);
  });

  it("writes audit logs using the database column names", async () => {
    const { calls, repository } = repositoryWithResponses([
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

    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(calls[0].init?.body as string)).toMatchObject({
      actor_employee_id: "emp-ceo",
      target_type: "SystemPolicy",
      target_id: "system-policy"
    });
    expect(log.actorId).toBe("emp-ceo");
  });
});
