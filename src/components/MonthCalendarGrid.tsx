"use client";

import { useEffect, useState } from "react";
import type { GoogleEvent, GoogleCalendarListEntry } from "@/lib/google-api";
import { getEventMeta } from "@/lib/calendarColors";
import { IconChevronLeft, IconChevronRight, IconSun, IconCalendar } from "@/components/icons";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function getEventDateKey(event: GoogleEvent): string | null {
  const start = event.start?.dateTime ?? event.start?.date;
  if (!start) return null;
  return new Date(start).toDateString();
}

export function MonthCalendarGrid({
  events,
  calendars,
  selectedDate,
  view,
  onChangeView,
  onSelectDate,
}: {
  events: GoogleEvent[];
  calendars: GoogleCalendarListEntry[];
  selectedDate: Date;
  view: "Today" | "Week" | "Month";
  onChangeView: (view: "Today" | "Month") => void;
  onSelectDate: (d: Date) => void;
}) {
  const [cursor, setCursor] = useState(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );
  const selectedYear = selectedDate.getFullYear();
  const selectedMonth = selectedDate.getMonth();

  useEffect(() => {
    setCursor((current) => {
      if (current.getFullYear() === selectedYear && current.getMonth() === selectedMonth) {
        return current;
      }
      return new Date(selectedYear, selectedMonth, 1);
    });
  }, [selectedYear, selectedMonth]);

  // Up to 3 distinct event colors per day, for the little dots under the date.
  const dayColors = new Map<string, string[]>();
  for (const event of events) {
    const key = getEventDateKey(event);
    if (!key) continue;
    const { color } = getEventMeta(event, calendars);
    const existing = dayColors.get(key) ?? [];
    if (!existing.includes(color) && existing.length < 3) existing.push(color);
    dayColors.set(key, existing);
  }

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  return (
    <div className="month-calendar-shell rounded-2xl border border-rule bg-paper-raised overflow-hidden w-full lg:min-w-[340px] lg:max-w-[350px] lg:ml-auto">
      <div className="month-calendar-main min-w-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-rule lg:px-4 lg:py-3">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="w-7 h-7 rounded-full border border-rule flex items-center justify-center text-ink-soft hover:border-accent hover:text-accent transition-colors shrink-0 lg:w-8 lg:h-8"
            aria-label="Previous month"
          >
            <IconChevronLeft className="w-3 h-3" />
          </button>
          <p className="font-serif text-sm font-semibold tracking-wide truncate px-2 lg:text-base">
            {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </p>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="w-7 h-7 rounded-full border border-rule flex items-center justify-center text-ink-soft hover:border-accent hover:text-accent transition-colors shrink-0 lg:w-8 lg:h-8"
            aria-label="Next month"
          >
            <IconChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center px-2 pt-2 lg:pt-2.5">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="text-[8px] uppercase tracking-widest text-ink-soft py-1 lg:text-[10px] lg:py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5 px-2 pb-2 lg:gap-1 lg:pb-2">
          {cells.map((date, i) => {
            if (!date) return <div key={i} className="h-10 lg:h-11" />;
            const colors = dayColors.get(date.toDateString()) ?? [];
            const isToday = isSameDay(date, today);
            const isSelected = isSameDay(date, selectedDate);
            return (
              <button
                key={i}
                onClick={() => onSelectDate(date)}
                className={`h-10 rounded-md flex flex-col items-center justify-center text-[10px] relative transition-colors lg:h-11 lg:text-xs ${
                  isSelected
                    ? "bg-accent text-paper font-semibold"
                    : isToday
                    ? "text-accent font-semibold"
                    : "text-ink hover:bg-rule/40"
                }`}
              >
                <span>{date.getDate()}</span>
                {colors.length > 0 && (
                  <span className="flex items-center gap-0.5 mt-0.5">
                    {colors.map((c, ci) => (
                      <span
                        key={ci}
                        className="w-1 h-1 rounded-full lg:w-1.5 lg:h-1.5"
                        style={{ backgroundColor: isSelected ? "currentColor" : c }}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="month-calendar-mobile-controls" aria-label="Calendar view controls">
        <button
          type="button"
          onClick={() => onChangeView("Today")}
          className={`month-calendar-mobile-control ${view === "Today" ? "is-active" : ""}`}
          aria-pressed={view === "Today"}
        >
          <IconSun className="w-5 h-5" />
          <span>Today</span>
        </button>
        <button
          type="button"
          onClick={() => onChangeView("Month")}
          className={`month-calendar-mobile-control ${view === "Month" ? "is-active" : ""}`}
          aria-pressed={view === "Month"}
        >
          <IconCalendar className="w-5 h-5" />
          <span>Month</span>
        </button>
      </div>
    </div>
  );
}
