import type { AttendanceRecord, Employee } from "../domain/types";

export type RecognizedWorkFilter = {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
};

export type RecognizedWorkSummary = {
  monthMinutes: number;
  cumulativeMinutes: number;
  monthRecordCount: number;
};

export type RecognizedWorkEmployeeTotal = {
  employeeId: string;
  name: string;
  department: Employee["department"];
  minutes: number;
  days: number;
};

export type RecognizedWorkDateTotal = {
  date: string;
  minutes: number;
  employees: number;
};

export type RecognizedWorkStats = {
  totalMinutes: number;
  totalDays: number;
  employeeTotals: RecognizedWorkEmployeeTotal[];
  dateTotals: RecognizedWorkDateTotal[];
};

export function recognizedMinutes(record: Pick<AttendanceRecord, "recognizedWorkMinutes" | "earlyLeaveMinutes">) {
  return Math.max(0, record.recognizedWorkMinutes ?? record.earlyLeaveMinutes ?? 0);
}

export function buildRecognizedWorkSummary(records: AttendanceRecord[], asOf: string): RecognizedWorkSummary {
  const month = asOf.slice(0, 7);
  const monthRecords = records.filter((record) => record.date.slice(0, 7) === month);

  return {
    monthMinutes: sumMinutes(monthRecords),
    cumulativeMinutes: sumMinutes(records),
    monthRecordCount: monthRecords.filter((record) => recognizedMinutes(record) > 0).length
  };
}

export function buildRecognizedWorkStats(
  records: AttendanceRecord[],
  employees: Employee[],
  filter: RecognizedWorkFilter = {}
): RecognizedWorkStats {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const filtered = records.filter((record) => {
    if (filter.employeeId && record.employeeId !== filter.employeeId) return false;
    if (filter.startDate && record.date < filter.startDate) return false;
    if (filter.endDate && record.date > filter.endDate) return false;
    return recognizedMinutes(record) > 0;
  });
  const employeeMap = new Map<string, RecognizedWorkEmployeeTotal>();
  const dateMap = new Map<string, { minutes: number; employees: Set<string> }>();

  filtered.forEach((record) => {
    const employee = employeeById.get(record.employeeId);
    const minutes = recognizedMinutes(record);
    const employeeTotal = employeeMap.get(record.employeeId) ?? {
      employeeId: record.employeeId,
      name: employee?.name ?? record.employeeId,
      department: employee?.department ?? "운영팀",
      minutes: 0,
      days: 0
    };
    employeeTotal.minutes += minutes;
    employeeTotal.days += 1;
    employeeMap.set(record.employeeId, employeeTotal);

    const dateTotal = dateMap.get(record.date) ?? { minutes: 0, employees: new Set<string>() };
    dateTotal.minutes += minutes;
    dateTotal.employees.add(record.employeeId);
    dateMap.set(record.date, dateTotal);
  });

  const employeeTotals = [...employeeMap.values()].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, "ko"));
  const dateTotals = [...dateMap.entries()]
    .map(([date, value]) => ({ date, minutes: value.minutes, employees: value.employees.size }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    totalMinutes: sumMinutes(filtered),
    totalDays: dateTotals.length,
    employeeTotals,
    dateTotals
  };
}

function sumMinutes(records: AttendanceRecord[]) {
  return records.reduce((total, record) => total + recognizedMinutes(record), 0);
}

export function formatRecognizedMinutes(minutes: number) {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  if (hours === 0) return `${remainingMinutes}분`;
  if (remainingMinutes === 0) return `${hours}시간`;
  return `${hours}시간 ${remainingMinutes}분`;
}
