"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import {
  IconArrowRight,
  IconCollapse,
  IconDownload,
  IconProfile,
  IconExpand,
  IconPause,
  IconPlay,
  IconShare,
  IconTrash,
} from "@/components/icons";
import { generateShareCard, downloadBlob, shareOrDownload } from "@/lib/shareCard";
import FocusStudyIllustration from "@/components/FocusStudyIllustration";
import { useLevel } from "@/lib/use-google-data";

const QUOTES = [
  "Discipline is choosing between what you want now and what you want most.",
  "Small steps, done daily, outrun bursts done rarely.",
  "The work you avoid is usually the work that matters most.",
  "Focus is a muscle — every session makes it stronger.",
  "Done is better than perfect. Start.",
];

interface FocusSessionRecord {
  id: string;
  title: string;
  durationMinutes: number;
  completedAt: string;
  totalMinutes?: number;
  remainingSeconds?: number;
  incomplete?: boolean;
}

type Phase = "setup" | "focusing" | "paused" | "break" | "completed";

function formatTime(totalSeconds: number) {
  const m = Math.floor(Math.max(0, totalSeconds) / 60);
  const s = Math.max(0, totalSeconds) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}


/* Focus study artwork lives in its own component so the session UI only controls placement/state. */
export function FocusSession() {
  const { data: session } = useSession();
  const { level } = useLevel();
  const [phase, setPhase] = useState<Phase>("setup");
  const [title, setTitle] = useState("");
  const [durationMin, setDurationMin] = useState<number | "">("");
  const [totalSeconds, setTotalSeconds] = useState(25 * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [breakRemaining, setBreakRemaining] = useState(5 * 60);
  const [breakTotalSeconds, setBreakTotalSeconds] = useState(5 * 60);
  const [sessionStartedAt, setSessionStartedAt] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [breakBanner, setBreakBanner] = useState(false);
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  const [lastSavedMinutes, setLastSavedMinutes] = useState(0);
  const [history, setHistory] = useState<FocusSessionRecord[]>([]);
  const [historySync, setHistorySync] = useState<"idle" | "syncing" | "error">("idle");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [lastEndedIncomplete, setLastEndedIncomplete] = useState(false);
  const lastBreakMarkRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshHistory = useCallback(async () => {
    setHistorySync("syncing");
    try {
      const res = await fetch("/api/focus-sessions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load history");
      setHistory(data.sessions ?? []);
      setHistorySync("idle");
    } catch {
      setHistorySync("error");
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (phase !== "focusing") return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== "break") return;
    const interval = setInterval(() => {
      setBreakRemaining((prev) => {
        if (prev <= 1) {
          setPhase("focusing");
          return 5 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const persistSession = useCallback(
    async (opts: { minutes: number; incomplete: boolean; remainingSecondsLeft: number; totalMinutes: number }) => {
      const { minutes, incomplete, remainingSecondsLeft, totalMinutes } = opts;
      const payload = {
        title: title.trim() || "Focus Session",
        durationMinutes: minutes,
        totalMinutes,
        remainingSeconds: incomplete ? remainingSecondsLeft : undefined,
        incomplete,
      };
      try {
        if (activeRecordId) {
          const res = await fetch(`/api/focus-sessions/${activeRecordId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error("Failed to update session");
        } else {
          const res = await fetch("/api/focus-sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error("Failed to save session");
          if (data.session?.id) setActiveRecordId(data.session.id);
        }
        if (!incomplete) setActiveRecordId(null);
        refreshHistory();
      } catch {
        // Best effort; the server history will remain intact if the request fails.
      }
    },
    [title, activeRecordId, refreshHistory]
  );

  useEffect(() => {
    if (phase !== "focusing" || remainingSeconds !== 0) return;
    const minutes = Math.round(totalSeconds / 60);
    setLastSavedMinutes(minutes);
    setLastEndedIncomplete(false);
    persistSession({ minutes, incomplete: false, remainingSecondsLeft: 0, totalMinutes: minutes });
    setPhase("completed");
  }, [remainingSeconds, phase, totalSeconds, persistSession]);

  useEffect(() => {
    if (phase !== "focusing") return;
    const elapsed = totalSeconds - remainingSeconds;
    const blocksPassed = Math.floor(elapsed / (45 * 60));
    if (blocksPassed > lastBreakMarkRef.current) {
      lastBreakMarkRef.current = blocksPassed;
      setBreakBanner(true);
    }
  }, [remainingSeconds, phase, totalSeconds]);

  useEffect(() => {
    const updateClock = () => setCurrentTime(new Date());
    updateClock();
    const interval = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const enterFullscreen = () => {
    if (document.fullscreenElement || !containerRef.current?.requestFullscreen) return Promise.resolve();
    return containerRef.current.requestFullscreen();
  };

  const start = () => {
    // Request fullscreen directly from the Start Session click handler while the user gesture is active.
    void enterFullscreen().catch((error) => {
      console.warn("Fullscreen request failed:", error);
    });

    const minutes = Math.max(1, Number(durationMin) || 1);
    const secs = minutes * 60;
    setTotalSeconds(secs);
    setRemainingSeconds(secs);
    setSessionStartedAt(new Date());
    setBreakBanner(false);
    setActiveRecordId(null);
    lastBreakMarkRef.current = 0;
    setPhase("focusing");
  };

  const resumeRecord = (rec: FocusSessionRecord) => {
    // Resume is also a user gesture, so request fullscreen directly in this click path.
    void enterFullscreen().catch((error) => {
      console.warn("Fullscreen request failed:", error);
    });

    const totalMinutes = rec.totalMinutes ?? rec.durationMinutes;
    const secsRemaining = rec.remainingSeconds ?? 0;
    const secsTotal = Math.max(secsRemaining, totalMinutes * 60);
    const elapsedSoFar = secsTotal - secsRemaining;
    setTitle(rec.title);
    setTotalSeconds(secsTotal);
    setRemainingSeconds(secsRemaining);
    setSessionStartedAt(new Date(Date.now() - elapsedSoFar * 1000));
    setBreakBanner(false);
    setActiveRecordId(rec.id);
    lastBreakMarkRef.current = Math.floor(elapsedSoFar / (45 * 60));
    setPhase("focusing");
  };

  const pauseResume = () => setPhase((p) => (p === "focusing" ? "paused" : "focusing"));

  const takeBreak = () => {
    setBreakTotalSeconds(5 * 60);
    setBreakRemaining(5 * 60);
    setBreakBanner(false);
    setPhase("break");
  };

  const extendBreak = () => {
    setBreakRemaining((r) => r + 60);
    setBreakTotalSeconds((r) => r + 60);
  };

  const endSessionEarly = () => {
    const focusedSeconds = totalSeconds - remainingSeconds;
    const minutes = Math.round(focusedSeconds / 60);
    const stillHasTimeLeft = remainingSeconds > 0;
    setLastSavedMinutes(minutes);
    setLastEndedIncomplete(stillHasTimeLeft);
    persistSession({
      minutes,
      incomplete: stillHasTimeLeft,
      remainingSecondsLeft: remainingSeconds,
      totalMinutes: Math.round(totalSeconds / 60),
    });
    setPhase("completed");
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen();
    }
  };

  const reset = () => {
    setPhase("setup");
    setTitle("");
    setDurationMin("");
    setBreakRemaining(5 * 60);
    setBreakTotalSeconds(5 * 60);
    setSessionStartedAt(null);
    setBreakBanner(false);
    setActiveRecordId(null);
  };

  const deleteRecord = async (id: string, recordTitle: string) => {
    if (deletingId) return;
    if (!window.confirm(`Delete session “${recordTitle}”? This will remove it from synced history.`)) return;
    setDeletingId(id);
    const previous = history;
    setHistory((items) => items.filter((item) => item.id !== id));
    try {
      const res = await fetch(`/api/focus-sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete session");
    } catch {
      setHistory(previous);
      setHistorySync("error");
    } finally {
      setDeletingId(null);
    }
  };

  const shareRecord = async (rec: FocusSessionRecord) => {
    const blob = await generateShareCard({
      eyebrow: "Focus Session",
      title: rec.title,
      statLine: `${rec.durationMinutes} minutes focused · ${new Date(rec.completedAt).toLocaleDateString()}`,
      footer: "conflict-calendar",
      userName: session?.user?.name ?? undefined,
      level,
    });
    if (blob) {
      await shareOrDownload(
        blob,
        `${rec.title.replace(/\s+/g, "-").toLowerCase()}-session.png`,
        `I completed a ${rec.durationMinutes}-minute focus session: ${rec.title}`
      );
    }
  };

  const handleDownload = async () => {
    const blob = await generateShareCard({
      eyebrow: "Focus Session",
      title: title.trim() || "Focus Session",
      statLine: `${lastSavedMinutes} minutes focused`,
      footer: "conflict-calendar",
      userName: session?.user?.name ?? undefined,
      level,
    });
    if (blob) downloadBlob(blob, "focus-session.png");
  };

  const handleShare = async () => {
    const blob = await generateShareCard({
      eyebrow: "Focus Session",
      title: title.trim() || "Focus Session",
      statLine: `${lastSavedMinutes} minutes focused`,
      footer: "conflict-calendar",
      userName: session?.user?.name ?? undefined,
      level,
    });
    if (blob) {
      await shareOrDownload(blob, "focus-session.png", `I just completed a ${lastSavedMinutes}-minute focus session!`);
    }
  };

  const displayName = session?.user?.name ?? "Your profile";
  const profileImage = session?.user?.image ?? "";
  const totalHistoryMinutes = history.reduce((sum, s) => sum + s.durationMinutes, 0);

  if (phase === "setup") {
    return (
      <div className="focus-setup-shell">
        <div className="grid gap-2.5 lg:h-[min(470px,calc(100vh-250px))] lg:grid-cols-[minmax(0,1.02fr)_minmax(300px,0.78fr)]">
          <section className="min-h-0 rounded-2xl border-2 border-rule bg-paper p-3 md:p-3.5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">ZenSpace</p>
                <h2 className="mt-1 font-serif text-2xl font-semibold tracking-tight md:text-[2rem]">Focus Session</h2>
                <p className="mt-0.5 text-xs text-ink-soft">Stay consistent, build a better you.</p>
              </div>
              <span className="rounded-full border border-rule px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">Ready</span>
            </div>

            <div className="mt-3.5 grid gap-3 sm:grid-cols-[1.35fr_.65fr]">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Session title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Study DSA"
                  className="mt-1.5 w-full rounded-xl border-2 border-rule bg-transparent px-3.5 py-2.5 text-sm outline-none transition focus:border-accent"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Minutes</label>
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={durationMin}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setDurationMin(raw === "" ? "" : Math.min(480, Math.max(1, Number(raw))));
                  }}
                  placeholder="Minutes"
                  className="mt-1.5 w-full rounded-xl border-2 border-rule bg-transparent px-3.5 py-2.5 text-lg font-semibold outline-none transition focus:border-accent placeholder:text-ink-soft/55"
                />
              </div>
            </div>

            <div className="mt-3 rounded-2xl border-2 border-rule p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em]">Break</p>
                  <p className="mt-1 text-xs text-ink-soft">Starts at 5 min · +1 min whenever you need.</p>
                </div>
                <span className="rounded-xl border-2 border-rule px-3 py-1.5 text-sm font-semibold tabular-nums">5:00</span>
              </div>
            </div>

            <button
              onClick={start}
              disabled={!durationMin}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              <IconPlay className="h-4 w-4" /> Start Session
            </button>
          </section>

          <section className="flex min-h-0 flex-col rounded-2xl border-2 border-rule bg-paper p-3 md:p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">History</p>
                <h3 className="mt-1 font-serif text-xl font-semibold md:text-2xl">Your Sessions</h3>
              </div>
              <span className="rounded-full border border-rule px-2.5 py-1 text-[10px] uppercase tracking-widest text-ink-soft">{history.length}</span>
            </div>
            <p className="mt-1.5 text-xs text-ink-soft">{totalHistoryMinutes} minutes total · synced across devices</p>
            {historySync === "syncing" && <p className="mt-2 text-[10px] uppercase tracking-widest text-ink-soft">Syncing…</p>}

            <div className="history-list-scroll mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
              {history.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-rule p-6 text-center text-sm text-ink-soft">No sessions yet.</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((rec) => (
                    <li key={rec.id} className="flex items-center gap-2 rounded-xl border-2 border-rule bg-paper-raised p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{rec.title}</p>
                        <p className="mt-0.5 text-[11px] text-ink-soft">
                          {rec.durationMinutes} min · {new Date(rec.completedAt).toLocaleDateString()}
                          {rec.incomplete && <span className="ml-1.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Paused</span>}
                        </p>
                      </div>
                      {rec.incomplete && (
                        <button onClick={() => resumeRecord(rec)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-accent/50 text-accent transition hover:bg-accent hover:text-paper" aria-label="Resume session" title="Resume session"><IconPlay className="h-4 w-4" /></button>
                      )}
                      <button onClick={() => shareRecord(rec)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-rule text-ink-soft transition hover:border-accent hover:text-accent" aria-label="Share session" title="Share session"><IconShare className="h-5 w-5" /></button>
                      <button onClick={() => deleteRecord(rec.id, rec.title)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-rule text-ink-soft transition hover:border-red-500 hover:text-red-500" aria-label="Delete session" title="Delete session" disabled={deletingId === rec.id}><IconTrash className="h-5 w-5" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (phase === "completed") {
    return (
      <section className="rounded-3xl border border-rule bg-paper-raised p-5 md:p-7">
        <div className="grid gap-6 md:grid-cols-[0.75fr_1.25fr] md:items-center">
          <div className="rounded-2xl border border-rule bg-[#11100e] p-5 text-center text-white">
            <FocusStudyIllustration className="max-w-[420px] mx-auto" />
            <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-white/60">
              {lastEndedIncomplete ? "Progress Saved" : "Session Complete"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
              {lastEndedIncomplete ? "Paused" : "Well done"}
            </p>
            <h2 className="mt-1 font-serif text-4xl font-semibold">{title.trim() || "Focus Session"}</h2>
            <p className="mt-2 text-lg text-ink-soft">
              {lastEndedIncomplete
                ? `You focused for ${lastSavedMinutes} minute${lastSavedMinutes !== 1 ? "s" : ""} — saved to History. Resume anytime to pick up where you left off.`
                : `You focused for ${lastSavedMinutes} minute${lastSavedMinutes !== 1 ? "s" : ""}.`}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={handleDownload} className="flex items-center gap-2 rounded-xl border border-rule px-4 py-2.5 text-xs font-semibold uppercase tracking-widest transition hover:border-ink">
                <IconDownload className="h-4 w-4" /> Download
              </button>
              <button onClick={handleShare} className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-paper transition hover:bg-accent">
                <IconShare className="h-4 w-4" /> Share
              </button>
            </div>
            <button onClick={reset} className="mt-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-soft transition hover:text-accent">
              Start another session <IconArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  const isBreak = phase === "break";
  const countdownSeconds = isBreak ? breakRemaining : remainingSeconds;
  const countdownTotalSeconds = isBreak ? breakTotalSeconds : totalSeconds;
  const countdownProgress = countdownTotalSeconds > 0 ? countdownSeconds / countdownTotalSeconds : 0;
  const sessionStartLabel = sessionStartedAt ? formatClock(sessionStartedAt) : "--:--";
  const sessionEndLabel = sessionStartedAt
    ? formatClock(new Date(sessionStartedAt.getTime() + totalSeconds * 1000))
    : "--:--";

  return (
    <div ref={containerRef} className={`focus-active-shell ${isFullscreen ? "focus-fullscreen" : ""}`}>
      <div className={`focus-session-frame ${isFullscreen ? "focus-fullscreen-inner" : ""}`}>
        {breakBanner && phase === "focusing" && (
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm md:flex-row md:items-center md:justify-between">
            <span>Time for a coffee break or a short walk?</span>
            <div className="flex items-center gap-2">
              <button onClick={takeBreak} className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold uppercase tracking-widest text-paper">Take a break</button>
              <button onClick={() => setBreakBanner(false)} className="px-3 py-2 text-xs font-semibold uppercase tracking-widest text-ink-soft">Dismiss</button>
            </div>
          </div>
        )}

        <div className={isFullscreen ? "focus-fullscreen-stage" : "focus-session-stage"}>
          {!isFullscreen && (
            <header className="focus-session-mobile-header">
              <div className="focus-profile-mini">
                <div className="focus-profile-avatar">
                  {profileImage ? (
                    <Image src={profileImage} alt="" width={28} height={28} className="h-full w-full object-cover" />
                  ) : (
                    <IconProfile className="h-7 w-7" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="focus-profile-name">{displayName}</p>
                  <p className="focus-profile-level">Level {level} · Focus Builder</p>
                </div>
              </div>
              <button onClick={toggleFullscreen} className="focus-fullscreen-icon-button" title="Fullscreen" aria-label="Fullscreen">
                <IconExpand className="h-4 w-4" />
              </button>
            </header>
          )}

          {isFullscreen ? (
            <section className="focus-fullscreen-panel">
              <header className="focus-fullscreen-topbar">
                <div className="focus-profile-mini">
                  <div className="focus-profile-avatar">
                    {profileImage ? (
                      <Image src={profileImage} alt="" width={28} height={28} className="h-full w-full object-cover" />
                    ) : (
                      <IconProfile className="h-7 w-7" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="focus-profile-name">{displayName}</p>
                    <p className="focus-profile-level">Level {level} · Focus Builder</p>
                  </div>
                </div>
                <button onClick={toggleFullscreen} className="focus-fullscreen-icon-button" title="Exit fullscreen" aria-label="Exit fullscreen">
                  <IconCollapse className="h-4 w-4" />
                </button>
              </header>

              <div className="focus-fullscreen-grid">
                <div className="focus-fullscreen-copy">
                  <p className="focus-mode-eyebrow mobile-hero-eyebrow">{isBreak ? "BREAK TIME" : "FOCUS MODE"}<span aria-hidden="true" /></p>
                  <h1 className="mobile-hero-title">{title.trim() || "Focus Mode"}</h1>
                  <p className="focus-mode-subtitle mobile-hero-subtitle">Distraction fades. Progress stays.</p>
                  <p className="focus-live-datetime mobile-hero-datetime" aria-live="polite">
                    {currentTime.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" }).toUpperCase()} · {currentTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toUpperCase()}
                  </p>

                  <div className="focus-fullscreen-action-row mobile-hero-actions">
                    {isBreak ? (
                      <>
                        <button onClick={extendBreak} className="focus-control-button focus-control-button-secondary">+1 MINUTE</button>
                        <button onClick={() => setPhase("focusing")} className="focus-control-button focus-control-button-primary"><IconPlay className="h-4 w-4" /> RESUME FOCUS</button>
                      </>
                    ) : (
                      <>
                        <button onClick={pauseResume} className="focus-control-button focus-control-button-primary">
                          {phase === "focusing" ? <IconPause className="h-4 w-4" /> : <IconPlay className="h-4 w-4" />}
                          {phase === "focusing" ? "PAUSE" : "RESUME"}
                        </button>
                        <button onClick={takeBreak} className="focus-control-button focus-control-button-secondary">BREAK (5 MIN)</button>
                        <button onClick={toggleFullscreen} className="focus-control-button focus-control-button-secondary"><IconCollapse className="h-4 w-4" /> EXIT</button>
                      </>
                    )}
                  </div>

                  <blockquote className="focus-quote mobile-hero-quote">&ldquo;{quote}&rdquo;</blockquote>
                  <button onClick={endSessionEarly} className="focus-end-button mobile-hero-end">END SESSION &amp; SAVE PROGRESS</button>
                </div>

                <div className="focus-fullscreen-visual">
                  <div className="focus-fullscreen-art mobile-hero-art">
                    <FocusStudyIllustration running={phase !== "paused"} />
                  </div>
                  <p className="focus-visual-label mobile-timer-label">{isBreak ? "BREAK" : "FOCUS SESSION"}</p>
                  <div className="focus-countdown mobile-timer-countdown">{formatTime(countdownSeconds)}</div>
                  <div className="focus-progress-wrap mobile-timer-progress">
                    <div className="focus-progress-track">
                      <div className="focus-progress-fill" style={{ width: `${Math.min(100, Math.max(0, countdownProgress * 100))}%` }} />
                    </div>
                    <div className="focus-progress-meta">
                      <span>{isBreak ? "BREAK START" : sessionStartLabel}</span>
                      <span>{isBreak ? `${Math.round(breakTotalSeconds / 60)} MIN` : `${Math.max(1, Math.round(totalSeconds / 60))} MIN`}</span>
                      <span>{isBreak ? "RESUME" : sessionEndLabel}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="focus-session-dashboard">
              <div className="focus-session-dashboard-copy">
                <p className="focus-mode-eyebrow">{isBreak ? "BREAK TIME" : "FOCUS MODE"}<span aria-hidden="true" /></p>
                <h1>{title.trim() || "Focus Mode"}</h1>
                <p className="focus-mode-subtitle">Distraction fades. Progress stays.</p>
                <p className="focus-live-datetime" aria-live="polite">
                  {currentTime.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" }).toUpperCase()} · {currentTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toUpperCase()}
                </p>

                <div className="focus-session-dashboard-actions">
                  {isBreak ? (
                    <>
                      <button onClick={extendBreak} className="focus-control-button focus-control-button-secondary">+1 MINUTE</button>
                      <button onClick={() => setPhase("focusing")} className="focus-control-button focus-control-button-primary"><IconPlay className="h-4 w-4" /> RESUME FOCUS</button>
                    </>
                  ) : (
                    <>
                      <button onClick={pauseResume} className="focus-control-button focus-control-button-primary">
                        {phase === "focusing" ? <IconPause className="h-4 w-4" /> : <IconPlay className="h-4 w-4" />}
                        {phase === "focusing" ? "PAUSE" : "RESUME"}
                      </button>
                      <button onClick={takeBreak} className="focus-control-button focus-control-button-secondary">BREAK (5 MIN)</button>
                      <button onClick={toggleFullscreen} className="focus-control-button focus-control-button-secondary"><IconExpand className="h-4 w-4" /> FULLSCREEN</button>
                    </>
                  )}
                </div>

                <blockquote className="focus-quote">&ldquo;{quote}&rdquo;</blockquote>
                <button onClick={endSessionEarly} className="focus-end-button">END SESSION &amp; SAVE PROGRESS</button>
              </div>

              <div className="focus-session-dashboard-visual">
                <div className="focus-session-dashboard-art">
                  <FocusStudyIllustration running={phase !== "paused"} />
                </div>
                <p className="focus-visual-label">{isBreak ? "BREAK" : "FOCUS SESSION"}</p>
                <div className="focus-countdown">{formatTime(countdownSeconds)}</div>
                <div className="focus-progress-wrap">
                  <div className="focus-progress-track">
                    <div className="focus-progress-fill" style={{ width: `${Math.min(100, Math.max(0, countdownProgress * 100))}%` }} />
                  </div>
                  <div className="focus-progress-meta">
                    <span>{isBreak ? "BREAK START" : sessionStartLabel}</span>
                    <span>{isBreak ? `${Math.round(breakTotalSeconds / 60)} MIN` : `${Math.max(1, Math.round(totalSeconds / 60))} MIN`}</span>
                    <span>{isBreak ? "RESUME" : sessionEndLabel}</span>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );

}
