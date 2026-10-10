"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import {
  SkillChallenge,
  daysElapsed,
  daysRemaining,
  progressPercent,
  completedCheckInDays,
  currentStreak,
  isCheckedInToday,
  toggleTodayCheckIn,
} from "@/lib/skills";
import { SyncStatus } from "@/components/SyncStatus";
import {
  IconCalendar,
  IconCheckCircle,
  IconHourglass,
  IconPencil,
  IconShare,
  IconTrash,
} from "@/components/icons";
import { generateShareCard, shareOrDownload } from "@/lib/shareCard";
import { useLevel } from "@/lib/use-google-data";

const DURATIONS = [30, 60, 90] as const;

export default function SkillsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { level } = useLevel();
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
      if (!res.ok) throw new Error(data.error ?? "Failed to load challenges");
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
      if (!res.ok) throw new Error(data.error ?? "Failed to create challenge");
      setSkills((prev) => [data.skill, ...prev]);
      setName("");
      setDuration(30);
      setCustomDays("");
      setUseCustom(false);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create challenge");
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

  const removeSkill = async (id: string, skillName: string) => {
    if (!confirm(`Delete challenge "${skillName}"? This cannot be undone.`)) return;
    const prev = skills;
    setSkills((cur) => cur.filter((s) => s.id !== id));
    try {
      const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    } catch {
      setSkills(prev);
      setError("Couldn't delete that challenge. Try again.");
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
      avatarUrl: session?.user?.image ?? undefined,
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
        <div className="border border-rule p-10 text-center rounded-2xl bg-paper-raised">
          <p className="text-sm text-ink-soft mb-4">Sign in to track challenges that sync across your devices.</p>
          <button
            onClick={() => signIn("google")}
            className="bg-ink text-paper text-sm font-medium px-5 py-2.5 hover:bg-accent transition-colors rounded-xl"
          >
            Connect Google Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="zen-space-shell mx-auto w-full max-w-[1400px] px-3 sm:px-5 lg:px-8 py-4 sm:py-5">
      <header className="zen-space-header">
        <div className="zen-space-heading">
          <p className="zen-space-eyebrow">Section Four</p>
          <h1>ZenSpace</h1>
          <p className="zen-space-subtitle">Complete challenges, build streaks, and become a better you.</p>
        </div>
        <div className="zen-space-header-actions">
          <button onClick={() => setShowForm((v) => !v)} className="zen-new-challenge-button">
            <span aria-hidden="true">+</span>
            {showForm ? "Cancel" : "New Challenge"}
          </button>
          <SyncStatus state={syncState} onRetry={refresh} />
        </div>
      </header>

      <section className="zen-challenge-section" aria-label="Challenges">
        {error && (
          <div className="zen-feedback-error" role="alert">
            {error}
          </div>
        )}

        {showForm && (
          <div className="zen-challenge-form">
            <div>
              <label className="zen-form-label" htmlFor="challenge-name">Challenge name</label>
              <input
                id="challenge-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Java, DSA, Spanish"
                className="zen-form-input"
              />
            </div>
            <div>
              <label className="zen-form-label">Challenge length</label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      setDuration(d);
                      setUseCustom(false);
                    }}
                    className={`zen-duration-button ${!useCustom && duration === d ? "is-selected" : ""}`}
                  >
                    {d} days
                  </button>
                ))}
                <button
                  onClick={() => setUseCustom(true)}
                  className={`zen-duration-button ${useCustom ? "is-selected" : ""}`}
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
                  className="zen-form-input zen-days-input"
                />
              )}
            </div>
            <button
              onClick={addSkill}
              disabled={!name.trim() || saving || (useCustom && !customDays)}
              className="zen-submit-button"
            >
              {saving ? "Starting…" : "Start Challenge"}
            </button>
          </div>
        )}

        {syncState === "syncing" && skills.length === 0 && (
          <p className="text-sm text-ink-soft">Loading your challenges…</p>
        )}

        {syncState !== "syncing" && skills.length === 0 && !showForm && (
          <div className="zen-empty-state">
            No active challenges yet. Start one above.
          </div>
        )}

        <div className="zen-challenge-list">
          {skills.map((skill) => {
            const streak = currentStreak(skill);
            const checkedToday = isCheckedInToday(skill);
            const pct = progressPercent(skill);
            const currentDay = daysElapsed(skill) + 1;
            const completedDays = completedCheckInDays(skill);
            const remainingDays = daysRemaining(skill);
            return (
              <article key={skill.id} className="zen-challenge-card">
                <div className="zen-challenge-left-column">
                  <div className="zen-challenge-identity">
                    <div className="zen-challenge-icon" aria-hidden="true">
                      {session?.user?.image ? (
                        <img src={session.user.image} alt="" className="h-full w-full object-cover rounded-[inherit]" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-sm font-semibold" aria-hidden="true">{session?.user?.name?.slice(0, 1)?.toUpperCase() ?? "U"}</span>
                      )}
                    </div>
                    <div className="zen-challenge-title-group min-w-0">
                      {editingSkillId === skill.id ? (
                        <div className="zen-title-editor flex items-center gap-2 min-w-0">
                          <input
                            autoFocus
                            value={editSkillName}
                            onChange={(e) => setEditSkillName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveSkillName(skill);
                              if (e.key === "Escape") cancelSkillEdit();
                            }}
                            className="zen-edit-input"
                            aria-label="Edit challenge name"
                          />
                          <button
                            type="button"
                            onClick={() => saveSkillName(skill)}
                            disabled={!editSkillName.trim() || editingSkillSavingId === skill.id}
                            className="zen-inline-save"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelSkillEdit}
                            disabled={editingSkillSavingId === skill.id}
                            className="zen-inline-cancel"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="zen-title-display flex items-center gap-2 min-w-0">
                          <h3 className="truncate">{skill.name}</h3>
                          <button
                            type="button"
                            onClick={() => startSkillEdit(skill.id, skill.name)}
                            disabled={editingSkillSavingId === skill.id}
                            className="edit-title-button"
                            aria-label="Edit challenge name"
                            title="Edit challenge name"
                          >
                            <IconPencil className="w-[18px] h-[18px]" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="zen-challenge-streak">
                    <span className="zen-challenge-flame" aria-hidden="true">🔥</span>
                    <span className="zen-challenge-streak-number">{streak}</span>
                    <span>day streak</span>
                  </div>

                  <div className="zen-challenge-progress-block">
                    <div className="zen-challenge-progress-meta">
                      <span>Progress</span>
                      <span className="tabular-nums">{pct.toFixed(2)}%</span>
                    </div>
                    <div className="zen-challenge-progress-track" aria-label={`Progress ${pct.toFixed(2)} percent`}>
                      <div className="zen-challenge-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>

                <div className="zen-challenge-middle-column">
                  <div className="zen-challenge-metrics" aria-label="Challenge statistics">
                    <div className="zen-challenge-metric">
                      <IconCalendar className="zen-challenge-metric-icon" />
                      <span>Day <strong>{currentDay}</strong> of {skill.durationDays}</span>
                    </div>
                    <div className="zen-challenge-metric">
                      <IconCheckCircle className="zen-challenge-metric-icon" />
                      <span>Check-ins: <strong>{completedDays}</strong> / {skill.durationDays} days</span>
                    </div>
                    <div className="zen-challenge-metric">
                      <IconHourglass className="zen-challenge-metric-icon" />
                      <span><strong>{remainingDays}</strong> days left</span>
                    </div>
                  </div>
                  <button
                    onClick={() => checkIn(skill)}
                    className={`zen-checkin-button ${checkedToday ? "is-done" : ""}`}
                  >
                    {checkedToday ? "✓ Done today" : "Check in"}
                  </button>
                </div>

                <div className="zen-challenge-actions" aria-label="Challenge actions">
                  <button
                    type="button"
                    onClick={() => startSkillEdit(skill.id, skill.name)}
                    disabled={editingSkillSavingId === skill.id}
                    className="zen-mobile-edit-button zen-challenge-icon-button"
                    aria-label="Edit challenge name"
                    title="Edit challenge name"
                    style={{ visibility: editingSkillId === skill.id ? "hidden" : "visible" }}
                  >
                    <IconPencil className="w-5 h-5" />
                  </button>
                  <button type="button" onClick={() => shareSkill(skill)} className="zen-challenge-icon-button" aria-label="Share progress" title="Share progress">
                    <IconShare className="w-5 h-5" />
                  </button>
                  <button type="button" onClick={() => removeSkill(skill.id, skill.name)} className="zen-challenge-icon-button" aria-label="Delete challenge" title="Delete challenge">
                    <IconTrash className="w-5 h-5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
