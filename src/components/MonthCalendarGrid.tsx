"use client";

import { useEffect, useState } from "react";
import type { GoogleEvent, GoogleCalendarListEntry } from "@/lib/google-api";
import { getEventMeta } from "@/lib/calendarColors";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";

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
  onSelectDate,
}: {
  events: GoogleEvent[];
  calendars: GoogleCalendarListEntry[];
  selectedDate: Date;
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
    <div className="rounded-[22px] border border-rule bg-paper-raised overflow-hidden w-full">
      <div className="flex items-center justify-between px-4 py-3 md:px-5 md:py-4 border-b border-rule">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="w-9 h-9 rounded-full border border-rule flex items-center justify-center text-ink-soft hover:border-accent hover:text-accent transition-colors shrink-0"
          aria-label="Previous month"
        >
          <IconChevronLeft className="w-4 h-4" />
        </button>
        <p className="font-serif text-base md:text-xl font-semibold tracking-wide truncate px-1">
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </p>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="w-9 h-9 rounded-full border border-rule flex items-center justify-center text-ink-soft hover:border-accent hover:text-accent transition-colors shrink-0"
          aria-label="Next month"
        >
          <IconChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center px-2 pt-3 md:pt-4">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-[10px] md:text-xs uppercase tracking-widest text-ink-soft py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-x-1 gap-y-1 px-2 pb-4 md:pb-5">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="h-11 md:h-12" />;
          const colors = dayColors.get(date.toDateString()) ?? [];
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);
          return (
            <button
              key={i}
              onClick={() => onSelectDate(date)}
              className={`h-11 md:h-12 rounded-xl flex flex-col items-center justify-center text-sm md:text-base relative transition-colors ${
                isSelected
                  ? "bg-accent text-paper font-semibold"
                  : isToday
                  ? "text-accent font-semibold"
                  : "text-ink hover:bg-rule/40"
              }`}
            >
              <span>{date.getDate()}</span>
              {colors.length > 0 && (
                <span className="flex items-center gap-0.5 mt-1">
                  {colors.map((c, ci) => (
                    <span
                      key={ci}
                      className="w-1.5 h-1.5 rounded-full"
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
  );
}
