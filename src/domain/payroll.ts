const FIXED_KOREAN_HOLIDAYS = new Set([
  "01-01", // 신정
  "03-01", // 삼일절
  "05-05", // 어린이날
  "06-06", // 현충일
  "08-15", // 광복절
  "10-03", // 개천절
  "10-09", // 한글날
  "12-25" // 성탄절
]);

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function isWeekend(date: Date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** Returns the business day on which the monthly payroll notice should be shown. */
export function payrollNoticeDate(value: string, additionalHolidayDates: readonly string[] = []) {
  const currentDate = dateOnly(value);
  const [year, month] = currentDate.split("-").map(Number);
  if (!year || !month) throw new Error("Payroll notice date requires an ISO date.");

  const holidays = new Set(additionalHolidayDates.map(dateOnly));
  let candidate = new Date(Date.UTC(year, month - 1, 10));
  while (
    isWeekend(candidate)
    || FIXED_KOREAN_HOLIDAYS.has(`${String(month).padStart(2, "0")}-${String(candidate.getUTCDate()).padStart(2, "0")}`)
    || holidays.has(candidate.toISOString().slice(0, 10))
  ) {
    candidate.setUTCDate(candidate.getUTCDate() - 1);
  }

  return candidate.toISOString().slice(0, 10);
}

export function isPayrollNoticeDay(value: string, additionalHolidayDates: readonly string[] = []) {
  return dateOnly(value) === payrollNoticeDate(value, additionalHolidayDates);
}
