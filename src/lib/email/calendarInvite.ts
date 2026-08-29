// "Add to calendar" support for scheduled-event emails (currently: panel
// interview invites). Two complementary mechanisms, since no single one
// covers every mail client:
//   1. An .ics file attached to the email — most desktop/mobile mail apps
//      (Apple Mail, Outlook desktop, most phone mail apps) recognise a
//      text/calendar attachment and offer an "Add to Calendar" action
//      automatically, no click-through needed.
//   2. Plain "Add to Google Calendar" / "Add to Outlook.com" links in the
//      email body — for webmail clients that don't render .ics attachments
//      as an action (e.g. viewing Gmail in a browser).
// Hand-rolled rather than pulling in a calendar library — RFC 5545 is a
// simple text format and this app only ever needs one non-recurring event
// per email.

/** Escapes text per RFC 5545 §3.3.11 (used for SUMMARY/DESCRIPTION/LOCATION). */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** UTC "basic format" date-time, e.g. 20260830T130000Z — used by both ICS and the Google Calendar link. */
function toUtcBasic(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Folds a single content line to RFC 5545's 75-octet limit, continuation lines prefixed with a space. */
function foldIcsLine(line: string): string {
  const max = 75;
  if (line.length <= max) return line;
  let result = "";
  let index = 0;
  while (index < line.length) {
    result += (index === 0 ? "" : "\r\n ") + line.slice(index, index + max);
    index += max;
  }
  return result;
}

export interface CalendarEventParams {
  /** Stable, unique per event (e.g. `panel-invite-<application_id>-stage1@willsfarms.com`). */
  uid: string;
  title: string;
  description: string;
  /** Physical address, or the online meeting link — whichever applies. */
  location: string;
  /** ISO 8601 start time. */
  startsAt: string;
  /** Defaults to 60 minutes — no interview end time/duration is tracked in the data. */
  durationMinutes?: number;
}

/** Builds a single-event .ics (VCALENDAR/VEVENT) file as plain text. */
export function buildIcsEvent(params: CalendarEventParams): string {
  const durationMs = (params.durationMinutes ?? 60) * 60 * 1000;
  const endIso = new Date(new Date(params.startsAt).getTime() + durationMs).toISOString();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wills Farms Ltd//Recruitment//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${params.uid}`,
    `DTSTAMP:${toUtcBasic(new Date().toISOString())}`,
    `DTSTART:${toUtcBasic(params.startsAt)}`,
    `DTEND:${toUtcBasic(endIso)}`,
    `SUMMARY:${escapeIcsText(params.title)}`,
    `DESCRIPTION:${escapeIcsText(params.description)}`,
    `LOCATION:${escapeIcsText(params.location)}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldIcsLine).join("\r\n");
}

/** One-click "Add to Google Calendar" link — no account/API access needed, just a pre-filled compose URL. */
export function googleCalendarLink(params: CalendarEventParams): string {
  const durationMs = (params.durationMinutes ?? 60) * 60 * 1000;
  const endIso = new Date(new Date(params.startsAt).getTime() + durationMs).toISOString();
  const search = new URLSearchParams({
    action: "TEMPLATE",
    text: params.title,
    dates: `${toUtcBasic(params.startsAt)}/${toUtcBasic(endIso)}`,
    details: params.description,
    location: params.location,
  });
  return `https://calendar.google.com/calendar/render?${search.toString()}`;
}

/** One-click "Add to Outlook.com calendar" link (also opens in the Outlook desktop app if it's the default handler). */
export function outlookCalendarLink(params: CalendarEventParams): string {
  const durationMs = (params.durationMinutes ?? 60) * 60 * 1000;
  const endIso = new Date(new Date(params.startsAt).getTime() + durationMs).toISOString();
  const search = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    startdt: params.startsAt,
    enddt: endIso,
    subject: params.title,
    body: params.description,
    location: params.location,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${search.toString()}`;
}
