import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { getCompanyCalendar } from "../api/calendarHttpClient";
import type { CompanyCalendarEvent, CompanyCalendarResponse } from "../api/calendarTypes";
import type { LeaveCalendarEntry, SystemPolicy } from "../api/types";
import { koreaDate } from "../domain/koreaTime";
import { LeaveCalendar } from "./leaveCalendar";
import "./schedulePanel.css";

type SchedulePanelProps = {
  asOf: string;
  entries: LeaveCalendarEntry[];
  mode: "employee" | "admin";
  policy: Pick<SystemPolicy, "workDays" | "payrollHolidayDates">;
};

type ScheduleTab = "company" | "leave";
const weekdayLabels = ["월", "화", "수", "목", "금", "토", "일"];

export function SchedulePanel({ asOf, entries, mode, policy }: SchedulePanelProps) {
  const [tab, setTab] = useState<ScheduleTab>("company");
  return (
    <section className={`schedule-panel schedule-panel--${mode}`} aria-labelledby={`schedule-panel-title-${mode}`}>
      <header className="schedule-panel__header">
        <div className="schedule-panel__heading">
          <CalendarDays aria-hidden="true" size={19} />
          <div>
            <h2 id={`schedule-panel-title-${mode}`}>일정</h2>
            <p>{mode === "admin" ? "회사 일정과 전 직원의 휴가 일정을 한눈에 확인합니다." : "회사 일정과 승인된 휴가 일정을 확인합니다."}</p>
          </div>
        </div>
        <div className="schedule-panel__tabs" role="tablist" aria-label="일정 종류">
          <button aria-selected={tab === "company"} className={tab === "company" ? "is-active" : ""} onClick={() => setTab("company")} role="tab" type="button">
            회사 일정
          </button>
          <button aria-selected={tab === "leave"} className={tab === "leave" ? "is-active" : ""} onClick={() => setTab("leave")} role="tab" type="button">
            휴가 일정
          </button>
        </div>
      </header>
      <div className="schedule-panel__content" role="tabpanel">
        {tab === "company" ? <CompanyCalendar asOf={asOf} /> : <LeaveCalendar asOf={asOf} entries={entries} embedded mode={mode} policy={policy} />}
      </div>
    </section>
  );
}

function CompanyCalendar({ asOf }: { asOf: string }) {
  const today = koreaDate(asOf);
  const todayMonth = today.slice(0, 7);
  const [visibleMonth, setVisibleMonth] = useState(todayMonth);
  const [calendar, setCalendar] = useState<CompanyCalendarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setVisibleMonth(todayMonth);
  }, [todayMonth]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void getCompanyCalendar(visibleMonth)
      .then((nextCalendar) => {
        if (!cancelled) setCalendar(nextCalendar);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setCalendar(null);
          setError(reason instanceof Error ? reason.message : "회사 일정을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, visibleMonth]);

  const eventsByDate = useMemo(() => expandCompanyEvents(calendar?.events ?? [], visibleMonth), [calendar?.events, visibleMonth]);
  const calendarDays = useMemo(() => monthGridDates(visibleMonth), [visibleMonth]);
  const agendaDates = [...eventsByDate.keys()].filter((date) => date.startsWith(visibleMonth)).sort();

  return (
    <div className="company-calendar">
      <div className="company-calendar__toolbar">
        <div>
          <strong aria-live="polite">{monthTitle(visibleMonth)}</strong>
          <span>{calendar?.calendars.length ? `${calendar.calendars.length}개 캘린더 · ${calendar.events.length}건` : "회사 공유 일정"}</span>
        </div>
        <div className="company-calendar__controls">
          <button aria-label="이전 달" onClick={() => setVisibleMonth((month) => shiftMonth(month, -1))} title="이전 달" type="button"><ChevronLeft size={17} /></button>
          <button aria-label="다음 달" onClick={() => setVisibleMonth((month) => shiftMonth(month, 1))} title="다음 달" type="button"><ChevronRight size={17} /></button>
          <button className="company-calendar__today" disabled={visibleMonth === todayMonth} onClick={() => setVisibleMonth(todayMonth)} type="button">오늘</button>
        </div>
      </div>

      {calendar?.warning ? <p className="company-calendar__warning" role="status">{calendar.warning}</p> : null}
      {error ? (
        <div className="company-calendar__error" role="alert">
          <strong>회사 일정을 준비하지 못했습니다.</strong>
          <span>{error}</span>
          <button onClick={() => setReloadKey((key) => key + 1)} type="button"><RefreshCw size={14} /> 다시 시도</button>
        </div>
      ) : null}
      {isLoading ? <p className="company-calendar__loading" role="status">회사 일정을 불러오는 중입니다.</p> : null}

      {!isLoading && !error ? (
        <>
          <div className="company-calendar__legend" aria-label="회사 캘린더 범례">
            {(calendar?.calendars ?? []).map((source) => <span key={source.id} style={{ "--calendar-color": source.color || "#facc15" } as CSSProperties}>{source.label}</span>)}
          </div>
          <div className="company-calendar__desktop" role="grid" aria-label={`${monthTitle(visibleMonth)} 회사 일정`}>
            <div className="company-calendar__weekdays" role="row">
              {weekdayLabels.map((label) => <span key={label} role="columnheader">{label}</span>)}
            </div>
            <div className="company-calendar__month">
              {calendarDays.map((date) => {
                const dayEvents = eventsByDate.get(date) ?? [];
                return (
                  <div className={`company-calendar__day${date.slice(0, 7) === visibleMonth ? "" : " is-outside"}${date === today ? " is-today" : ""}`} key={date} role="gridcell">
                    <time dateTime={date}>{Number(date.slice(8, 10))}</time>
                    <div className="company-calendar__events">
                      {dayEvents.map((event) => <CompanyEvent event={event} key={`${date}-${event.id}`} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="company-calendar__agenda" aria-label={`${monthTitle(visibleMonth)} 회사 일정 목록`}>
            {agendaDates.map((date) => (
              <article key={date}>
                <time dateTime={date}><strong>{Number(date.slice(8, 10))}</strong><span>{agendaDateLabel(date)}</span></time>
                <div>{(eventsByDate.get(date) ?? []).map((event) => <CompanyEvent event={event} key={`${date}-agenda-${event.id}`} />)}</div>
              </article>
            ))}
            {agendaDates.length === 0 ? <p className="company-calendar__empty">이달에 예정된 회사 일정이 없습니다.</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function CompanyEvent({ event }: { event: CompanyCalendarEvent }) {
  return (
    <div className="company-calendar__event" style={{ "--calendar-color": event.calendarColor || "#facc15" } as CSSProperties} title={`${event.calendarLabel} · ${event.title}`}>
      <strong>{event.title}</strong>
      <span>{event.calendarLabel} · {eventTimeLabel(event)}</span>
    </div>
  );
}

function expandCompanyEvents(events: CompanyCalendarEvent[], month: string) {
  const eventsByDate = new Map<string, CompanyCalendarEvent[]>();
  for (const event of events) {
    let date = event.startDate;
    while (date <= event.endDate) {
      if (date.startsWith(month)) eventsByDate.set(date, [...(eventsByDate.get(date) ?? []), event]);
      date = shiftDate(date, 1);
      if (date > event.endDate || date > `${month}-31`) break;
    }
  }
  for (const [date, dateEvents] of eventsByDate) {
    eventsByDate.set(date, dateEvents.sort((left, right) => Number(right.allDay) - Number(left.allDay) || left.title.localeCompare(right.title, "ko")));
  }
  return eventsByDate;
}

function eventTimeLabel(event: CompanyCalendarEvent) {
  if (event.allDay) return "종일";
  const formatter = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
  const start = formatter.format(new Date(event.start));
  const end = formatter.format(new Date(event.end));
  return start === end ? start : `${start}–${end}`;
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

function shiftDate(date: string, offset: number) {
  const current = new Date(`${date}T00:00:00Z`);
  current.setUTCDate(current.getUTCDate() + offset);
  return formatDate(current);
}

function monthTitle(month: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

function agendaDateLabel(date: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function formatDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
