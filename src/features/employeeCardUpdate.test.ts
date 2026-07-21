import { describe, expect, it } from "vitest";
import type { Employee } from "../domain/types";
import { applyEmployeeCardUpdate } from "./employeeCardUpdate";

const employee: Employee = {
  id: "emp-ops-1",
  name: "김운영",
  role: "EMPLOYEE",
  department: "운영팀",
  hireDate: "2026-01-10",
  employeeNumber: "EMP-0002",
  position: "운영 매니저",
  annualSalary: 52000000,
  pilot: true
};

describe("applyEmployeeCardUpdate", () => {
  it("updates basic and admin employee card fields", () => {
    const updated = applyEmployeeCardUpdate(employee, {
      name: "김운영",
      position: "운영 리드",
      workplaceId: "samsong-techno-valley",
      annualSalary: 56000000,
      incomeDeductionDependents: 2
    });

    expect(updated).toMatchObject({
      id: employee.id,
      name: "김운영",
      position: "운영 리드",
      workplaceId: "samsong-techno-valley",
      annualSalary: 56000000,
      incomeDeductionDependents: 2
    });
  });

  it("rejects blank required identity fields", () => {
    expect(() => applyEmployeeCardUpdate(employee, { name: " " })).toThrow("Employee name is required");
    expect(() => applyEmployeeCardUpdate(employee, { employeeNumber: "" })).toThrow("Employee number is required");
  });

  it("normalizes an admin workplace clear to an unassigned employee", () => {
    const updated = applyEmployeeCardUpdate({ ...employee, workplaceId: "samsong-techno-valley" }, { workplaceId: null });

    expect(updated.workplaceId).toBeUndefined();
  });

  it("rejects negative admin compensation fields", () => {
    expect(() => applyEmployeeCardUpdate(employee, { annualSalary: -1 })).toThrow("Annual salary");
    expect(() => applyEmployeeCardUpdate(employee, { severancePay: -1 })).toThrow("Severance pay");
    expect(() => applyEmployeeCardUpdate(employee, { incomeDeductionDependents: -1 })).toThrow(
      "Income deduction dependents"
    );
  });

  it("stores and validates an employee-specific work schedule", () => {
    const updated = applyEmployeeCardUpdate(employee, { workStartTime: "08:00", workEndTime: "17:00" });
    expect(updated).toMatchObject({ workStartTime: "08:00", workEndTime: "17:00" });
    expect(() => applyEmployeeCardUpdate(employee, { workStartTime: "18:00", workEndTime: "17:00" })).toThrow("Work end time");
  });

  it("validates the year of a manual leave balance correction", () => {
    const updated = applyEmployeeCardUpdate(employee, { annualLeaveAdjustmentDays: -3, annualLeaveAdjustmentYear: 2026 });
    expect(updated).toMatchObject({ annualLeaveAdjustmentDays: -3, annualLeaveAdjustmentYear: 2026 });
    expect(() => applyEmployeeCardUpdate(employee, { annualLeaveAdjustmentYear: 1999 })).toThrow("valid year");
  });

  it("requires exactly five ordered custom admin fields", () => {
    expect(() =>
      applyEmployeeCardUpdate(employee, {
        customAdminFields: [
          { id: "custom-admin-field-1", label: "관리 항목 1", value: "A" },
          { id: "custom-admin-field-2", label: "관리 항목 2", value: "B" },
          { id: "custom-admin-field-3", label: "관리 항목 3", value: "C" },
          { id: "custom-admin-field-4", label: "관리 항목 4", value: "D" },
          { id: "custom-admin-field-5", label: "", value: "E" }
        ]
      })
    ).toThrow("Custom admin field 5 label is required");
  });
});
