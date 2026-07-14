import { describe, expect, it } from "vitest";
import type { Employee } from "../domain/types";
import { buildEmployeeCardViewModel } from "./employeeCardViewModel";

const employee: Employee = {
  id: "emp-ops-1",
  name: "김운영",
  role: "EMPLOYEE",
  department: "운영팀",
  hireDate: "2026-01-10",
  employeeNumber: "EMP-0002",
  position: "운영 매니저",
  residentRegistrationNumber: "000000-0000002",
  birthday: "1992-04-12",
  address: "서울시 예시구 샘플길 2",
  mobile: "010-0000-0002",
  emergencyContact: "010-9999-0002 (샘플 가족)",
  familyRelations: "샘플 부모 2명",
  payrollBank: "예시은행",
  payrollAccount: "000-0000-000002",
  annualSalary: 52000000,
  severancePay: 3200000,
  incomeDeductionDependents: 2,
  customAdminFields: [
    { id: "custom-admin-field-1", label: "관리 메모 1", value: "샘플: 노트북 지급" },
    { id: "custom-admin-field-2", label: "관리 메모 2", value: "샘플: 온보딩 완료" },
    { id: "custom-admin-field-3", label: "관리 메모 3", value: "샘플: 급여계좌 확인" },
    { id: "custom-admin-field-4", label: "관리 메모 4", value: "샘플: 연차 산정 검토" },
    { id: "custom-admin-field-5", label: "관리 메모 5", value: "샘플: 파일럿 대상" }
  ],
  approverId: "emp-ceo",
  pilot: true
};

describe("buildEmployeeCardViewModel", () => {
  it("shows only base card rows in employee mode with masked resident registration number", () => {
    const rows = buildEmployeeCardViewModel(employee, "EMPLOYEE");

    expect(rowValue(rows, "residentRegistrationNumber")).toBe("000000-0******");
    expect(rowValue(rows, "annualSalary")).toBeUndefined();
    expect(rowValue(rows, "severancePay")).toBeUndefined();
    expect(rows.some((row) => row.id.startsWith("custom-admin-field-"))).toBe(false);
  });

  it("shows the assigned workplace name when the caller provides an authorized label", () => {
    const rows = buildEmployeeCardViewModel(
      { ...employee, workplaceId: "workplace-samsong" } as Employee & { workplaceId?: string },
      "EMPLOYEE",
      { workplaceName: "삼송테크노밸리" }
    );

    expect(rows.find((row) => row.id === "workplaceAssignment")).toMatchObject({
      label: "근무지 배정",
      value: "삼송테크노밸리"
    });
    expect(JSON.stringify(rows)).not.toContain("workplace-samsong");
  });

  it("shows an unassigned workplace state when no workplace ID is present", () => {
    const rows = buildEmployeeCardViewModel(employee, "EMPLOYEE");

    expect(rowValue(rows, "workplaceAssignment")).toBe("미지정");
  });

  it("shows admin-only salary and severance rows in admin mode", () => {
    const rows = buildEmployeeCardViewModel(employee, "ADMIN");

    expect(rowValue(rows, "annualSalary")).toBe("52,000,000원");
    expect(rowValue(rows, "severancePay")).toBe("3,200,000원");
    expect(rows.find((row) => row.id === "annualSalary")).toMatchObject({
      adminOnly: true,
      sensitive: true
    });
    expect(rows.find((row) => row.id === "severancePay")).toMatchObject({
      adminOnly: true,
      sensitive: true
    });
  });

  it("keeps resident registration number masked in admin mode and includes five custom admin fields", () => {
    const rows = buildEmployeeCardViewModel(employee, "ADMIN");
    const customRows = rows.filter((row) => row.id.startsWith("custom-admin-field-"));

    expect(rowValue(rows, "residentRegistrationNumber")).toBe("000000-0******");
    expect(customRows).toHaveLength(5);
    expect(customRows.every((row) => row.adminOnly)).toBe(true);
  });

  it("restores five safe defaults when persisted custom fields are incomplete", () => {
    const rows = buildEmployeeCardViewModel({ ...employee, customAdminFields: [] as never }, "ADMIN");
    const customRows = rows.filter((row) => row.id.startsWith("custom-admin-field-"));

    expect(customRows).toHaveLength(5);
    expect(customRows[0]).toMatchObject({ label: "관리자 항목 1", value: "-" });
    expect(customRows[4]).toMatchObject({ label: "관리자 항목 5", value: "-" });
  });

  it("reveals resident registration and payroll account only after an administrator records the access", () => {
    const masked = buildEmployeeCardViewModel(employee, "ADMIN");
    const revealed = buildEmployeeCardViewModel(employee, "ADMIN", { revealSensitive: true });

    expect(rowValue(masked, "residentRegistrationNumber")).toBe("000000-0******");
    expect(rowValue(masked, "payrollAccount")).not.toBe(employee.payrollAccount);
    expect(rowValue(revealed, "residentRegistrationNumber")).toBe(employee.residentRegistrationNumber);
    expect(rowValue(revealed, "payrollAccount")).toBe(employee.payrollAccount);
  });
});

function rowValue(rows: ReturnType<typeof buildEmployeeCardViewModel>, id: string) {
  return rows.find((row) => row.id === id)?.value;
}
