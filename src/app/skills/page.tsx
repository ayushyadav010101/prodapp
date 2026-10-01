"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import {
  SkillChallenge,
  daysElapsed,
  daysRemaining,
  progressPercent,
  currentStreak,
  isCheckedInToday,
  toggleTodayCheckIn,
} from "@/lib/skills";
import { SyncStatus } from "@/components/SyncStatus";
import { IconTrash, IconPencil, IconShare, IconFocus, IconTrophy } from "@/components/icons";
import { FocusSession } from "@/components/FocusSession";
import { generateShareCard, shareOrDownload } from "@/lib/shareCard";
import { useLevel } from "@/lib/use-google-data";

const DURATIONS = [30, 60, 90] as const;

export default function SkillsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { level } = useLevel();
  const [tab, setTab] = useState<"session" | "challenge">("challenge");
  const [skills, setSkills] = useState<SkillChallenge[]>([]);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState<number>(30);
  const [customDays, setCustomDays] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [editSkillName, setEditSkillName] = useState("");
  const [editingSkillSavingId, setEditingSkillSavingId] = useState<string | null>(null);

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

  const addSkill = async () => {
    const finalDuration = useCustom ? Number(customDays) : duration;
    if (!name.trim() || saving || !finalDuration || finalDuration < 1) return;
    setSaving(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), durationDays: finalDuration }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create skill");
      setSkills((prev) => [data.skill, ...prev]);
      setName("");
      setDuration(30);
      setCustomDays("");
      setUseCustom(false);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create skill");
      setSyncState("error");
    } finally {
      setSaving(false);
    }
  };

  const startSkillEdit = (id: string, currentName: string) => {
    setEditingSkillId(id);
    setEditSkillName(currentName);
    setError(null);
  };

  const cancelSkillEdit = () => {
    setEditingSkillId(null);
    setEditSkillName("");
  };

  const saveSkillName = async (skill: SkillChallenge) => {
    const nextName = editSkillName.trim();
    if (!nextName || editingSkillSavingId) return;
    setEditingSkillSavingId(skill.id);
    setError(null);
    try {
      const res = await fetch(`/api/skills/${skill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to rename challenge");
      setSkills((cur) => cur.map((s) => (s.id === skill.id ? { ...s, name: nextName } : s)));
      cancelSkillEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't rename that challenge. Try again.");
      setSyncState("error");
    } finally {
      setEditingSkillSavingId(null);
    }
  };

  const removeSkill = async (id: string, name: string) => {
    if (!confirm(`Delete skill "${name}"? This cannot be undone.`)) return;
    const prev = skills;
    setSkills((cur) => cur.filter((s) => s.id !== id));
    try {
      const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    } catch {
      setSkills(prev);
      setError("Couldn't delete that skill. Try again.");
      setSyncState("error");
    }
  };

  const checkIn = async (skill: SkillChallenge) => {
    const updated = toggleTodayCheckIn(skill);
    setSkills((cur) => cur.map((s) => (s.id === skill.id ? updated : s)));
    try {
      const res = await fetch(`/api/skills/${skill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationDays: updated.durationDays,
          startDate: updated.startDate,
          completedDates: updated.completedDates,
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      setSkills((cur) => cur.map((s) => (s.id === skill.id ? skill : s)));
      setError("Couldn't save check-in. Try again.");
      setSyncState("error");
    }
  };

  const shareSkill = async (skill: SkillChallenge) => {
    const pct = progressPercent(skill);
    const blob = await generateShareCard({
      eyebrow: "ZenSpace Challenge",
      title: skill.name,
      statLine: `Day ${daysElapsed(skill) + 1} of ${skill.durationDays} · ${currentStreak(skill)} day streak`,
      progressPercent: pct,
      footer: "conflict-calendar",
      userName: session?.user?.name ?? undefined,
      level,
    });
    if (blob) {
      await shareOrDownload(
        blob,
        `${skill.name.replace(/\s+/g, "-").toLowerCase()}-progress.png`,
        `${skill.name}: ${pct.toFixed(2)}% complete on my ZenSpace challenge!`
      );
    }
  };

  if (sessionStatus === "unauthenticated") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="font-serif text-3xl font-semibold mb-4">ZenSpace</h1>
        <div className="border border-rule p-10 text-center">
          <p className="text-sm text-ink-soft mb-4">
            Sign in to track challenges and focus sessions that sync across your devices.
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
    <div className={`focus-skills-shell zen-tab-${tab} mx-auto w-full max-w-[1400px] px-3 sm:px-5 lg:px-8 py-4 sm:py-5`}>
      <header className="focus-skills-header">
        <div className="focus-skills-heading">
          <p className="focus-skills-eyebrow">Section Four</p>
          <h1>ZenSpace</h1>
          <p className="focus-skills-subtitle">Complete challenges, build streaks, and become a better you.</p>
        </div>
        <div className="focus-skills-header-actions">
          {tab === "challenge" && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="zen-new-challenge-button"
            >
              <span aria-hidden="true">+</span>
              {showForm ? "Cancel" : "New Challenge"}
            </button>
          )}
          {tab === "challenge" && <SyncStatus state={syncState} onRetry={refresh} />}
        </div>
      </header>

      <div className="flex gap-5 text-sm border-b border-rule mt-4 mb-4">
        {(["session", "challenge"] as const).map((t) => {
          const Icon = t === "session" ? IconFocus : IconTrophy;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 pb-3 border-b-2 font-bold transition-colors ${
                tab === t ? "border-accent text-ink" : "border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              <Icon className="w-5 h-5" />
              {t === "session" ? "Session" : "Challenge"}
            </button>
          );
        })}
      </div>

      {tab === "session" && <FocusSession />}

      {tab === "challenge" && (
        <section className="zen-challenge-section" aria-label="Challenges">
          {error && (
            <div className="border border-red-600/30 bg-red-600/5 p-4 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {showForm && (
            <div className="border border-rule p-5 space-y-4 bg-paper-raised">
              <div>
                <label className="text-xs uppercase tracking-widest text-ink-soft">
                  What skill are you learning?
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Guitar, Spanish, Cooking"
                  className="mt-1.5 w-full border border-rule bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-ink-soft">
                  Challenge length
                </label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        setDuration(d);
                        setUseCustom(false);
                      }}
                      className={`px-4 py-1.5 text-sm font-medium border transition-colors ${
                        !useCustom && duration === d
                          ? "bg-ink text-paper border-ink"
                          : "border-rule text-ink-soft hover:border-ink"
                      }`}
                    >
                      {d} days
                    </button>
                  ))}
                  <button
                    onClick={() => setUseCustom(true)}
                    className={`px-4 py-1.5 text-sm font-medium border transition-colors ${
                      useCustom
                        ? "bg-ink text-paper border-ink"
                        : "border-rule text-ink-soft hover:border-ink"
                    }`}
                  >
                    Custom
                  </button>
                </div>
                {useCustom && (
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    placeholder="Number of days"
                    className="mt-2 w-40 border border-rule bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                )}
              </div>
              <button
                onClick={addSkill}
                disabled={!name.trim() || saving || (useCustom && !customDays)}
                className="bg-ink text-paper text-sm font-medium px-4 py-2 hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Starting…" : "Start Challenge"}
              </button>
            </div>
          )}

          {syncState === "syncing" && skills.length === 0 && (
            <p className="text-sm text-ink-soft">Loading your skills…</p>
          )}

          {syncState !== "syncing" && skills.length === 0 && !showForm && (
            <div className="border border-dashed border-rule p-10 text-center text-sm text-ink-soft">
              No active skill challenges yet. Start one above.
            </div>
          )}

          <div className="zen-challenge-list">
            {skills.map((skill) => {
              const streak = currentStreak(skill);
              const checkedToday = isCheckedInToday(skill);
              const pct = progressPercent(skill);
              return (
                <article key={skill.id} className="zen-challenge-card">
                  <div className="zen-challenge-card-top">
                    <div className="zen-challenge-identity">
                      <div className="zen-challenge-icon" aria-hidden="true">
                        <IconTrophy className="w-7 h-7" />
                      </div>
                      <div className="zen-challenge-title-group min-w-0">
                        {editingSkillId === skill.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus
                              value={editSkillName}
                              onChange={(e) => setEditSkillName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveSkillName(skill);
                                if (e.key === "Escape") cancelSkillEdit();
                              }}
                              className="min-w-0 w-full border border-rule bg-transparent px-2 py-1 text-sm outline-none focus:border-accent"
                              aria-label="Edit challenge name"
                            />
                            <button
                              type="button"
                              onClick={() => saveSkillName(skill)}
                              disabled={!editSkillName.trim() || editingSkillSavingId === skill.id}
                              className="text-[10px] font-semibold uppercase tracking-wider text-accent disabled:opacity-40"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelSkillEdit}
                              disabled={editingSkillSavingId === skill.id}
                              className="text-[10px] text-ink-soft"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="truncate">{skill.name}</h3>
                            <button
                              type="button"
                              onClick={() => startSkillEdit(skill.id, skill.name)}
                              disabled={editingSkillSavingId === skill.id}
                              className="shrink-0 text-ink-soft/60 hover:text-accent transition-colors"
                              aria-label="Edit challenge name"
                            >
                              <IconPencil className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <p>
                          Day {daysElapsed(skill) + 1} of {skill.durationDays} · {daysRemaining(skill)} days left
                        </p>
                      </div>
                    </div>

                    <div className="zen-challenge-actions">
                      <button
                        onClick={() => shareSkill(skill)}
                        className="zen-challenge-icon-button"
                        aria-label="Share progress"
                      >
                        <IconShare className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => removeSkill(skill.id, skill.name)}
                        className="zen-challenge-icon-button"
                        aria-label="Delete skill"
                      >
                        <IconTrash className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="zen-challenge-progress-block">
                    <div className="zen-challenge-progress-meta">
                      <span>Progress</span>
                      <span className="tabular-nums">{pct.toFixed(2)}%</span>
                    </div>
                    <div className="zen-challenge-progress-track" aria-label={`Progress ${pct.toFixed(2)} percent`}>
                      <div
                        className="zen-challenge-progress-fill"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>

                  <div className="zen-challenge-card-bottom">
                    <div className="zen-challenge-streak">
                      <span className="zen-challenge-flame" aria-hidden="true">🔥</span>
                      <span className="zen-challenge-streak-number">{streak}</span>
                      <span>day streak</span>
                    </div>
                    <button
                      onClick={() => checkIn(skill)}
                      className={`zen-checkin-button ${checkedToday ? "is-done" : ""}`}
                    >
                      {checkedToday ? "✓ Done today" : "Check in"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
