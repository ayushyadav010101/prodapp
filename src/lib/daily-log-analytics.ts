import type { DailyLogEntry, DailyLogFlow } from "./daily-log";

/**
 * Central definitions for every Daily Log metric. All values are derived from
 * saved entries only (never from unsaved drafts).
 *
 * - Saved day: a distinct date key that has a saved entry.
 * - Check-in: one active flow marked complete in one saved entry.
 *   Archived/unknown flow IDs in an entry are ignored, so cards, chart,
 *   flow activity and history all agree.
 * - Active flow: a flow that is not archived.
 */

export type RangeId = "7d" | "30d" | "all";
export const RANGE_OPTIONS: { id: RangeId; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "all", label: "All time" },
];

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Local noon avoids DST edge cases when stepping by whole days. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** Inclusive bounds. `null` means unbounded. Keys compare correctly as strings. */
export function rangeBounds(range: RangeId, todayKey: string): { start: string | null; end: string | null } {
  if (range === "all") return { start: null, end: null };
  const length = range === "7d" ? 7 : 30;
  return { start: addDays(todayKey, -(length - 1)), end: todayKey };
}

export function entriesInRange(entries: DailyLogEntry[], range: RangeId, todayKey: string): DailyLogEntry[] {
  const { start, end } = rangeBounds(range, todayKey);
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.date)) return false; // never count one date twice
    seen.add(entry.date);
    return (start === null || entry.date >= start) && (end === null || entry.date <= end);
  });
}

export function activeFlowsOf(flows: DailyLogFlow[]): DailyLogFlow[] {
  return flows.filter((flow) => !flow.archived).sort((a, b) => a.order - b.order);
}

/** Completed active-flow IDs of an entry (deduplicated). */
export function completedActiveIds(entry: Pick<DailyLogEntry, "completedFlowIds">, flows: DailyLogFlow[]): string[] {
  const active = new Set(activeFlowsOf(flows).map((flow) => flow.id));
  return [...new Set(entry.completedFlowIds)].filter((id) => active.has(id));
}

export type DaySummary = { completed: number; total: number; percent: number };
export function summarizeDay(completedFlowIds: string[], flows: DailyLogFlow[]): DaySummary {
  const total = activeFlowsOf(flows).length;
  const completed = completedActiveIds({ completedFlowIds }, flows).length;
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

export type AnalyticsSummary = { savedDays: number; checkIns: number; activeFlows: number };
export function summarize(entries: DailyLogEntry[], flows: DailyLogFlow[], range: RangeId, todayKey: string): AnalyticsSummary {
  const scoped = entriesInRange(entries, range, todayKey);
  return {
    savedDays: scoped.length,
    checkIns: scoped.reduce((sum, entry) => sum + completedActiveIds(entry, flows).length, 0),
    activeFlows: activeFlowsOf(flows).length,
  };
}

export type WeekPoint = { date: string; hasEntry: boolean; checkIns: number };
/** Seven calendar days ending at `todayKey`, oldest first. */
export function weeklySeries(entries: DailyLogEntry[], flows: DailyLogFlow[], todayKey: string): WeekPoint[] {
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(todayKey, index - 6);
    const entry = byDate.get(date);
    return { date, hasEntry: Boolean(entry), checkIns: entry ? completedActiveIds(entry, flows).length : 0 };
  });
}

export type FlowStat = {
  flow: DailyLogFlow;
  completedDays: number;
  savedDays: number;
  percent: number | null;
  lastCompleted: string | null;
};
/** Percent = completed days / saved days in range (null when range has no saved days). */
export function flowStats(entries: DailyLogEntry[], flows: DailyLogFlow[], range: RangeId, todayKey: string): FlowStat[] {
  const scoped = entriesInRange(entries, range, todayKey);
  return activeFlowsOf(flows).map((flow) => {
    const done = scoped.filter((entry) => entry.completedFlowIds.includes(flow.id)).map((entry) => entry.date).sort();
    return {
      flow,
      completedDays: done.length,
      savedDays: scoped.length,
      percent: scoped.length === 0 ? null : Math.round((done.length / scoped.length) * 100),
      lastCompleted: done.length ? done[done.length - 1] : null,
    };
  });
}

export type FlowHistoryItem = { date: string; note: string };
/** Real recorded completions for one flow, newest first. */
export function flowHistory(entries: DailyLogEntry[], flowId: string, range: RangeId, todayKey: string): FlowHistoryItem[] {
  return entriesInRange(entries, range, todayKey)
    .filter((entry) => entry.completedFlowIds.includes(flowId))
    .map((entry) => ({ date: entry.date, note: (entry.notes[flowId] ?? "").trim() }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
