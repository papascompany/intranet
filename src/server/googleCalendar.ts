import { readFile } from "node:fs/promises";
import { GoogleAuth, type JWTInput } from "google-auth-library";
import type { CompanyCalendarEvent, CompanyCalendarResponse, CompanyCalendarSource } from "../api/calendarTypes.js";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const DEFAULT_TIME_ZONE = "Asia/Seoul";
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_LABELS = ["회사일반", "개발/운영", "생산관리"];
const DEFAULT_COLORS = ["#facc15", "#f97316", "#34a853"];

export type GoogleCalendarEnv = {
  GOOGLE_CALENDAR_IDS?: string;
  GOOGLE_CALENDAR_LABELS?: string;
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON_BASE64?: string;
  GOOGLE_CALENDAR_CREDENTIALS_PATH?: string;
  GOOGLE_CALENDAR_TIMEZONE?: string;
};

type ServiceAccountCredentials = JWTInput & {
  type?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

type GoogleEventsResponse = { items?: GoogleEvent[] };

type CachedCalendar = {
  expiresAt: number;
  value: CompanyCalendarResponse;
};

const cache = new Map<string, CachedCalendar>();
const authClients = new Map<string, GoogleAuth>();

export class GoogleCalendarError extends Error {
  constructor(public readonly code: "NOT_CONFIGURED" | "UNAVAILABLE", message: string) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

export async function getCompanyCalendar(
  month: string,
  env: GoogleCalendarEnv = process.env,
  now = new Date()
): Promise<CompanyCalendarResponse> {
  const config = await readConfiguration(env);
  assertMonth(month);
  const cacheKey = `${config.ids.join(",")}:${month}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now.getTime()) {
    return cached.value;
  }

  try {
    const accessToken = await getAccessToken(config.credentials);
    const { timeMin, timeMax } = monthBounds(month);
    const calendars = config.ids.map((id, index) => ({
      id,
      label: config.labels[index] || id,
      color: DEFAULT_COLORS[index % DEFAULT_COLORS.length]
    } satisfies CompanyCalendarSource));
    const eventLists = await Promise.all(calendars.map((calendar) =>
      getCalendarEvents(calendar, accessToken, timeMin, timeMax, config.timeZone)
    ));
    const value: CompanyCalendarResponse = {
      month,
      timeZone: config.timeZone,
      calendars,
      events: eventLists.flat().sort(compareEvents),
      fetchedAt: now.toISOString(),
      source: "google"
    };
    cache.set(cacheKey, { expiresAt: now.getTime() + CACHE_TTL_MS, value });
    return value;
  } catch (error) {
    const stale = cache.get(cacheKey);
    if (stale) {
      return {
        ...stale.value,
        source: "stale",
        warning: "Google Calendar에 다시 연결하지 못해 마지막으로 확인한 일정을 표시하고 있습니다."
      };
    }
    if (error instanceof GoogleCalendarError) throw error;
    throw new GoogleCalendarError(
      "UNAVAILABLE",
      "Google Calendar에 연결하지 못했습니다. Calendar API 활성화와 캘린더 공유 권한을 확인해 주세요."
    );
  }
}

export function clearCompanyCalendarCache() {
  cache.clear();
  authClients.clear();
}

async function readConfiguration(env: GoogleCalendarEnv) {
  const ids = parseList(env.GOOGLE_CALENDAR_IDS);
  if (ids.length === 0) {
    throw new GoogleCalendarError("NOT_CONFIGURED", "회사 캘린더가 아직 설정되지 않았습니다.");
  }

  const labels = parseList(env.GOOGLE_CALENDAR_LABELS);
  const credentialsText = env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON_BASE64
    ? decodeBase64(env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON_BASE64)
    : env.GOOGLE_CALENDAR_CREDENTIALS_PATH
      ? await readFile(env.GOOGLE_CALENDAR_CREDENTIALS_PATH, "utf8").catch(() => undefined)
      : undefined;
  if (!credentialsText) {
    throw new GoogleCalendarError("NOT_CONFIGURED", "Google Calendar 서비스 계정 키가 아직 설정되지 않았습니다.");
  }

  let credentials: ServiceAccountCredentials;
  try {
    credentials = JSON.parse(credentialsText) as ServiceAccountCredentials;
  } catch {
    throw new GoogleCalendarError("NOT_CONFIGURED", "Google Calendar 서비스 계정 키 형식이 올바르지 않습니다.");
  }
  if (credentials.type !== "service_account" || !credentials.client_email || !credentials.private_key) {
    throw new GoogleCalendarError("NOT_CONFIGURED", "Google Calendar 서비스 계정 키에 필요한 정보가 없습니다.");
  }

  return {
    ids,
    labels: labels.length > 0 ? labels : DEFAULT_LABELS,
    credentials,
    timeZone: env.GOOGLE_CALENDAR_TIMEZONE || DEFAULT_TIME_ZONE
  };
}

async function getAccessToken(credentials: ServiceAccountCredentials) {
  const cacheKey = `${credentials.project_id || "unknown"}:${credentials.client_email}`;
  let auth = authClients.get(cacheKey);
  if (!auth) {
    auth = new GoogleAuth({ credentials, scopes: [CALENDAR_SCOPE] });
    authClients.set(cacheKey, auth);
  }
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Google access token was empty.");
  return token.token;
}

async function getCalendarEvents(
  calendar: CompanyCalendarSource,
  accessToken: string,
  timeMin: string,
  timeMax: string,
  timeZone: string
) {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    showDeleted: "false",
    maxResults: "2500",
    timeMin,
    timeMax,
    timeZone
  });
  const data = await requestJson<GoogleEventsResponse>(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events?${params.toString()}`,
    accessToken
  );
  return (data.items ?? [])
    .filter((event) => event.status !== "cancelled" && event.start && event.end)
    .map((event) => toCompanyEvent(calendar, event))
    .filter((event): event is CompanyCalendarEvent => event !== undefined);
}

async function requestJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Google Calendar request failed with status ${response.status}.`);
  }
  return await response.json() as T;
}

function toCompanyEvent(calendar: CompanyCalendarSource, event: GoogleEvent): CompanyCalendarEvent | undefined {
  const start = event.start?.date || event.start?.dateTime;
  const end = event.end?.date || event.end?.dateTime;
  if (!event.id || !start || !end) return undefined;
  const allDay = Boolean(event.start?.date);
  const startDate = allDay ? start : datePart(start);
  const endDate = allDay ? previousDate(end) : datePart(end);
  return {
    id: `${calendar.id}:${event.id}`,
    calendarId: calendar.id,
    calendarLabel: calendar.label,
    calendarColor: calendar.color,
    title: event.summary?.trim() || "제목 없는 일정",
    start,
    end,
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
    allDay,
    location: event.location?.trim() || undefined
  };
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
  return {
    timeMin: `${month}-01T00:00:00+09:00`,
    timeMax: `${nextMonth}-01T00:00:00+09:00`
  };
}

function assertMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new GoogleCalendarError("UNAVAILABLE", "캘린더 조회 월 형식이 올바르지 않습니다.");
  }
}

function parseList(value?: string) {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function decodeBase64(value: string) {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    throw new GoogleCalendarError("NOT_CONFIGURED", "Google Calendar 서비스 계정 키를 읽을 수 없습니다.");
  }
}

function datePart(value: string) {
  return value.slice(0, 10);
}

function previousDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function compareEvents(left: CompanyCalendarEvent, right: CompanyCalendarEvent) {
  if (left.startDate !== right.startDate) return left.startDate.localeCompare(right.startDate);
  if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
  return left.title.localeCompare(right.title, "ko");
}
