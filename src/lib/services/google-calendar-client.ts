import type { GoogleCalendarTokenPayload } from "@/types";

const PAGE_SIZE = 250;
const MAX_PAGES = 50;
const TIMEOUT_MS = 10_000;

export class CalendarApiError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = "CalendarApiError";
    this.userMessage = userMessage;
  }
}

export function isTokenExpired(payload: Pick<GoogleCalendarTokenPayload, "expiresAt">): boolean {
  return new Date(payload.expiresAt).getTime() <= Date.now();
}

export interface CalendarEvent {
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

interface MeetingMetrics {
  meetingHours: number;
  contextSwitches: number;
}

export function computeMeetingMetrics(events: CalendarEvent[], sprintStart: string, sprintEnd: string): MeetingMetrics {
  const windowStart = new Date(sprintStart).getTime();
  const windowEnd = new Date(sprintEnd).getTime();

  const timedEvents = events.filter(
    (event): event is CalendarEvent & { start: { dateTime: string }; end: { dateTime: string } } =>
      typeof event.start.dateTime === "string" && typeof event.end.dateTime === "string",
  );

  const intervals = timedEvents
    .map((event) => ({
      start: Math.max(new Date(event.start.dateTime).getTime(), windowStart),
      end: Math.min(new Date(event.end.dateTime).getTime(), windowEnd),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);

  let meetingMs = 0;
  let blockCount = 0;
  let currentBlockEnd: number | null = null;

  for (const interval of intervals) {
    meetingMs += interval.end - interval.start;
    if (currentBlockEnd === null || interval.start > currentBlockEnd) {
      blockCount += 1;
      currentBlockEnd = interval.end;
    } else {
      currentBlockEnd = Math.max(currentBlockEnd, interval.end);
    }
  }

  return {
    meetingHours: meetingMs / (1000 * 60 * 60),
    contextSwitches: blockCount * 2,
  };
}

interface CalendarEventsPage {
  items: CalendarEvent[];
  nextPageToken?: string;
}

export async function fetchCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const all: CalendarEvent[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    pageCount += 1;
    if (pageCount > MAX_PAGES) {
      throw new CalendarApiError("Your calendar returned too much data to load. Please try again.");
    }

    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("maxResults", String(PAGE_SIZE));
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new CalendarApiError("Google Calendar took too long to respond. Please try again.");
      }
      throw new CalendarApiError("Could not reach Google Calendar. Please try again.");
    }

    if (!response.ok) {
      throw new CalendarApiError("Could not load events from Google Calendar. Please try again.");
    }

    const page = (await response.json()) as CalendarEventsPage;
    all.push(...page.items);
    pageToken = page.nextPageToken;
  } while (pageToken);

  return all;
}
