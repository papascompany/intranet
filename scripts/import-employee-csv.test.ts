import { describe, expect, it } from "vitest";
import { createTemporaryPassword, importEmployees, parseEmployeeCsv } from "./import-employee-csv.ts";

describe("parseEmployeeCsv", () => {
  it("handles a UTF-8 BOM, quoted fields, and retains only intended sensitive columns", () => {
    const employees = parseEmployeeCsv(
      "\uFEFF아이디,사번,사원명,부서,직위,입사일,연봉,은행,주민등록번호,계좌번호,비고\r\n" +
      "alpha,EMP-001,홍길동,운영팀,\"운영, 매니저\",2026.7.4,\"50,000\",은행A,SYNTHETIC-IDENTIFIER-003,SYNTHETIC-ACCOUNT-003,IGNORED\r\n"
    );

    expect(employees).toEqual([{
      loginId: "alpha",
      employeeNumber: "EMP-001",
      name: "홍길동",
      department: "운영팀",
      position: "운영, 매니저",
      hireDate: "2026-07-04",
      annualSalary: 50000,
      payrollBank: "은행A",
      residentRegistrationNumber: "SYNTHETIC-IDENTIFIER-003",
      payrollAccount: "SYNTHETIC-ACCOUNT-003"
    }]);
    expect(Object.keys(employees[0])).not.toContain("비고");
  });

  it("rejects missing approved headers and duplicate login IDs", () => {
    expect(() => parseEmployeeCsv("아이디,사번\na,b")).toThrow("required columns");
    expect(() => parseEmployeeCsv(
      "아이디,사번,사원명,부서,직위,입사일,연봉,은행\n" +
      "alpha,EMP-001,가,운영팀,,2026-01-01,,,\n" +
      "ALPHA,EMP-002,나,제작팀,,2026-01-02,,,"
    )).toThrow("duplicate identifiers");
  });

  it("makes a high-entropy password suitable for the shared password hasher", () => {
    expect(createTemporaryPassword()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("refuses an apply import before reading the CSV when the encryption key is unavailable", async () => {
    await expect(importEmployees({ apply: true, csvPath: "/not-read-without-a-key.csv", databaseUrl: "postgres://example", encryptionKey: undefined }))
      .rejects.toThrow("EMPLOYEE_DATA_ENCRYPTION_KEY is required");
  });
});
