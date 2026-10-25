import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, entriesInRange, flowHistory, flowStats, rangeBounds, summarize, summarizeDay, weeklySeries } from "./daily-log-analytics.ts";
import type { DailyLogEntry, DailyLogFlow } from "./daily-log.ts";

const flow = (id: string, order: number, archived = false): DailyLogFlow => ({ id, name: id, icon: "note", color: "#ff8b52", plan: "", order, ...(archived ? { archived: true } : {}) });
const entry = (date: string, ids: string[], notes: Record<string, string> = {}): DailyLogEntry => ({ date, completedFlowIds: ids, notes, savedAt: "x" });
const flows = [flow("a", 0), flow("b", 1), flow("old", 2, true)];
const TODAY = "2026-03-02";

test("addDays crosses month, year and leap-day boundaries", () => {
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2024-03-01", -1), "2024-02-29");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-08", 1), "2026-03-09"); // US DST start
});

test("range bounds are inclusive and exact", () => {
  assert.deepEqual(rangeBounds("7d", TODAY), { start: "2026-02-24", end: TODAY });
  assert.deepEqual(rangeBounds("30d", TODAY), { start: "2026-02-01", end: TODAY });
  assert.deepEqual(rangeBounds("all", TODAY), { start: null, end: null });
});

test("summary ignores archived flows, dedupes ids and dates, honours range", () => {
  const entries = [entry("2026-03-02", ["a", "b", "b", "old"]), entry("2026-03-02", ["a"]), entry("2026-02-20", ["a"]), entry("2025-01-01", ["b"])];
  assert.deepEqual(summarize(entries, flows, "7d", TODAY), { savedDays: 1, checkIns: 2, activeFlows: 2 });
  assert.deepEqual(summarize(entries, flows, "30d", TODAY), { savedDays: 2, checkIns: 3, activeFlows: 2 });
  assert.deepEqual(summarize(entries, flows, "all", TODAY), { savedDays: 3, checkIns: 4, activeFlows: 2 });
});

test("empty data gives zeros, not invented values", () => {
  assert.deepEqual(summarize([], flows, "all", TODAY), { savedDays: 0, checkIns: 0, activeFlows: 2 });
  assert.equal(flowStats([], flows, "7d", TODAY)[0].percent, null);
  assert.deepEqual(summarizeDay([], []), { completed: 0, total: 0, percent: 0 });
});

test("weekly series covers 7 dates and separates 'no entry' from 'zero'", () => {
  const series = weeklySeries([entry("2026-03-02", ["a"]), entry("2026-02-28", [])], flows, TODAY);
  assert.equal(series.length, 7);
  assert.equal(series[0].date, "2026-02-24");
  assert.equal(series[6].date, TODAY);
  assert.deepEqual(series[4], { date: "2026-02-28", hasEntry: true, checkIns: 0 });
  assert.deepEqual(series[5], { date: "2026-03-01", hasEntry: false, checkIns: 0 });
  assert.equal(series[6].checkIns, 1);
});

test("flow stats and history come from the same records", () => {
  const entries = [entry("2026-03-02", ["a"], { a: " hi " }), entry("2026-03-01", ["a", "b"]), entry("2026-02-27", ["b"])];
  const stats = flowStats(entries, flows, "7d", TODAY);
  assert.equal(stats[0].completedDays, 2);
  assert.equal(stats[0].percent, 67);
  assert.equal(stats[0].lastCompleted, "2026-03-02");
  const history = flowHistory(entries, "a", "7d", TODAY);
  assert.deepEqual(history, [{ date: "2026-03-02", note: "hi" }, { date: "2026-03-01", note: "" }]);
  assert.equal(history.length, stats[0].completedDays);
  assert.equal(flowHistory(entries, "nope", "all", TODAY).length, 0);
});

test("entriesInRange keeps all-time unbounded", () => {
  assert.equal(entriesInRange([entry("1999-01-01", [])], "all", TODAY).length, 1);
});

test("summarizeDay uses active flows as the denominator", () => {
  assert.deepEqual(summarizeDay(["a", "old"], flows), { completed: 1, total: 2, percent: 50 });
});
