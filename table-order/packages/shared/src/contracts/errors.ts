import { z } from "zod";

// docs/04 §1 에러 코드 enum — 문서와 이 파일은 항상 함께 갱신한다(계약물).
export const ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN_TENANT",
  "FORBIDDEN_ROLE",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "SOLD_OUT",
  "STORE_CLOSED",
  "SESSION_CLOSED",
  "INVALID_TRANSITION",
  "RATE_LIMITED",
  "IDEMPOTENCY_CONFLICT",
  "PAYMENT_FAILED",
  "PLAN_LIMIT_EXCEEDED",
  "AI_CREDIT_EXHAUSTED",
  "AI_GENERATION_FAILED",
  "INTERNAL",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
