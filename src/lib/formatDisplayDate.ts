/** Ghana (Africa/Accra) — UTC+0 year-round; used for all user-facing display dates. */
export const DISPLAY_TIME_ZONE = "Africa/Accra";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function accraParts(iso: string): {
  day: number;
  month: (typeof MONTHS_SHORT)[number];
  year: number;
  hour: string;
  minute: string;
} | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TIME_ZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(parsed);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;

  const day = Number(get("day"));
  const monthIndex = Number(get("month")) - 1;
  const year = Number(get("year"));
  const hour = get("hour");
  const minute = get("minute");

  if (
    !Number.isFinite(day) ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    !Number.isFinite(year) ||
    !hour ||
    !minute
  ) {
    return null;
  }

  return {
    day,
    month: MONTHS_SHORT[monthIndex],
    year,
    hour,
    minute,
  };
}

/** e.g. "22 Aug 2026" — identical on server and client. */
export function formatDisplayDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const parts = accraParts(iso);
  if (!parts) return iso.trim();
  return `${parts.day} ${parts.month} ${parts.year}`;
}

/** e.g. "22 Aug 2026, 21:19" — identical on server and client. */
export function formatDisplayDateTime(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const parts = accraParts(iso);
  if (!parts) return iso.trim();
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}
