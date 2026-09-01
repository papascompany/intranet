import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthSession } from "../src/api/auth.js";
import type { CompanyCalendarResponse } from "../src/api/calendarTypes.js";
import { getAuthenticatedSessionFromCookie } from "../src/server/productionAuth.js";
import { getCompanyCalendar, GoogleCalendarError } from "../src/server/googleCalendar.js";

type CalendarRequest = {
  method: string;
  query?: Record<string, string | string[] | undefined>;
  serverSession?: AuthSession;
};

type CalendarResponse = { status: number; body: unknown };
type CalendarReader = (month: string) => Promise<CompanyCalendarResponse>;

export default async function handler(request: IncomingMessage & {
  query?: Record<string, string | string[] | undefined>;
}, response: ServerResponse) {
  const authenticated = await getAuthenticatedSessionFromCookie(request.headers.cookie).catch(() => undefined);
  const result = await handleCalendarHttpRequest({
    method: request.method ?? "GET",
    query: request.query,
    serverSession: authenticated?.session
  });
  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(result.body));
}

export async function handleCalendarHttpRequest(
  request: CalendarRequest,
  read: CalendarReader = (month) => getCompanyCalendar(month)
): Promise<CalendarResponse> {
  if (request.method !== "GET") {
    return { status: 405, body: { error: "Method not allowed" } };
  }
  if (!request.serverSession) {
    return { status: 401, body: { error: "Authentication required." } };
  }
  if (request.serverSession.passwordChangeRequired) {
    return { status: 403, body: { error: "Password change is required before using intranet services." } };
  }

  const month = singleQueryValue(request.query?.month) || koreaMonth();
  try {
    return { status: 200, body: await read(month) };
  } catch (error) {
    if (error instanceof GoogleCalendarError) {
      return { status: error.code === "NOT_CONFIGURED" ? 503 : 502, body: { error: error.message, code: error.code } };
    }
    return { status: 502, body: { error: "회사 일정을 불러오지 못했습니다." } };
  }
}

function singleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function koreaMonth() {
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", timeZone: "Asia/Seoul" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : "1970-01";
}
