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

export function buildEmployeeCardViewModel(employee: Employee, mode: EmployeeCardMode): EmployeeCardRow[] {
  const baseRows: EmployeeCardRow[] = [
    row("employeeNumber", "사번", employee.employeeNumber),
    row("name", "이름", employee.name),
    row("position", "직위", employee.position),
    row("hireDate", "입사일", employee.hireDate),
    row("residentRegistrationNumber", "주민등록번호", maskResidentRegistrationNumber(employee.residentRegistrationNumber), {
      sensitive: true
    }),
    row("birthday", "생일", employee.birthday),
    row("address", "주소", employee.address, { sensitive: true }),
    row("mobile", "휴대전화", employee.mobile, { sensitive: true }),
    row("emergencyContact", "비상연락처", employee.emergencyContact, { sensitive: true }),
    row("familyRelations", "가족관계", employee.familyRelations, { sensitive: true }),
    row("payrollBank", "급여은행", employee.payrollBank),
    row("payrollAccount", "급여계좌", employee.payrollAccount, { sensitive: true })
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
    ...(employee.customAdminFields ?? defaultCustomAdminFields).map((field) =>
      row(field.id, field.label, field.value, {
        adminOnly: true,
        sensitive: field.sensitive
      })
    )
  ];
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

function formatWon(value: number | undefined) {
  return value === undefined ? "-" : `${value.toLocaleString("ko-KR")}원`;
}

function formatPeople(value: number | undefined) {
  return value === undefined ? "-" : `${value}명`;
}
