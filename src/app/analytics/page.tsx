"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { IconAnalytics, IconDailyLog, IconChevronRight } from "@/components/icons";
import type { DailyLogEntry, DailyLogFlow } from "@/lib/daily-log";
import { RANGE_OPTIONS, flowHistory, flowStats, parseDateKey, summarize, toDateKey, weeklySeries, type RangeId } from "@/lib/daily-log-analytics";
import styles from "../daily-log/DailyLog.module.css";

const shortDay = (key: string) => parseDateKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
const longDay = (key: string) => parseDateKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export default function AnalyticsPage() {
  const { status } = useSession();
  const [flows, setFlows] = useState<DailyLogFlow[]>([]);
  const [entries, setEntries] = useState<DailyLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<RangeId>("7d");
  const [openFlowId, setOpenFlowId] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));

  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/daily-log", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load analytics");
      if (cancelled) return;
      setFlows(Array.isArray(data.flows) ? data.flows : []);
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setTodayKey(toDateKey(new Date()));
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load analytics"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status, reloadKey]);

  const summary = useMemo(() => summarize(entries, flows, range, todayKey), [entries, flows, range, todayKey]);
  const week = useMemo(() => weeklySeries(entries, flows, todayKey), [entries, flows, todayKey]);
  const stats = useMemo(() => flowStats(entries, flows, range, todayKey), [entries, flows, range, todayKey]);
  const weekMax = Math.max(1, summary.activeFlows);
  const rangeLabel = RANGE_OPTIONS.find((option) => option.id === range)?.label ?? "";

  if (status === "unauthenticated") return <div className={styles.centerState}><p>Connect your Google account to view analytics.</p><button className={styles.primaryButton} type="button" onClick={() => signIn("google")}>Connect Google Account</button></div>;
  return <div className={styles.page}>
    <header className={styles.pageHeader}><div className={styles.pageHeading}><p className={styles.eyebrow}><IconAnalytics className={styles.tinyIcon} /> Analytics</p><h1>Analytics</h1><p className={styles.subtitle}>Your Daily Log activity, calculated from saved entries only.</p></div><Link href="/daily-log" className={styles.primaryButton}><IconDailyLog className={styles.actionIcon} /> Open Daily Log</Link></header>
    {error && <div className={styles.errorNotice} role="alert">{error}<button type="button" onClick={() => { setError(""); setLoading(true); setReloadKey((key) => key + 1); }}>Retry</button></div>}
    {loading ? <div className={styles.loadingState}>Loading analytics…</div> : <>
      <div className={styles.analyticsToolbar}>
        <div className={styles.analyticsRange} role="group" aria-label="Date range">
          {RANGE_OPTIONS.map((option) => <button key={option.id} type="button" className={styles.rangeButton} aria-pressed={range === option.id} onClick={() => setRange(option.id)}>{option.label}</button>)}
        </div>
        <span className={styles.analyticsHint}>Cards and flow activity: {rangeLabel.toLowerCase()}</span>
      </div>

      <div className={styles.analyticsStats}>
        <section className={styles.sideCard}><span>Saved days</span><strong>{summary.savedDays}</strong></section>
        <section className={styles.sideCard}><span>Completed flow check-ins</span><strong>{summary.checkIns}</strong></section>
        <section className={styles.sideCard}><span>Active flows</span><strong>{summary.activeFlows}</strong></section>
      </div>

      <section className={`${styles.historyPanel} ${styles.weekPanel}`} aria-labelledby="week-title">
        <div className={styles.historyHeader}><h2 id="week-title">Weekly activity</h2><span>Completed flow check-ins · last 7 days</span></div>
        <ol className={styles.weekChart} aria-label="Completed flow check-ins per day for the last 7 days">
          {week.map((point) => {
            const label = !point.hasEntry ? `${longDay(point.date)}: no saved entry` : `${longDay(point.date)}: ${point.checkIns} completed flow check-in${point.checkIns === 1 ? "" : "s"}`;
            return <li key={point.date} className={styles.weekBar} aria-label={label}>
              <div className={styles.barArea} aria-hidden="true">
                <span className={`${styles.bar} ${!point.hasEntry ? styles.barNone : point.checkIns === 0 ? styles.barZero : ""}`} style={point.hasEntry && point.checkIns > 0 ? { height: `${(point.checkIns / weekMax) * 100}%` } : undefined} />
              </div>
              <b aria-hidden="true">{point.hasEntry ? point.checkIns : "–"}</b>
              <small aria-hidden="true">{shortDay(point.date)}</small>
            </li>;
          })}
        </ol>
        <p className={styles.weekLegend}>Dashed marker = no saved entry that day. Grey marker = entry saved with 0 completed flows. This chart always shows the last 7 days.</p>
      </section>

      <section className={styles.historyPanel}>
        <div className={styles.historyHeader}><h2>Flow activity</h2><span>{rangeLabel} · {summary.savedDays} saved day{summary.savedDays === 1 ? "" : "s"}</span></div>
        {stats.length === 0 ? <div className={styles.emptyState}>No active flows yet. Add one in the Daily Log.</div> : stats.map((stat) => {
          const open = openFlowId === stat.flow.id;
          const history = open ? flowHistory(entries, stat.flow.id, range, todayKey) : [];
          return <div key={stat.flow.id} className={styles.flowActivityRow}>
            <button type="button" className={styles.analyticsFlow} aria-expanded={open} aria-controls={`history-${stat.flow.id}`} onClick={() => setOpenFlowId(open ? null : stat.flow.id)}>
              <span className={styles.analyticsColor} style={{ background: stat.flow.color }} />
              <span>{stat.flow.name}</span>
              <span className={styles.flowMeta}>
                <strong>{stat.completedDays} completed day{stat.completedDays === 1 ? "" : "s"}{stat.percent !== null ? ` · ${stat.percent}%` : ""}</strong>
                <small>{stat.lastCompleted ? `Last: ${longDay(stat.lastCompleted)}` : "Not completed in this range"}</small>
              </span>
              <IconChevronRight className={styles.tinyIcon} />
            </button>
            {open && <div className={styles.flowHistory} id={`history-${stat.flow.id}`}>
              {history.length === 0 ? <p className={styles.sideEmpty}>No completed days recorded for this flow in this range.</p> : <ul>
                {history.map((item) => <li key={item.date}><Link href={`/daily-log?date=${item.date}`}>{longDay(item.date)}</Link><span>{item.note || "No note"}</span></li>)}
              </ul>}
            </div>}
          </div>;
        })}
        <p className={styles.weekLegend}>Percent = days this flow was completed ÷ saved days in the range. Archived flows are excluded.</p>
      </section>
    </>}
  </div>;
}
