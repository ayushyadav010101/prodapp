"use client";

interface EventLike {
  start?: { dateTime?: string; date?: string };
}
interface TaskLike {
  status: string;
  completed?: string;
}
function localDateKey(d: Date): string {
  return d.toDateString();
}

/**
 * One level per calendar day with real activity, never counting future work.
 *
 * Calendar events count for the day they occur (including today), while
 * completed tasks count from their actual completion timestamp. Future events are deliberately ignored
 * so a calendar full of upcoming/recurring items cannot inflate the level.
 */
export function computeActiveDates(
  events: EventLike[],
  tasks: TaskLike[]
): Set<string> {
  const active = new Set<string>();
  const now = new Date();

  // App-specific activity gives us a sensible "started using the app"
  // boundary. This prevents an existing Google Calendar history from
  // instantly turning into dozens of levels on first sign-in.
  const appActivityTimes: number[] = [];
  for (const t of tasks) {
    if (t.status === "completed" && t.completed) {
      const d = new Date(t.completed);
      if (!Number.isNaN(d.getTime()) && d.getTime() <= now.getTime()) appActivityTimes.push(d.getTime());
    }
  }
  const activityStart = appActivityTimes.length ? Math.min(...appActivityTimes) : now.getTime();

  for (const e of events) {
    const raw = e.start?.dateTime ?? e.start?.date;
    if (!raw) continue;

    const date = e.start?.date
      ? new Date(`${e.start.date}T00:00:00`)
      : new Date(raw);
    if (
      !Number.isNaN(date.getTime()) &&
      date.getTime() <= now.getTime() &&
      date.getTime() >= activityStart
    ) {
      active.add(localDateKey(date));
    }
  }

  // Non-calendar app activity always counts on its real completion/check-in day.
  for (const t of tasks) {
    if (t.status !== "completed" || !t.completed) continue;
    const date = new Date(t.completed);
    if (!Number.isNaN(date.getTime()) && date.getTime() <= now.getTime()) {
      active.add(localDateKey(date));
    }
  }


  return active;
}

export function computeLevel(activeDates: Set<string>): number {
  return activeDates.size;
}
