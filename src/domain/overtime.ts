import type { OvertimeOffsetResult } from "./types";

const peakSeasonMonths = new Set([0, 1]);

export function offsetOvertimeWithEarlyLeave(params: {
  date: string;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  payApproved: boolean;
}): OvertimeOffsetResult {
  const month = new Date(params.date).getMonth();

  if (peakSeasonMonths.has(month)) {
    return {
      appliedMinutes: 0,
      remainingEarlyLeaveMinutes: params.earlyLeaveMinutes,
      remainingOvertimeMinutes: params.overtimeMinutes,
      payEligibleMinutes: params.payApproved ? params.overtimeMinutes : 0,
      status: "OFFSET_EXCLUDED_PEAK_SEASON"
    };
  }

  const appliedMinutes = Math.min(params.earlyLeaveMinutes, params.overtimeMinutes);
  const remainingOvertimeMinutes = Math.max(params.overtimeMinutes - appliedMinutes, 0);

  return {
    appliedMinutes,
    remainingEarlyLeaveMinutes: Math.max(params.earlyLeaveMinutes - appliedMinutes, 0),
    remainingOvertimeMinutes,
    payEligibleMinutes: params.payApproved ? remainingOvertimeMinutes : 0,
    status: params.payApproved ? "OVERTIME_PAY_APPROVED" : "OVERTIME_PAY_NOT_COUNTED"
  };
}
