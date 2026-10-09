// Thin wrappers around Google Calendar API v3 and Tasks API v1.
// All calls use the access token from the signed-in user's session —
// nothing here is ever mocked; if a call fails, we surface the error
// rather than falling back to fake data.

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";
const TASKS_BASE = "https://www.googleapis.com/tasks/v1";

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
}

export interface GoogleEvent {
  id: string;
  summary?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurringEventId?: string;
  status?: string;
  htmlLink?: string;
  calendarId?: string; // we tag this on client-side after fetch
}

export interface GoogleTaskList {
  id: string;
  title: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;
  completed?: string;
  taskListId?: string; // tagged on client-side after fetch
}

class GoogleApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function googleFetch<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Google API responses aren't huge for personal calendars; no need to stream.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new GoogleApiError(
      `Google API error ${res.status}: ${body}`,
      res.status
    );
  }

  return res.json() as Promise<T>;
}

export async function listCalendars(
  accessToken: string
): Promise<GoogleCalendarListEntry[]> {
  const data = await googleFetch<{ items: GoogleCalendarListEntry[] }>(
    `${CALENDAR_BASE}/users/me/calendarList`,
    accessToken
  );
  return data.items ?? [];
}

// Fetches events for a single calendar within a time window.
// `singleSingleEvents=true` makes Google expand recurring events into
// individual instances for us — we don't need to parse RRULEs ourselves.
export async function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin,
    timeMax,
    maxResults: "250",
  });
  const data = await googleFetch<{ items: GoogleEvent[] }>(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    accessToken
  );
  return (data.items ?? []).map((e) => ({ ...e, calendarId }));
}

export async function listTaskLists(
  accessToken: string
): Promise<GoogleTaskList[]> {
  const data = await googleFetch<{ items: GoogleTaskList[] }>(
    `${TASKS_BASE}/users/@me/lists`,
    accessToken
  );
  return data.items ?? [];
}

export async function listTasks(
  accessToken: string,
  taskListId: string
): Promise<GoogleTask[]> {
  // Follow Google Tasks pagination so saved Daily Log history is not silently
  // truncated to the first 100 records. The page size stays at the API limit.
  const allTasks: GoogleTask[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      showCompleted: "true",
      showHidden: "true",
      maxResults: "100",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await googleFetch<{ items?: GoogleTask[]; nextPageToken?: string }>(
      `${TASKS_BASE}/lists/${encodeURIComponent(taskListId)}/tasks?${params}`,
      accessToken
    );
    allTasks.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return allTasks.map((task) => ({ ...task, taskListId }));
}

export async function insertEvent(
  accessToken: string,
  calendarId: string,
  event: { summary: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } }
): Promise<GoogleEvent> {
  const res = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );
  if (!res.ok) throw new GoogleApiError(await res.text(), res.status);
  return res.json();
}

export async function createTaskList(
  accessToken: string,
  title: string
): Promise<GoogleTaskList> {
  const res = await fetch(`${TASKS_BASE}/users/@me/lists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new GoogleApiError(await res.text(), res.status);
  return res.json();
}

export async function insertTask(
  accessToken: string,
  taskListId: string,
  task: Partial<GoogleTask>
): Promise<GoogleTask> {
  const res = await fetch(
    `${TASKS_BASE}/lists/${encodeURIComponent(taskListId)}/tasks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(task),
    }
  );
  if (!res.ok) throw new GoogleApiError(await res.text(), res.status);
  return res.json();
}

export async function patchTask(
  accessToken: string,
  taskListId: string,
  taskId: string,
  patch: Partial<GoogleTask>
): Promise<GoogleTask> {
  const res = await fetch(
    `${TASKS_BASE}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    }
  );
  if (!res.ok) throw new GoogleApiError(await res.text(), res.status);
  return res.json();
}

export async function deleteTask(
  accessToken: string,
  taskListId: string,
  taskId: string
): Promise<void> {
  const res = await fetch(
    `${TASKS_BASE}/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok && res.status !== 404) {
    throw new GoogleApiError(await res.text(), res.status);
  }
}

export async function deleteTaskList(
  accessToken: string,
  taskListId: string
): Promise<void> {
  const res = await fetch(
    `${TASKS_BASE}/users/@me/lists/${encodeURIComponent(taskListId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok && res.status !== 404) {
    throw new GoogleApiError(await res.text(), res.status);
  }
}

export async function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  patch: Partial<Pick<GoogleEvent, "summary">>
): Promise<GoogleEvent> {
  const res = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    }
  );
  if (!res.ok) throw new GoogleApiError(await res.text(), res.status);
  return res.json();
}

export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const res = await fetch(
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new GoogleApiError(await res.text(), res.status);
  }
}

export { GoogleApiError };
