"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { IconAnalytics, IconDailyLog, IconChevronRight } from "@/components/icons";
import type { DailyLogEntry, DailyLogFlow } from "@/lib/daily-log";
import styles from "../daily-log/DailyLog.module.css";

export default function AnalyticsPage() {
  const { status } = useSession();
  const [flows, setFlows] = useState<DailyLogFlow[]>([]);
  const [entries, setEntries] = useState<DailyLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/daily-log", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load analytics");
      setFlows(Array.isArray(data.flows) ? data.flows : []); setEntries(Array.isArray(data.entries) ? data.entries : []);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load analytics")).finally(() => setLoading(false));
  }, [status]);
  const activeFlows = flows.filter((flow) => !flow.archived);
  const totalCompleted = entries.reduce((sum, entry) => sum + entry.completedFlowIds.filter((id) => activeFlows.some((flow) => flow.id === id)).length, 0);
  const stats = useMemo(() => activeFlows.map((flow) => ({ ...flow, completed: entries.filter((entry) => entry.completedFlowIds.includes(flow.id)).length })), [activeFlows, entries]);
  if (status === "unauthenticated") return <div className={styles.centerState}><p>Connect your Google account to view analytics.</p><button className={styles.primaryButton} type="button" onClick={() => signIn("google")}>Connect Google Account</button></div>;
  return <div className={styles.page}>
    <header className={styles.pageHeader}><div className={styles.pageHeading}><p className={styles.eyebrow}><IconAnalytics className={styles.tinyIcon} /> Analytics</p><h1>Analytics</h1><p className={styles.subtitle}>Your Daily Log activity, calculated from saved entries only.</p></div><Link href="/daily-log" className={styles.primaryButton}><IconDailyLog className={styles.actionIcon} /> Open Daily Log</Link></header>
    {error && <div className={styles.errorNotice} role="alert">{error}</div>}
    {loading ? <div className={styles.loadingState}>Loading analytics…</div> : <>
      <div className={styles.analyticsStats}><section className={styles.sideCard}><span>Saved days</span><strong>{entries.length}</strong></section><section className={styles.sideCard}><span>Completed flow check-ins</span><strong>{totalCompleted}</strong></section><section className={styles.sideCard}><span>Active flows</span><strong>{activeFlows.length}</strong></section></div>
      <section className={styles.historyPanel}><div className={styles.historyHeader}><h2>Flow activity</h2><span>Saved entries: {entries.length}</span></div>{stats.map((flow) => <div key={flow.id} className={styles.analyticsFlow}><span className={styles.analyticsColor} style={{ background: flow.color }} /><span>{flow.name}</span><strong>{flow.completed} completed day{flow.completed === 1 ? "" : "s"}</strong><Link href="/daily-log" aria-label={`Open ${flow.name} in Daily Log`}><IconChevronRight className={styles.tinyIcon} /></Link></div>)}</section>
    </>}
  </div>;
}
