import { describe, expect, it } from "vitest";
import { apiErrorSchema, errorCodeSchema, ERROR_CODES } from "../src/contracts/errors";

describe("contracts/errors (docs/04 §1 계약 정합)", () => {
  it("docs/04 §2.1의 SOLD_OUT 에러 예시를 파싱한다", () => {
    const docExample = {
      error: {
        code: "SOLD_OUT",
        message: "품절된 메뉴가 포함되어 있습니다",
        details: { menuItemIds: ["itm_abc"] },
      },
    };
    expect(apiErrorSchema.parse(docExample)).toEqual(docExample);
  });

  it("문서에 없는 에러 코드는 거부한다", () => {
    expect(errorCodeSchema.safeParse("SOMETHING_ELSE").success).toBe(false);
  });

  it("에러 코드는 16종이다 (docs/04 §1과 개수 일치)", () => {
    expect(ERROR_CODES).toHaveLength(16);
  });
});
