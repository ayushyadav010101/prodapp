"use client";

const ENABLED_KEY = "notifications-enabled";
const NOTIFIED_KEY = "notified-ids";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export function notificationsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ENABLED_KEY) === "true" && Notification.permission === "granted";
}

export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    localStorage.setItem(ENABLED_KEY, "true");
    return true;
  }
  localStorage.setItem(ENABLED_KEY, "false");
  return false;
}

export function disableNotifications() {
  localStorage.setItem(ENABLED_KEY, "false");
}

// Dedup tracking so the same reminder doesn't fire on every check cycle.
// Keyed by day so it naturally resets tomorrow without growing forever.
function getNotifiedSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const todayKey = new Date().toDateString();
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    const parsed = raw ? JSON.parse(raw) : { day: todayKey, ids: [] };
    if (parsed.day !== todayKey) return new Set();
    return new Set(parsed.ids as string[]);
  } catch {
    return new Set();
  }
}

function markNotified(id: string) {
  const todayKey = new Date().toDateString();
  const current = getNotifiedSet();
  current.add(id);
  localStorage.setItem(
    NOTIFIED_KEY,
    JSON.stringify({ day: todayKey, ids: Array.from(current) })
  );
}

async function fireNotification(title: string, body: string, tag: string, url = "/") {
  if (!notificationsEnabled()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      tag,
      icon: "/icons/icon-192.png",
      data: { url },
    });
  } catch {
    // Fall back to a plain Notification if the service worker isn't ready yet.
    try {
      new Notification(title, { body, tag });
    } catch {
      /* ignore */
    }
  }
}

interface EventLike {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
}

interface TaskLike {
  id: string;
  title: string;
  status: string;
  due?: string;
}


// Notifies for events starting within the next 10 minutes.
export function checkUpcomingEvents(events: EventLike[]) {
  const notified = getNotifiedSet();
  const now = new Date();
  const soon = new Date(now.getTime() + 10 * 60 * 1000);

  for (const event of events) {
    const start = event.start?.dateTime;
    if (!start) continue; // skip all-day events for time-based reminders
    const startDate = new Date(start);
    const key = `event:${event.id}`;
    if (notified.has(key)) continue;
    if (startDate > now && startDate <= soon) {
      fireNotification(
        "Starting soon",
        `${event.summary || "Untitled event"} at ${startDate.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })}`,
        key,
        "/calendar"
      );
      markNotified(key);
    }
  }
}

// Notifies once per day for tasks whose due date has passed.
export function checkOverdueTasks(tasks: TaskLike[]) {
  const notified = getNotifiedSet();
  const now = new Date();
  const todayKey = now.toDateString();

  for (const task of tasks) {
    if (task.status === "completed" || !task.due) continue;
    const due = new Date(task.due);
    if (due >= now) continue;
    const key = `overdue:${task.id}:${todayKey}`;
    if (notified.has(key)) continue;
    fireNotification("Overdue task", task.title || "Untitled task", key, "/tasks");
    markNotified(key);
  }
}
