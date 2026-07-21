import type { Employee, EmployeeCustomAdminFields } from "../domain/types";

export type EmployeeCardMode = "EMPLOYEE" | "ADMIN";

export type EmployeeCardRow = {
  id: string;
  label: string;
  value: string;
  sensitive?: boolean;
  adminOnly?: boolean;
};

const defaultCustomAdminFields: EmployeeCustomAdminFields = [
  { id: "custom-admin-field-1", label: "관리자 항목 1", value: "-" },
  { id: "custom-admin-field-2", label: "관리자 항목 2", value: "-" },
  { id: "custom-admin-field-3", label: "관리자 항목 3", value: "-" },
  { id: "custom-admin-field-4", label: "관리자 항목 4", value: "-" },
  { id: "custom-admin-field-5", label: "관리자 항목 5", value: "-" }
];

function normalizedCustomAdminFields(fields: Employee["customAdminFields"]): EmployeeCustomAdminFields {
  const existingById = new Map((fields ?? []).filter(Boolean).map((field) => [field.id, field]));
  return defaultCustomAdminFields.map((fallback) => ({
    ...fallback,
    ...existingById.get(fallback.id),
    id: fallback.id
  })) as EmployeeCustomAdminFields;
}

export function buildEmployeeCardViewModel(
  employee: Employee,
  mode: EmployeeCardMode,
  options: { revealSensitive?: boolean; workplaceName?: string; defaultWorkStartTime?: string; defaultWorkEndTime?: string } = {}
): EmployeeCardRow[] {
  const revealSensitive = mode === "ADMIN" && options.revealSensitive === true;
  const baseRows: EmployeeCardRow[] = [
    row("employeeNumber", "사번", employee.employeeNumber),
    row("name", "이름", employee.name),
    row("position", "직위", employee.position),
    row("department", "부서", employee.department),
    row("employmentStatus", "재직상태", employmentStatusLabel(employee.employmentStatus)),
    row("employmentType", "직원구분", employmentTypeLabel(employee.employmentType)),
    row("hireDate", "입사일", formatDate(employee.hireDate)),
    row("terminationDate", "퇴사일", formatDate(employee.terminationDate)),
    row("workplaceAssignment", "근무지 배정", workplaceAssignment(employee, options.workplaceName)),
    row("workSchedule", "근무시간", `${employee.workStartTime ?? options.defaultWorkStartTime ?? "-"}~${employee.workEndTime ?? options.defaultWorkEndTime ?? "-"}`),
    row("residentRegistrationNumber", "주민등록번호", revealSensitive ? employee.residentRegistrationNumber : maskResidentRegistrationNumber(employee.residentRegistrationNumber), {
      sensitive: true
    }),
    row("birthday", "생일", formatDate(employee.birthday)),
    row("address", "주소", employee.address, { sensitive: true }),
    row("mobile", "휴대전화", employee.mobile, { sensitive: true }),
    row("emergencyContact", "비상연락처", employee.emergencyContact, { sensitive: true }),
    row("familyRelations", "가족관계", employee.familyRelations, { sensitive: true }),
    row("payrollBank", "급여은행", employee.payrollBank),
    row("payrollAccount", "급여계좌", revealSensitive || mode === "EMPLOYEE" ? employee.payrollAccount : maskPayrollAccount(employee.payrollAccount), { sensitive: true })
  ];

  if (mode === "EMPLOYEE") {
    return baseRows;
  }

  return [
    ...baseRows,
    row("annualSalary", "연봉", formatWon(employee.annualSalary), { adminOnly: true, sensitive: true }),
    row("severancePay", "퇴직금", formatWon(employee.severancePay), { adminOnly: true, sensitive: true }),
    row("incomeDeductionDependents", "소득공제 부양가족", formatPeople(employee.incomeDeductionDependents), {
      adminOnly: true,
      sensitive: true
    }),
    row("annualLeaveAdjustmentDays", "연차 HR 보정", formatDays(employee.annualLeaveAdjustmentDays), { adminOnly: true }),
    row("annualLeaveAdjustmentYear", "연차 HR 보정 기준연도", employee.annualLeaveAdjustmentYear ? String(employee.annualLeaveAdjustmentYear) : "현재 연도", { adminOnly: true }),
    ...normalizedCustomAdminFields(employee.customAdminFields).map((field) =>
      row(field.id, field.label, field.value, {
        adminOnly: true,
        sensitive: field.sensitive
      })
    )
  ];
}

function workplaceAssignment(employee: Employee, workplaceName?: string): string {
  const workplaceId = (employee as Employee & { workplaceId?: string }).workplaceId;
  return workplaceId ? workplaceName ?? "지정됨" : "미지정";
}

function row(
  id: string,
  label: string,
  value: string | number | undefined,
  options: Pick<EmployeeCardRow, "sensitive" | "adminOnly"> = {}
): EmployeeCardRow {
  return {
    id,
    label,
    value: formatValue(value),
    ...options
  };
}

function formatValue(value: string | number | undefined) {
  if (value === undefined || value === "") {
    return "-";
  }

  return String(value);
}

function maskResidentRegistrationNumber(value: string | undefined) {
  if (!value) {
    return "-";
  }

  const hyphenIndex = value.indexOf("-");
  if (hyphenIndex === -1) {
    return value.length <= 4 ? "*".repeat(value.length) : `${value.slice(0, 4)}${"*".repeat(value.length - 4)}`;
  }

  const visibleEnd = Math.min(hyphenIndex + 2, value.length);
  return `${value.slice(0, visibleEnd)}${"*".repeat(value.length - visibleEnd)}`;
}

function maskPayrollAccount(value: string | undefined) {
  if (!value) return "-";
  if (value.length <= 4) return "*".repeat(value.length);
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function formatWon(value: number | undefined) {
  return value === undefined ? "-" : `${value.toLocaleString("ko-KR")}원`;
}

function formatPeople(value: number | undefined) {
  return value === undefined ? "-" : `${value}명`;
}

function formatDays(value: number | undefined) {
  return value === undefined ? "-" : `${value.toLocaleString("ko-KR")}일`;
}

function formatDate(value: string | undefined) {
  return value ? value.slice(0, 10) : undefined;
}

function employmentStatusLabel(value: Employee["employmentStatus"]) {
  return { ACTIVE: "재직", LEAVE: "휴직", TERMINATED: "퇴사" }[value ?? "ACTIVE"];
}

function employmentTypeLabel(value: Employee["employmentType"]) {
  return { REGULAR: "정규직", CONTRACT: "계약직", PART_TIME: "시간제" }[value ?? "REGULAR"];
}
