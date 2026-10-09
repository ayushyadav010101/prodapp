"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { IconChevronLeft, IconChevronRight, IconDailyLog } from "@/components/icons";
import type { DailyLogEntry, DailyLogFlow } from "@/lib/daily-log";
import styles from "../DailyLog.module.css";

function asDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}
function formatDate(key: string) {
  return asDate(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function preview(entry: DailyLogEntry, flows: DailyLogFlow[]) {
  const noteParts = Object.values(entry.notes).map((note) => note.trim()).filter(Boolean);
  if (noteParts.length) return noteParts.join(", ").replace(/\s+/g, " ");
  const completed = flows.filter((flow) => entry.completedFlowIds.includes(flow.id)).map((flow) => flow.name);
  return completed.length ? `${completed.join(", ")} completed` : "Daily entry saved";
}

export default function DailyLogHistoryPage() {
  const { status } = useSession();
  const [entries, setEntries] = useState<DailyLogEntry[]>([]);
  const [flows, setFlows] = useState<DailyLogFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/daily-log", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load saved entries");
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setFlows(Array.isArray(data.flows) ? data.flows : []);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load saved entries")).finally(() => setLoading(false));
  }, [status]);

  if (status === "unauthenticated") return <div className={styles.centerState}><p>Connect your Google account to view saved entries.</p><button className={styles.primaryButton} type="button" onClick={() => signIn("google")}>Connect Google Account</button></div>;

  return <div className={styles.page}>
    <header className={styles.pageHeader}>
      <div className={styles.pageHeading}><p className={styles.eyebrow}>Daily Log / History</p><h1>Saved Entries</h1><p className={styles.subtitle}>Browse and reopen your saved daily notes and completion states.</p></div>
      <Link href="/daily-log" className={styles.primaryButton}><IconChevronLeft className={styles.tinyIcon} /> Back to Daily Log</Link>
    </header>
    {error && <div className={styles.errorNotice} role="alert">{error}</div>}
    <section className={styles.historyPanel}>
      {loading ? <div className={styles.loadingState}>Loading saved entries…</div> : entries.length === 0 ? <div className={styles.emptyState}>No saved entries yet. Save a Daily Log entry and it will appear here.</div> : entries.map((entry) => <Link key={entry.date} href={`/daily-log?date=${entry.date}`} className={styles.historyEntry}>
        <IconDailyLog className={styles.recentDocIcon} />
        <span><strong>{formatDate(entry.date)}</strong><small>{preview(entry, flows)}</small></span>
        <span className={styles.historyMeta}>{entry.completedFlowIds.length} completed</span>
        <IconChevronRight className={styles.tinyIcon} />
      </Link>)}
    </section>
  </div>;
}
