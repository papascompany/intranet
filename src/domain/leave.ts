import type { Employee, LeaveBalance, LeaveRequest } from "./types.js";

export function monthsSinceHire(hireDate: string, asOf: string) {
  const hire = dateParts(hireDate);
  const today = dateParts(asOf);
  if (!hire || !today) return 0;

  let months = (today.year - hire.year) * 12 + today.month - hire.month;

  if (today.day < hire.day) {
    months -= 1;
  }

  return Math.max(months, 0);
}

export function statutoryAnnualLeaveDays(hireDate: string, asOf: string) {
  const months = monthsSinceHire(hireDate, asOf);

  if (months < 12) {
    return Math.min(months, 11);
  }

  const years = Math.floor(months / 12);
  const extra = years >= 3 ? Math.floor((years - 1) / 2) : 0;
  return Math.min(15 + extra, 25);
}

export function advanceLeaveGrantedDays(hireDate: string, asOf: string, nextYearStatutoryCap = 15) {
  const months = monthsSinceHire(hireDate, asOf);
  if (months < 3) {
    return 0;
  }

  return Math.min(months - 2, nextYearStatutoryCap);
}

export function getLeaveBalance(params: {
  employee: Employee;
  asOf: string;
  approvedRequests: LeaveRequest[];
  policy?: { annualLeaveAutoAccrual: boolean };
}): LeaveBalance {
  const eligibleRequests = params.approvedRequests.filter((request) =>
    request.employeeId === params.employee.id
    && (request.type === "ANNUAL" || request.type === "HALF_DAY")
  );
  const asOfDate = params.asOf.slice(0, 10);
  const currentMonth = asOfDate.slice(0, 7);
  const currentYear = asOfDate.slice(0, 4);
  const currentYearRequests = eligibleRequests.filter((request) => request.startsOn.slice(0, 4) === currentYear);
  const approvedRequests = currentYearRequests.filter((request) => request.status === "APPROVED");
  const pendingRequests = currentYearRequests.filter((request) => request.status === "PENDING");
  const usedDays = sumDays(approvedRequests);

  const autoAccrual = params.policy?.annualLeaveAutoAccrual ?? true;
  const statutoryDays = autoAccrual ? statutoryAnnualLeaveDays(params.employee.hireDate, params.asOf) : 0;
  const advanceGrantedDays = autoAccrual ? advanceLeaveGrantedDays(params.employee.hireDate, params.asOf, 15) : 0;
  const statutoryUsedDays = Math.min(statutoryDays, usedDays);
  const advanceUsedDays = Math.max(usedDays - statutoryDays, 0);
  const adjustmentYear = params.employee.annualLeaveAdjustmentYear ?? Number(currentYear);
  const adjustmentDays = adjustmentYear === Number(currentYear) ? params.employee.annualLeaveAdjustmentDays ?? 0 : 0;

  return {
    statutoryDays,
    advanceGrantedDays,
    advanceUsedDays,
    availableDays: Math.max(statutoryDays + advanceGrantedDays + adjustmentDays - statutoryUsedDays - advanceUsedDays, 0),
    pendingOffsetDays: advanceUsedDays,
    usedDays,
    pendingDays: sumDays(pendingRequests),
    currentYearUsedDays: usedDays,
    currentMonthUsedDays: sumDays(approvedRequests.filter((request) => request.startsOn.slice(0, 7) === currentMonth))
  };
}

function sumDays(requests: LeaveRequest[]) {
  return requests.reduce((sum, request) => sum + request.days, 0);
}

function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return undefined;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}
