export type CompanyCalendarEvent = {
  id: string;
  calendarId: string;
  calendarLabel: string;
  calendarColor?: string;
  title: string;
  start: string;
  end: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  location?: string;
};

export type CompanyCalendarSource = {
  id: string;
  label: string;
  color?: string;
};

export type CompanyCalendarResponse = {
  month: string;
  timeZone: string;
  calendars: CompanyCalendarSource[];
  events: CompanyCalendarEvent[];
  fetchedAt: string;
  source: "google" | "stale";
  warning?: string;
};
