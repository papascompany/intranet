const koreaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function koreaDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Timestamp must be a valid date");
  }

  const parts = koreaDateFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) {
    throw new Error("Timestamp could not be converted to Asia/Seoul");
  }
  return `${year}-${month}-${day}`;
}
