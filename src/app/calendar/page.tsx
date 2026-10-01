"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useCalendarData } from "@/lib/use-google-data";
import { SyncStatus } from "@/components/SyncStatus";
import { MonthCalendarGrid } from "@/components/MonthCalendarGrid";
import { IconTrash, IconPencil, IconCalendar, IconSun, IconClock } from "@/components/icons";
import type { GoogleEvent } from "@/lib/google-api";
import { getEventMeta } from "@/lib/calendarColors";

function getEventDate(event: GoogleEvent): Date | null {
  const date = event.start?.date;
  if (date) {
    // Google all-day events are date-only strings. Parse them in local time so
    // they do not shift to the previous day in positive-offset timezones.
    const [year, month, day] = date.split("-").map(Number);
    if ([year, month, day].every(Number.isFinite)) return new Date(year, month - 1, day);
  }

  const dateTime = event.start?.dateTime;
  return dateTime ? new Date(dateTime) : null;
}

function formatEventTime(event: GoogleEvent) {
  if (event.start?.date && !event.start?.dateTime) return "All day";
  const start = event.start?.dateTime;
  if (!start) return "";
  return new Date(start).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dateHeading(d: Date) {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default function CalendarPage() {
  const { status: sessionStatus } = useSession();
  const { events, calendars, syncState, error, refresh } = useCalendarData();
  const [view, setView] = useState<"Today" | "Week" | "Month">("Today");
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => new Date());
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editEventTitle, setEditEventTitle] = useState("");
  const [editingEventSavingId, setEditingEventSavingId] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState(() => new Date().toDateString());

  useEffect(() => {
    const updateToday = () => {
      const nextToday = new Date();
      const nextTodayKey = nextToday.toDateString();
      setTodayKey(nextTodayKey);
      setSelectedDate((current) =>
        view === "Today" && (!current || current.toDateString() !== nextTodayKey)
          ? nextToday
          : current
      );
    };
    const timer = window.setInterval(updateToday, 60_000);
    return () => window.clearInterval(timer);
  }, [view]);

  const rangedEvents = useMemo(() => {
    let list: { event: GoogleEvent; date: Date }[];
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    if (selectedDate) {
      list = events
        .map((e) => ({ event: e, date: getEventDate(e) }))
        .filter(
          (x): x is { event: GoogleEvent; date: Date } =>
            x.date !== null && x.date.toDateString() === selectedDate.toDateString()
        );
    } else if (view === "Week") {
      const weekStart = new Date(startOfToday);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      list = events
        .map((e) => ({ event: e, date: getEventDate(e) }))
        .filter(
          (x): x is { event: GoogleEvent; date: Date } =>
            x.date !== null && x.date >= weekStart && x.date < weekEnd
        );
    } else {
      // Today and Month both keep the month overview visible. Include the
      // previous day so an event that just expired remains visible as context.
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      monthStart.setDate(monthStart.getDate() - 1);
      monthStart.setHours(0, 0, 0, 0);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      monthEnd.setHours(0, 0, 0, 0);

      list = events
        .map((e) => ({ event: e, date: getEventDate(e) }))
        .filter(
          (x): x is { event: GoogleEvent; date: Date } =>
            x.date !== null && x.date >= monthStart && x.date < monthEnd
        );
    }

    list.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Some Google accounts have the same holiday calendar subscribed more
    // than once — dedupe by title + exact start time.
    const seen = new Set<string>();
    const unique = list.filter(({ event, date }) => {
      const key = `${event.summary ?? ""}|${date.toISOString()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const isExpired = (event: GoogleEvent, date: Date) => {
      const dateTime = event.start?.dateTime;
      if (dateTime) return new Date(dateTime).getTime() < Date.now();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      return date.getTime() < todayStart.getTime();
    };

    // Keep the latest two expired events as context at the top, then show
    // the remaining events in chronological order.
    const expired = unique
      .filter(({ event, date }) => isExpired(event, date))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 2);
    const expiredKeys = new Set(expired.map(({ event, date }) => `${event.id}|${date.toDateString()}`));
    const upcoming = unique
      .filter(({ event, date }) => !expiredKeys.has(`${event.id}|${date.toDateString()}`))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return [...expired.sort((a, b) => a.date.getTime() - b.date.getTime()), ...upcoming];
  }, [events, view, selectedDate, todayKey]);

  const rangeLabel = selectedDate
    ? dateHeading(selectedDate)
    : view === "Today"
    ? "Today"
    : view === "Week"
    ? "This Week"
    : "This Month";

  const isExpiredEvent = (event: GoogleEvent, date: Date) => {
    const dateTime = event.start?.dateTime;
    if (dateTime) return new Date(dateTime).getTime() < Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date.getTime() < today.getTime();
  };

  const dateHeadingLong = (date: Date) =>
    date
      .toLocaleDateString(undefined, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .toUpperCase();

  const addEvent = async () => {
    if (!title.trim() || !date || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const allDay = !startTime;
      const startDateTime = startTime ? `${date}T${startTime}:00` : date;
      // Default end time: start + 1 hour if no end time given.
      let endDateTime = startDateTime;
      if (startTime) {
        if (endTime) {
          endDateTime = `${date}T${endTime}:00`;
        } else {
          const [h, m] = startTime.split(":").map(Number);
          const endH = (h + 1) % 24;
          endDateTime = `${date}T${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
        }
      }
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: title.trim(),
          startDateTime,
          endDateTime,
          allDay,
          timeZone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create event");
      setTitle("");
      setDate("");
      setStartTime("");
      setEndTime("");
      setShowForm(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setSaving(false);
    }
  };

  const startEventEdit = (eventId: string, currentTitle: string) => {
    setEditingEventId(eventId);
    setEditEventTitle(currentTitle);
    setFormError(null);
  };

  const cancelEventEdit = () => {
    setEditingEventId(null);
    setEditEventTitle("");
  };

  const saveEventTitle = async (eventId: string, calendarId?: string) => {
    const nextTitle = editEventTitle.trim();
    if (!nextTitle || editingEventSavingId) return;
    setEditingEventSavingId(eventId);
    setFormError(null);
    try {
      const res = await fetch(`/api/events/${eventId}?calendarId=${encodeURIComponent(calendarId ?? "primary")}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: nextTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to rename event");
      cancelEventEdit();
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't rename that event. Try again.");
    } finally {
      setEditingEventSavingId(null);
    }
  };

  const deleteEventItem = async (eventId: string, calendarId?: string) => {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    setDeletingId(eventId);
    try {
      const res = await fetch(
        `/api/events/${eventId}?calendarId=${encodeURIComponent(calendarId ?? "primary")}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete event");
      refresh();
    } catch {
      setFormError("Couldn't delete that event. Try again.");
    } finally {
      setDeletingId(null);
    }
  };

  if (sessionStatus === "unauthenticated") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="font-serif text-3xl font-semibold mb-4">Calendar</h1>
        <div className="border border-rule p-10 text-center">
          <p className="text-sm text-ink-soft mb-4">
            Connect Google Calendar to see your events here.
          </p>
          <button
            onClick={() => signIn("google")}
            className="bg-ink text-paper text-sm font-medium px-5 py-2.5 hover:bg-accent transition-colors"
          >
            Connect Google Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1280px] mx-auto px-3 py-4 space-y-3 md:px-8 md:py-10 md:space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap border-b border-rule pb-2 md:pb-5">
        <div>
          <p className="text-[9px] md:text-[11px] uppercase tracking-[0.2em] text-accent font-medium mb-0.5 md:mb-1">
            Section Two
          </p>
          <h1 className="font-serif text-xl md:text-4xl font-semibold tracking-tight">Calendar</h1>
          <p className="hidden md:block mt-1.5 text-sm text-ink-soft max-w-md">
            Plan your days, stay consistent, and make time for what matters.
          </p>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <SyncStatus state={syncState} onRetry={refresh} />
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1 md:gap-1.5 rounded-full bg-accent text-paper text-[10px] md:text-xs font-semibold uppercase tracking-widest px-2.5 py-1.5 md:px-4 md:py-2.5 hover:bg-ink transition-colors"
          >
            {showForm ? "Cancel" : "+ Add Event"}
          </button>
        </div>
      </header>

      <div className="flex w-full max-w-[480px] overflow-hidden rounded-full border border-rule p-0.5 text-[11px] md:text-sm uppercase tracking-widest">
        <button
          type="button"
          onClick={() => {
            const today = new Date();
            setView("Today");
            setSelectedDate(today);
          }}
          className={`relative z-10 flex flex-1 min-w-0 cursor-pointer pointer-events-auto items-center justify-center gap-1.5 md:gap-2 rounded-full h-10 md:h-11 px-3 md:px-4 touch-manipulation transition-colors ${
            view === "Today"
              ? "bg-accent text-paper font-semibold"
              : "text-ink-soft hover:text-ink"
          }`}
          aria-pressed={view === "Today"}
        >
          <IconSun className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
          <span className="truncate">Today</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setView("Week");
            setSelectedDate(null);
          }}
          className={`relative z-10 flex flex-1 min-w-0 cursor-pointer pointer-events-auto items-center justify-center gap-1.5 md:gap-2 rounded-full h-10 md:h-11 px-3 md:px-4 touch-manipulation transition-colors ${
            view === "Week"
              ? "bg-accent text-paper font-semibold"
              : "text-ink-soft hover:text-ink"
          }`}
          aria-pressed={view === "Week"}
        >
          <IconCalendar className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
          <span className="truncate">Week</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setView("Month");
            setSelectedDate(null);
          }}
          className={`relative z-10 flex flex-1 min-w-0 cursor-pointer pointer-events-auto items-center justify-center gap-1.5 md:gap-2 rounded-full h-10 md:h-11 px-3 md:px-4 touch-manipulation transition-colors ${
            view === "Month"
              ? "bg-accent text-paper font-semibold"
              : "text-ink-soft hover:text-ink"
          }`}
          aria-pressed={view === "Month"}
        >
          <IconCalendar className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
          <span className="truncate">Month</span>
        </button>
      </div>

      {showForm && (
        <div className="border border-rule rounded-2xl p-5 space-y-3 bg-paper-raised">
          {formError && <p className="text-sm text-red-700 dark:text-red-400">{formError}</p>}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
            className="w-full border border-rule bg-transparent px-3 py-2 text-sm outline-none focus:border-accent rounded-lg"
          />
          <div>
            <label className="text-[10px] uppercase tracking-widest text-ink-soft">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full border border-rule bg-transparent px-3 py-2 text-sm outline-none focus:border-accent rounded-lg"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-widest text-ink-soft">
                Start time (blank = all day)
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full border border-rule bg-transparent px-3 py-2 text-sm outline-none focus:border-accent rounded-lg"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] uppercase tracking-widest text-ink-soft">
                End time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={!startTime}
                className="mt-1 w-full border border-rule bg-transparent px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-40 rounded-lg"
              />
            </div>
          </div>
          <button
            onClick={addEvent}
            disabled={!title.trim() || !date || saving}
            className="bg-ink text-paper text-sm font-medium px-4 py-2 rounded-full hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Adding…" : "Add to Google Calendar"}
          </button>
        </div>
      )}

      {(error || formError) && (
        <div className="border border-red-600/30 bg-red-600/5 p-4 rounded-xl text-sm text-red-700 dark:text-red-400">
          {error ?? formError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_350px] gap-5 lg:gap-7 items-start">
        <div className="min-w-0 lg:order-1">
          <div className="flex items-center justify-between mb-2 md:mb-3">
            <h2 className="font-serif text-2xl md:text-3xl font-semibold">{rangeLabel}</h2>
            <span className="text-xs md:text-sm text-ink-soft">
              {rangedEvents.length} event{rangedEvents.length === 1 ? "" : "s"}
            </span>
          </div>

          {syncState === "syncing" && events.length === 0 && (
            <p className="text-sm text-ink-soft">Loading your events…</p>
          )}

          {!error && syncState !== "syncing" && rangedEvents.length === 0 && (
            <div className="border border-dashed border-rule rounded-2xl p-10 text-center text-sm text-ink-soft">
              No events{selectedDate ? " on this day" : " in this range"}.
            </div>
          )}

          <div className="space-y-3.5 md:space-y-5">
            {rangedEvents.map(({ event, date: evDate }, index) => {
              const { label, color } = getEventMeta(event, calendars);
              const expired = isExpiredEvent(event, evDate);
              const previous = rangedEvents[index - 1];
              const isNewDate = !previous || previous.date.toDateString() !== evDate.toDateString();

              return (
                <div key={event.id}>
                  {isNewDate && (
                    <p className="mb-1.5 px-2 text-[11px] md:text-xs uppercase tracking-[0.16em] font-semibold text-ink-soft">
                      {dateHeadingLong(evDate)}
                    </p>
                  )}

                  <div
                    className={`list-none flex items-center gap-3 rounded-2xl border overflow-hidden px-4 py-3 md:px-5 md:py-3.5 min-h-[76px] md:min-h-[84px] ${
                      expired ? "bg-[#e6e6e8] border-[#d4d4d6]" : "bg-paper-raised border-rule"
                    }`}
                    style={{
                      borderLeft: `4px solid ${expired ? "#9da0a6" : color}`,
                      backgroundColor: expired
                        ? "#e5e5e7"
                        : `color-mix(in srgb, ${color} 7%, var(--paper-raised))`,
                    }}
                  >
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                      {editingEventId === event.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={editEventTitle}
                            onChange={(e) => setEditEventTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEventTitle(event.id, event.calendarId);
                              if (e.key === "Escape") cancelEventEdit();
                            }}
                            className="min-w-0 flex-1 border border-rule bg-transparent px-2.5 py-1.5 text-sm md:text-base outline-none focus:border-accent rounded-lg"
                            aria-label="Edit event title"
                          />
                          <button
                            type="button"
                            onClick={() => saveEventTitle(event.id, event.calendarId)}
                            disabled={!editEventTitle.trim() || editingEventSavingId === event.id}
                            className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-accent disabled:opacity-40"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEventEdit}
                            disabled={editingEventSavingId === event.id}
                            className="text-[10px] md:text-xs text-ink-soft"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-0">
                          <p
                            className={`font-semibold text-sm md:text-base truncate ${
                              expired ? "text-[#76787d] line-through decoration-1" : "text-ink"
                            }`}
                          >
                            {event.summary || "(No title)"}
                          </p>
                          <button
                            type="button"
                            onClick={() => startEventEdit(event.id, event.summary || "")}
                            disabled={deletingId === event.id || editingEventSavingId === event.id}
                            className="edit-title-button"
                            aria-label="Edit event title"
                          >
                            <IconPencil className="w-[18px] h-[18px]" />
                          </button>
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap text-xs md:text-sm text-ink-soft">
                        <span
                          className="rounded-lg px-2 py-1 font-medium"
                          style={{
                            backgroundColor: expired
                              ? "rgba(128, 128, 128, 0.12)"
                              : `color-mix(in srgb, ${color} 13%, transparent)`,
                            color: expired ? "#7b7d82" : color,
                          }}
                        >
                          {label}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <IconClock className="w-3.5 h-3.5" />
                          {formatEventTime(event)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {expired ? (
                        <div className="flex items-center gap-1.5 text-sm text-[#77797f]">
                          <IconCalendar className="w-4 h-4" />
                          <span className="hidden sm:inline">Expired</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => deleteEventItem(event.id, event.calendarId)}
                          disabled={deletingId === event.id || editingEventSavingId === event.id}
                          className="w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-ink-soft/60 hover:text-red-600 hover:bg-paper transition-colors"
                          aria-label="Delete event"
                        >
                          <IconTrash className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="min-w-0 lg:order-2 lg:sticky lg:top-6">
          <MonthCalendarGrid
            events={events}
            calendars={calendars}
            selectedDate={selectedDate ?? new Date()}
            onSelectDate={(d) => {
              const selected = new Date(d);
              const today = new Date();
              const isToday = selected.toDateString() === today.toDateString();
              setView(isToday ? "Today" : "Month");
              setSelectedDate(selected);
            }}
          />
        </aside>
      </div>
    </div>
  );
}
