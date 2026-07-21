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
  annualLeaveAdjustmentYear?: number;
  customAdminFields?: EmployeeCustomAdminFields;
  workStartTime?: string | null;
  workEndTime?: string | null;
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
  const { workplaceId, workStartTime, workEndTime, ...otherUpdates } = input;
  const nextWorkStartTime = workStartTime === undefined ? employee.workStartTime : workStartTime ?? undefined;
  const nextWorkEndTime = workEndTime === undefined ? employee.workEndTime : workEndTime ?? undefined;
  validateEmployeeSchedule(nextWorkStartTime, nextWorkEndTime);

  return {
    ...employee,
    ...otherUpdates,
    ...(workplaceId === undefined ? {} : { workplaceId: workplaceId ?? undefined }),
    ...(workStartTime === undefined ? {} : { workStartTime: nextWorkStartTime }),
    ...(workEndTime === undefined ? {} : { workEndTime: nextWorkEndTime })
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

  if (input.annualLeaveAdjustmentYear !== undefined && (!Number.isInteger(input.annualLeaveAdjustmentYear) || input.annualLeaveAdjustmentYear < 2000 || input.annualLeaveAdjustmentYear > 2100)) {
    throw new Error("Annual leave adjustment year must be a valid year");
  }

  if (input.customAdminFields) {
    validateCustomAdminFields(input.customAdminFields);
  }

  const hasWorkStart = input.workStartTime !== undefined;
  const hasWorkEnd = input.workEndTime !== undefined;
  if (hasWorkStart && input.workStartTime !== null && !validTime(input.workStartTime)) {
    throw new Error("Work start time must be a valid time");
  }
  if (hasWorkEnd && input.workEndTime !== null && !validTime(input.workEndTime)) {
    throw new Error("Work end time must be a valid time");
  }
  if (hasWorkStart && hasWorkEnd && input.workStartTime !== null && input.workEndTime !== null && input.workStartTime! >= input.workEndTime!) {
    throw new Error("Work end time must be after work start time");
  }
}

function validTime(value: string | undefined) {
  return value !== undefined && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validateEmployeeSchedule(workStartTime: string | undefined, workEndTime: string | undefined) {
  if (workStartTime === undefined && workEndTime === undefined) return;
  if (!validTime(workStartTime) || !validTime(workEndTime) || workStartTime! >= workEndTime!) {
    throw new Error("Work end time must be after work start time");
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
