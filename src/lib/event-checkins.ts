export const EVENT_CHECKIN_LIST_TITLE = "Event Check-ins (Productivity App)";
export const EVENT_CHECKIN_PREFIX = "EVENT_CHECKIN::";

export function eventCheckInKey(eventId: string, dateKey: string): string {
  return `${EVENT_CHECKIN_PREFIX}${eventId}::${dateKey}`;
}

export function parseEventCheckInKey(value: string): { eventId: string; dateKey: string } | null {
  if (!value.startsWith(EVENT_CHECKIN_PREFIX)) return null;
  const payload = value.slice(EVENT_CHECKIN_PREFIX.length);
  const separator = payload.lastIndexOf("::");
  if (separator <= 0) return null;
  const eventId = payload.slice(0, separator);
  const dateKey = payload.slice(separator + 2);
  if (!eventId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  return { eventId, dateKey };
}

export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
