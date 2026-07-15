import { describe, expect, it } from "vitest";
import { parseEmployeeCsv } from "./employeeCsv";

const workplaces = [
  { id: "samsong", name: "삼송테크노밸리", latitude: 37, longitude: 126, allowedRadiusMeters: 300, qrPath: "/qr/samsong" },
  { id: "ace", name: "에이스하이엔드타워 지축역", latitude: 37, longitude: 126, allowedRadiusMeters: 300, qrPath: "/qr/ace" }
];

describe("employee CSV parser", () => {
  it("parses Korean headers, quoted commas, dates, numbers, and workplace names", () => {
    const rows = parseEmployeeCsv([
      "이름,아이디,사번,부서,직급,입사일,근무지,주민등록번호,연봉,가족관계",
      '홍길동,hong-gil,ts-100,제작팀,대리,2026.07.01,삼송테크노밸리,900101-1234567,"32,000","배우자, 1명"'
    ].join("\n"), workplaces);

    expect(rows[0]).toMatchObject({
      loginId: "hong-gil",
      employee: {
        employeeNumber: "TS-100",
        department: "제작팀",
        hireDate: "2026-07-01",
        workplaceId: "samsong",
        residentRegistrationNumber: "900101-1234567"
      }
    });
  });

  it("rejects missing required fields and unknown workplaces", () => {
    expect(() => parseEmployeeCsv("이름,아이디,사번,입사일,근무지\n홍길동,hong,TS-1,2026-07-01,없는곳", workplaces))
      .toThrow("근무지를 찾을 수 없습니다");
    expect(() => parseEmployeeCsv("이름,아이디,사번,입사일\n홍길동,hong,TS-1,2026-07-01", workplaces))
      .toThrow("CSV 필수 열이 없습니다: 근무지");
  });
});
