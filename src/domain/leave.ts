import type { Employee, LeaveBalance, LeaveRequest } from "./types.js";

export function monthsSinceHire(hireDate: string, asOf: string) {
  const hire = new Date(hireDate);
  const today = new Date(asOf);
  let months = (today.getFullYear() - hire.getFullYear()) * 12 + today.getMonth() - hire.getMonth();

  if (today.getDate() < hire.getDate()) {
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
}): LeaveBalance {
  const usedDays = params.approvedRequests
    .filter((request) => request.employeeId === params.employee.id && request.status === "APPROVED")
    .reduce((sum, request) => sum + request.days, 0);

  const statutoryDays = statutoryAnnualLeaveDays(params.employee.hireDate, params.asOf);
  const advanceGrantedDays = advanceLeaveGrantedDays(params.employee.hireDate, params.asOf, 15);
  const statutoryUsedDays = Math.min(statutoryDays, usedDays);
  const advanceUsedDays = Math.max(usedDays - statutoryDays, 0);

  return {
    statutoryDays,
    advanceGrantedDays,
    advanceUsedDays,
    availableDays: Math.max(statutoryDays + advanceGrantedDays - statutoryUsedDays - advanceUsedDays, 0),
    pendingOffsetDays: advanceUsedDays
  };
}
