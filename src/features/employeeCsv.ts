import type { Employee, Role, Workplace } from "../domain/types";

export type EmployeeImportRow = {
  rowNumber: number;
  loginId: string;
  employee: Omit<Employee, "id">;
};

const headerAliases: Record<keyof CsvFields, string[]> = {
  name: ["name", "이름", "성명"],
  loginId: ["loginid", "아이디", "로그인아이디", "로그인id"],
  employeeNumber: ["employeenumber", "사번", "인사번호"],
  role: ["role", "권한", "역할"],
  department: ["department", "부서", "소속"],
  position: ["position", "직급", "직위"],
  hireDate: ["hiredate", "입사일"],
  workplace: ["workplace", "근무지", "근무지배정", "배정근무지"],
  residentRegistrationNumber: ["residentregistrationnumber", "주민등록번호", "주민번호"],
  birthday: ["birthday", "생일", "생년월일"],
  address: ["address", "주소"],
  mobile: ["mobile", "휴대폰", "휴대전화", "전화번호"],
  emergencyContact: ["emergencycontact", "긴급연락처", "비상연락처"],
  familyRelations: ["familyrelations", "가족관계"],
  payrollBank: ["payrollbank", "급여은행", "급여은행명"],
  payrollAccount: ["payrollaccount", "계좌번호", "급여계좌", "급여계좌번호"],
  annualSalary: ["annualsalary", "연봉"],
  severancePay: ["severancepay", "퇴직금"],
  incomeDeductionDependents: ["incomedeductiondependents", "소득공제부양자", "소득공제부양가족"]
};

type CsvFields = {
  name: string;
  loginId: string;
  employeeNumber: string;
  role: string;
  department: string;
  position: string;
  hireDate: string;
  workplace: string;
  residentRegistrationNumber: string;
  birthday: string;
  address: string;
  mobile: string;
  emergencyContact: string;
  familyRelations: string;
  payrollBank: string;
  payrollAccount: string;
  annualSalary: string;
  severancePay: string;
  incomeDeductionDependents: string;
};

export function parseEmployeeCsv(csv: string, workplaces: readonly Pick<Workplace, "id" | "name">[]): EmployeeImportRow[] {
  const records = parseCsvRecords(csv);
  if (records.length < 2) throw new Error("직원명부 CSV에는 헤더와 직원 데이터가 필요합니다.");

  const headers = records[0].map(normalizeHeader);
  const indexes = Object.fromEntries(Object.entries(headerAliases).map(([key, aliases]) => [
    key,
    headers.findIndex((header) => aliases.some((alias) => normalizeHeader(alias) === header))
  ])) as Record<keyof CsvFields, number>;
  for (const field of ["name", "loginId", "employeeNumber", "hireDate", "workplace"] as const) {
    if (indexes[field] < 0) throw new Error(`CSV 필수 열이 없습니다: ${fieldLabel(field)}`);
  }

  return records.slice(1).map((values, index) => {
    const rowNumber = index + 2;
    const value = (field: keyof CsvFields) => values[indexes[field]]?.trim() ?? "";
    const name = required(value("name"), rowNumber, "이름");
    const loginId = required(value("loginId"), rowNumber, "아이디").toLowerCase();
    const employeeNumber = required(value("employeeNumber"), rowNumber, "사번").toUpperCase();
    const workplaceValue = required(value("workplace"), rowNumber, "근무지");
    const workplace = workplaces.find((item) => item.id === workplaceValue || item.name === workplaceValue);
    if (!workplace) throw new Error(`${rowNumber}행 근무지를 찾을 수 없습니다: ${workplaceValue}`);

    return {
      rowNumber,
      loginId,
      employee: {
        name,
        role: parseRole(value("role"), rowNumber),
        department: parseDepartment(value("department"), rowNumber),
        hireDate: parseDate(value("hireDate"), rowNumber, "입사일"),
        employeeNumber,
        position: optional(value("position")),
        residentRegistrationNumber: optional(value("residentRegistrationNumber")),
        birthday: optionalDate(value("birthday"), rowNumber, "생일"),
        address: optional(value("address")),
        mobile: optional(value("mobile")),
        emergencyContact: optional(value("emergencyContact")),
        familyRelations: optional(value("familyRelations")),
        payrollBank: optional(value("payrollBank")),
        payrollAccount: optional(value("payrollAccount")),
        annualSalary: optionalNumber(value("annualSalary"), rowNumber, "연봉"),
        severancePay: optionalNumber(value("severancePay"), rowNumber, "퇴직금"),
        incomeDeductionDependents: optionalInteger(value("incomeDeductionDependents"), rowNumber, "소득공제 부양가족"),
        workplaceId: workplace.id,
        pilot: false
      }
    } satisfies EmployeeImportRow;
  });
}

function parseCsvRecords(csv: string): string[][] {
  const source = csv.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (character === '"') {
      if (quoted && next === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      record.push(cell); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      record.push(cell); cell = "";
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV 따옴표가 닫히지 않았습니다.");
  record.push(cell);
  if (record.some((value) => value.trim())) records.push(record);
  return records;
}

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR").replace(/[\s_-]/g, "");
}

function required(value: string, rowNumber: number, label: string) {
  if (!value) throw new Error(`${rowNumber}행 ${label}은(는) 필수입니다.`);
  return value;
}

function optional(value: string) { return value || undefined; }

function parseDate(value: string, rowNumber: number, label: string) {
  const normalized = value.replace(/[./]/g, "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`${rowNumber}행 ${label} 형식이 올바르지 않습니다.`);
  return normalized;
}

function optionalDate(value: string, rowNumber: number, label: string) {
  return value ? parseDate(value, rowNumber, label) : undefined;
}

function optionalNumber(value: string, rowNumber: number, label: string) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${rowNumber}행 ${label} 값이 올바르지 않습니다.`);
  return parsed;
}

function optionalInteger(value: string, rowNumber: number, label: string) {
  const parsed = optionalNumber(value, rowNumber, label);
  if (parsed !== undefined && !Number.isInteger(parsed)) throw new Error(`${rowNumber}행 ${label}은(는) 정수여야 합니다.`);
  return parsed;
}

function parseDepartment(value: string, rowNumber: number): Employee["department"] {
  if (!value || value === "운영" || value === "운영팀") return "운영팀";
  if (value === "제작" || value === "제작팀") return "제작팀";
  throw new Error(`${rowNumber}행 부서는 운영팀 또는 제작팀이어야 합니다.`);
}

function parseRole(value: string, rowNumber: number): Role {
  if (!value || value === "직원" || value === "EMPLOYEE") return "EMPLOYEE";
  if (value === "승인자" || value === "APPROVER") return "APPROVER";
  if (value === "인사 관리자" || value === "HR_ADMIN") return "HR_ADMIN";
  if (value === "시스템 관리자" || value === "SYSTEM_ADMIN") return "SYSTEM_ADMIN";
  throw new Error(`${rowNumber}행 권한 값이 올바르지 않습니다.`);
}

function fieldLabel(field: keyof CsvFields) {
  const labels: Partial<Record<keyof CsvFields, string>> = { name: "이름", loginId: "아이디", employeeNumber: "사번", hireDate: "입사일", workplace: "근무지" };
  return labels[field] ?? field;
}
