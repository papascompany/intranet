import type { Employee, LeaveBalance, LeaveRequest } from "./types.js";

export function monthsSinceHire(hireDate: string, asOf: string) {
  const hire = dateParts(hireDate);
  const today = dateParts(asOf);
  if (!hire || !today) return 0;

  let months = (today.year - hire.year) * 12 + today.month - hire.month;
  if (compareDateParts(shiftMonthsClamped(hire, months), today) > 0) {
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

export function annualLeaveCycle(hireDate: string, asOf: string) {
  const hire = dateParts(hireDate);
  const today = dateParts(asOf);
  if (!hire || !today) {
    return { startsOn: hireDate.slice(0, 10), endsOn: hireDate.slice(0, 10), completedYears: 0 };
  }

  const completedYears = Math.floor(monthsSinceHire(hireDate, asOf) / 12);
  const startsOn = shiftMonthsClamped(hire, completedYears * 12);
  const nextStartsOn = shiftMonthsClamped(hire, (completedYears + 1) * 12);
  return {
    startsOn: formatDateParts(startsOn),
    endsOn: formatDateParts(addDays(nextStartsOn, -1)),
    completedYears
  };
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
  const cycle = annualLeaveCycle(params.employee.hireDate, params.asOf);
  const currentCycleRequests = eligibleRequests.filter((request) =>
    request.startsOn >= cycle.startsOn && request.startsOn <= cycle.endsOn
  );
  const currentYearRequests = eligibleRequests.filter((request) => request.startsOn.slice(0, 4) === currentYear);
  const approvedCycleRequests = currentCycleRequests.filter((request) => request.status === "APPROVED");
  const pendingCycleRequests = currentCycleRequests.filter((request) => request.status === "PENDING");
  const approvedYearRequests = currentYearRequests.filter((request) => request.status === "APPROVED");
  const usedDays = sumDays(approvedCycleRequests);

  const autoAccrual = params.policy?.annualLeaveAutoAccrual ?? true;
  const statutoryDays = autoAccrual ? statutoryAnnualLeaveDays(params.employee.hireDate, params.asOf) : 0;
  const adjustmentYear = params.employee.annualLeaveAdjustmentYear ?? Number(currentYear);
  const adjustmentDays = adjustmentYear === Number(currentYear) ? params.employee.annualLeaveAdjustmentDays ?? 0 : 0;

  return {
    statutoryDays,
    advanceGrantedDays: 0,
    advanceUsedDays: 0,
    availableDays: Math.max(statutoryDays + adjustmentDays - usedDays, 0),
    pendingOffsetDays: 0,
    cycleStartsOn: cycle.startsOn,
    cycleEndsOn: cycle.endsOn,
    usedDays,
    pendingDays: sumDays(pendingCycleRequests),
    currentYearUsedDays: sumDays(approvedYearRequests),
    currentMonthUsedDays: sumDays(approvedYearRequests.filter((request) => request.startsOn.slice(0, 7) === currentMonth))
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

type DateParts = NonNullable<ReturnType<typeof dateParts>>;

function shiftMonthsClamped(value: DateParts, months: number): DateParts {
  const monthIndex = value.year * 12 + value.month - 1 + months;
  const year = Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12 + 1;
  return { year, month, day: Math.min(value.day, daysInMonth(year, month)) };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function compareDateParts(left: DateParts, right: DateParts) {
  return (left.year - right.year) || (left.month - right.month) || (left.day - right.day);
}

function addDays(value: DateParts, days: number): DateParts {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function formatDateParts(value: DateParts) {
  return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}
