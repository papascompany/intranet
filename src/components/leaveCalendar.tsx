import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { LeaveCalendarEntry, SystemPolicy } from "../api/types";
import { chargeableLeaveDates } from "../domain/leave";
import { koreaDate } from "../domain/koreaTime";
import "./leaveCalendar.css";

type LeaveCalendarProps = {
  asOf: string;
  entries: LeaveCalendarEntry[];
  mode: "employee" | "admin";
  policy: Pick<SystemPolicy, "workDays" | "payrollHolidayDates">;
};

const weekdayLabels = ["월", "화", "수", "목", "금", "토", "일"];

export function LeaveCalendar({ asOf, entries, mode, policy }: LeaveCalendarProps) {
  const today = koreaDate(asOf);
  const todayMonth = today.slice(0, 7);
  const [visibleMonth, setVisibleMonth] = useState(todayMonth);

  useEffect(() => {
    setVisibleMonth(todayMonth);
  }, [todayMonth]);

  const calendarDays = useMemo(() => monthGridDates(visibleMonth), [visibleMonth]);
  const eventsByDate = useMemo(() => expandEntries(entries, visibleMonth, policy), [entries, policy, visibleMonth]);
  const agendaDates = [...eventsByDate.keys()].sort();
  const monthlyEntries = uniqueEntries(agendaDates.flatMap((date) => eventsByDate.get(date) ?? []));
  const pendingCount = monthlyEntries.filter((entry) => entry.status === "PENDING").length;
  const employeeCount = new Set(monthlyEntries.map((entry) => entry.employeeId)).size;

  return (
    <section className={`leave-calendar leave-calendar--${mode}`} aria-labelledby={`leave-calendar-title-${mode}`}>
      <header className="leave-calendar__header">
        <div className="leave-calendar__heading">
          <CalendarDays aria-hidden="true" size={19} />
          <div>
            <h2 id={`leave-calendar-title-${mode}`}>휴가 일정</h2>
            <p>{mode === "admin" ? "전 직원의 승인 일정과 승인 대기를 함께 확인합니다." : "승인된 휴가와 내 승인 대기 일정을 확인합니다."}</p>
          </div>
        </div>
        <div className="leave-calendar__controls">
          <button aria-label="이전 달" onClick={() => setVisibleMonth((month) => shiftMonth(month, -1))} title="이전 달" type="button"><ChevronLeft size={17} /></button>
          <strong aria-live="polite">{monthTitle(visibleMonth)}</strong>
          <button aria-label="다음 달" onClick={() => setVisibleMonth((month) => shiftMonth(month, 1))} title="다음 달" type="button"><ChevronRight size={17} /></button>
          <button className="leave-calendar__today" disabled={visibleMonth === todayMonth} onClick={() => setVisibleMonth(todayMonth)} type="button">오늘</button>
        </div>
      </header>

      <div className="leave-calendar__summary" aria-label="월간 휴가 요약">
        <span><strong>{employeeCount}명</strong> 휴가</span>
        <span><strong>{monthlyEntries.length}건</strong> 일정</span>
        {mode === "admin" || pendingCount > 0 ? <span><strong>{pendingCount}건</strong> 승인 대기</span> : null}
      </div>

      <div className="leave-calendar__legend" aria-label="휴가 유형 범례">
        <span className="is-annual">연차</span>
        <span className="is-half-day">반차</span>
        <span className="is-special">특별휴가</span>
        <span className="is-unpaid">무급휴가</span>
        <span className="is-pending">승인 대기</span>
      </div>

      <div className="leave-calendar__desktop" role="grid" aria-label={`${monthTitle(visibleMonth)} 휴가 일정`}>
        <div className="leave-calendar__weekdays" role="row">
          {weekdayLabels.map((label) => <span key={label} role="columnheader">{label}</span>)}
        </div>
        <div className="leave-calendar__month">
          {calendarDays.map((date) => {
            const dayEntries = eventsByDate.get(date) ?? [];
            return (
              <div
                aria-label={`${formatFullDate(date)}${dayEntries.length ? `, 휴가 ${dayEntries.length}건` : ""}`}
                className={`leave-calendar__day${date.slice(0, 7) === visibleMonth ? "" : " is-outside"}${date === today ? " is-today" : ""}`}
                key={date}
                role="gridcell"
              >
                <time dateTime={date}>{Number(date.slice(8, 10))}</time>
                <div className="leave-calendar__events">
                  {dayEntries.map((entry) => <CalendarEvent entry={entry} key={`${date}-${entry.id}`} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="leave-calendar__agenda" aria-label={`${monthTitle(visibleMonth)} 휴가 일정 목록`}>
        {agendaDates.map((date) => (
          <article key={date}>
            <time dateTime={date}><strong>{Number(date.slice(8, 10))}</strong><span>{agendaDateLabel(date)}</span></time>
            <div>{(eventsByDate.get(date) ?? []).map((entry) => <CalendarEvent entry={entry} key={`${date}-agenda-${entry.id}`} />)}</div>
          </article>
        ))}
        {agendaDates.length === 0 ? <p className="leave-calendar__empty">이달에 예정된 휴가가 없습니다.</p> : null}
      </div>
    </section>
  );
}

function CalendarEvent({ entry }: { entry: LeaveCalendarEntry }) {
  const typeClass = entry.type.toLowerCase().replace("_", "-");
  return (
    <div
      className={`leave-calendar__event is-${typeClass}${entry.status === "PENDING" ? " is-pending" : ""}${entry.isOwn ? " is-own" : ""}`}
      title={`${entry.employeeName} · ${leaveTypeLabel(entry)}${entry.status === "PENDING" ? " · 승인 대기" : ""}`}
    >
      <strong>{entry.employeeName}</strong>
      <span>{leaveTypeLabel(entry)}{entry.status === "PENDING" ? " · 대기" : ""}</span>
    </div>
  );
}

function expandEntries(
  entries: LeaveCalendarEntry[],
  month: string,
  policy: LeaveCalendarProps["policy"]
) {
  const eventsByDate = new Map<string, LeaveCalendarEntry[]>();
  for (const entry of entries) {
    const dates = chargeableLeaveDates({
      startsOn: entry.startsOn,
      endsOn: entry.endsOn,
      workDays: policy.workDays,
      holidayDates: policy.payrollHolidayDates
    });
    for (const date of dates) {
      if (!date.startsWith(month)) continue;
      eventsByDate.set(date, [...(eventsByDate.get(date) ?? []), entry]);
    }
  }
  for (const [date, dateEntries] of eventsByDate) {
    eventsByDate.set(date, dateEntries.sort(compareEntries));
  }
  return eventsByDate;
}

function compareEntries(left: LeaveCalendarEntry, right: LeaveCalendarEntry) {
  if (left.status !== right.status) return left.status === "PENDING" ? -1 : 1;
  return left.employeeName.localeCompare(right.employeeName, "ko");
}

function uniqueEntries(entries: LeaveCalendarEntry[]) {
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
}

function leaveTypeLabel(entry: LeaveCalendarEntry) {
  if (entry.type === "HALF_DAY") return entry.halfDayPeriod === "AM" ? "오전 반차" : "오후 반차";
  if (entry.type === "SPECIAL") return "특별휴가";
  if (entry.type === "UNPAID") return "무급휴가";
  return "연차";
}

function monthGridDates(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => formatDate(new Date(Date.UTC(year, monthNumber - 1, 1 - mondayOffset + index))));
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${month}-01T00:00:00Z`));
}

function agendaDateLabel(date: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

function formatFullDate(date: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
