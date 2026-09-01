import type { CompanyCalendarResponse } from "./calendarTypes";

type CalendarErrorBody = { error?: string };

const responseCache = new Map<string, { expiresAt: number; value: CompanyCalendarResponse }>();
const pendingRequests = new Map<string, Promise<CompanyCalendarResponse>>();
const CLIENT_CACHE_MS = 5 * 60 * 1000;

export async function getCompanyCalendar(month: string) {
  const cached = responseCache.get(month);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = pendingRequests.get(month);
  if (pending) return pending;

  const request = fetch(`/api/calendar?month=${encodeURIComponent(month)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  }).then(async (response) => {
    const body = await response.json().catch(() => ({})) as CompanyCalendarResponse & CalendarErrorBody;
    if (!response.ok) throw new Error(body.error || "회사 일정을 불러오지 못했습니다.");
    responseCache.set(month, { expiresAt: Date.now() + CLIENT_CACHE_MS, value: body });
    return body;
  }).finally(() => {
    pendingRequests.delete(month);
  });
  pendingRequests.set(month, request);
  return request;
}

export function clearCompanyCalendarClientCache() {
  responseCache.clear();
  pendingRequests.clear();
}
