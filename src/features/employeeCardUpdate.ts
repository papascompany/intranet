import type { Employee, EmployeeCustomAdminField, EmployeeCustomAdminFields } from "../domain/types.js";

export type EmployeeCardBasicUpdate = {
  employeeNumber?: string;
  name?: string;
  position?: string;
  residentRegistrationNumber?: string;
  birthday?: string;
  address?: string;
  mobile?: string;
  emergencyContact?: string;
  familyRelations?: string;
  hireDate?: string;
  payrollBank?: string;
  payrollAccount?: string;
};

export type EmployeeCardAdminUpdate = {
  department?: Employee["department"];
  role?: Employee["role"];
  employmentStatus?: NonNullable<Employee["employmentStatus"]>;
  employmentType?: NonNullable<Employee["employmentType"]>;
  terminationDate?: string;
  workplaceId?: string | null;
  annualSalary?: number;
  severancePay?: number;
  incomeDeductionDependents?: number;
  annualLeaveAdjustmentDays?: number;
  customAdminFields?: EmployeeCustomAdminFields;
};

export type EmployeeCardUpdateInput = EmployeeCardBasicUpdate & EmployeeCardAdminUpdate;

const customFieldIds = [
  "custom-admin-field-1",
  "custom-admin-field-2",
  "custom-admin-field-3",
  "custom-admin-field-4",
  "custom-admin-field-5"
] satisfies EmployeeCustomAdminField["id"][];

export function applyEmployeeCardUpdate(employee: Employee, input: EmployeeCardUpdateInput): Employee {
  validateEmployeeCardUpdate(input);
  const { workplaceId, ...otherUpdates } = input;

  return {
    ...employee,
    ...otherUpdates,
    ...(workplaceId === undefined ? {} : { workplaceId: workplaceId ?? undefined })
  };
}

export function validateEmployeeCardUpdate(input: EmployeeCardUpdateInput) {
  if (input.name !== undefined && input.name.trim() === "") {
    throw new Error("Employee name is required");
  }

  if (input.employeeNumber !== undefined && input.employeeNumber.trim() === "") {
    throw new Error("Employee number is required");
  }

  if (input.annualSalary !== undefined && input.annualSalary < 0) {
    throw new Error("Annual salary must be zero or greater");
  }

  if (input.severancePay !== undefined && input.severancePay < 0) {
    throw new Error("Severance pay must be zero or greater");
  }

  if (input.incomeDeductionDependents !== undefined && (!Number.isInteger(input.incomeDeductionDependents) || input.incomeDeductionDependents < 0)) {
    throw new Error("Income deduction dependents must be a non-negative integer");
  }

  if (input.annualLeaveAdjustmentDays !== undefined && !Number.isFinite(input.annualLeaveAdjustmentDays)) {
    throw new Error("Annual leave adjustment must be a finite number");
  }

  if (input.customAdminFields) {
    validateCustomAdminFields(input.customAdminFields);
  }
}

export function validateCustomAdminFields(fields: EmployeeCustomAdminFields) {
  if (fields.length !== 5) {
    throw new Error("Exactly five custom admin fields are required");
  }

  fields.forEach((field, index) => {
    if (field.id !== customFieldIds[index]) {
      throw new Error(`Custom admin field ${index + 1} id must be ${customFieldIds[index]}`);
    }

    if (field.label.trim() === "") {
      throw new Error(`Custom admin field ${index + 1} label is required`);
    }
  });
}
