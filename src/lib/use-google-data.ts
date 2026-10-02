"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { GoogleCalendarListEntry, GoogleEvent, GoogleTaskList, GoogleTask } from "./google-api";
import { computeActiveDates, computeLevel } from "./level";

export type SyncState = "idle" | "syncing" | "error";

/**
 * Removes duplicate Google Calendar entries that represent the same logical
 * event (most commonly duplicated holiday calendars), using the same rule the
 * Calendar page uses for its visible event list.
 */
export function dedupeCalendarEvents(events: GoogleEvent[]): GoogleEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const raw = event.start?.dateTime ?? event.start?.date;
    if (!raw) return true;

    let startKey = raw;
    if (event.start?.date && !event.start?.dateTime) {
      startKey = event.start.date;
    }

    const key = `${event.summary ?? ""}|${startKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


export function useCalendarData() {
  const { status: sessionStatus } = useSession();
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const [events, setEvents] = useState<GoogleEvent[]>([]);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (sessionStatus !== "authenticated") return;
    setSyncState("syncing");
    setError(null);
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load events");
      setCalendars(data.calendars ?? []);
      setEvents(data.events ?? []);
      setSyncState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown sync error");
      setSyncState("error");
    }
  }, [sessionStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { calendars, events, syncState, error, refresh };
}


export function useEventCheckInsData() {
  const { status: sessionStatus } = useSession();
  const [checkedInKeys, setCheckedInKeys] = useState<string[]>([]);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (sessionStatus !== "authenticated") return;
    setSyncState("syncing");
    setError(null);
    try {
      const res = await fetch("/api/event-checkins");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load event check-ins");
      setCheckedInKeys(Array.isArray(data.keys) ? data.keys : []);
      setSyncState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown sync error");
      setSyncState("error");
    }
  }, [sessionStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { checkedInKeys, setCheckedInKeys, syncState, error, refresh };
}

export function useTasksData() {
  const { status: sessionStatus } = useSession();
  const [taskLists, setTaskLists] = useState<GoogleTaskList[]>([]);
  const [tasks, setTasks] = useState<GoogleTask[]>([]);
  const [todayTaskIds, setTodayTaskIds] = useState<string[]>([]);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (sessionStatus !== "authenticated") return;
    setSyncState("syncing");
    setError(null);
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load tasks");
      setTaskLists(data.taskLists ?? []);
      setTasks(data.tasks ?? []);
      setTodayTaskIds(Array.isArray(data.todayTaskIds) ? data.todayTaskIds : []);
      setSyncState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown sync error");
      setSyncState("error");
    }
  }, [sessionStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { taskLists, tasks, todayTaskIds, syncState, error, refresh };
}

export function useSkillsData() {
  const { status: sessionStatus } = useSession();
  const [skills, setSkills] = useState<
    { id: string; name: string; durationDays: number; startDate: string; completedDates: string[] }[]
  >([]);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (sessionStatus !== "authenticated") return;
    setSyncState("syncing");
    setError(null);
    try {
      const res = await fetch("/api/skills");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load skills");
      setSkills(data.skills ?? []);
      setSyncState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown sync error");
      setSyncState("error");
    }
  }, [sessionStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { skills, syncState, error, refresh };
}

// Level = one point per distinct day with any real activity. The set of
// qualifying days is ALSO permanently logged to a hidden Google Task list
// (see level-sync.ts): live data (the calendar's rolling fetch window, or a
// deleted old task/skill/session) can lose evidence of a day that happened
// long ago, which would otherwise make the Level drop. Merging with the
// permanent log guarantees Level only ever grows.
//
// This variant takes data the caller has ALREADY fetched, so pages that
// already load events/tasks/skills/sessions (like Home) don't fetch them twice.
export function useLevelFromData(
  events: GoogleEvent[],
  tasks: GoogleTask[],
  skills: { id: string; name: string; durationDays: number; startDate: string; completedDates: string[] }[]
) {
  const { status: sessionStatus } = useSession();
  const [loggedDays, setLoggedDays] = useState<string[]>([]);

  const liveActiveDates = computeActiveDates(events, tasks, skills);
  const liveKey = JSON.stringify(Array.from(liveActiveDates).sort());
  const loggedKey = JSON.stringify(loggedDays);

  const refreshLog = useCallback(async () => {
    if (sessionStatus !== "authenticated") return;
    try {
      const res = await fetch("/api/level-log");
      const data = await res.json();
      if (res.ok) setLoggedDays(data.days ?? []);
    } catch {
      // best-effort; merged level below still works from live data alone
    }
  }, [sessionStatus]);

  useEffect(() => {
    refreshLog();
  }, [refreshLog]);

  // Flush newly discovered active days (e.g. today just became active) to
  // the permanent log. Server side is idempotent, so this is safe to repeat.
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    const loggedSet = new Set<string>(JSON.parse(loggedKey));
    const newDays = (JSON.parse(liveKey) as string[]).filter((d) => !loggedSet.has(d));
    if (newDays.length === 0) return;
    fetch("/api/level-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: newDays }),
    })
      .then(() => refreshLog())
      .catch(() => {});
  }, [sessionStatus, liveKey, loggedKey, refreshLog]);

  const mergedDates = new Set([...loggedDays, ...liveActiveDates]);
  const level = computeLevel(mergedDates);
  const todayActive = mergedDates.has(new Date().toDateString());

  return { level, activeDates: mergedDates, todayActive };
}

// Self-fetching version for pages that don't already load this data.
export function useLevel() {
  const { events } = useCalendarData();
  const { tasks } = useTasksData();
  const { skills } = useSkillsData();
  return useLevelFromData(events, tasks, skills);
}
