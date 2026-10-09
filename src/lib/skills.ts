"use client";

export interface SkillChallenge {
  id: string;
  name: string;
  durationDays: number;
  startDate: string; // ISO date string
  completedDates: string[]; // array of "YYYY-MM-DD" strings the user checked in
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysElapsed(skill: SkillChallenge): number {
  const start = new Date(skill.startDate);
  const now = new Date();
  const diff = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return Math.max(0, diff);
}

export function daysRemaining(skill: SkillChallenge): number {
  // Day count is one-based (the start date is Day 1), so remaining days are
  // measured after the current challenge day to avoid an off-by-one display.
  const currentDay = daysElapsed(skill) + 1;
  return Math.max(0, skill.durationDays - currentDay);
}

// Unique valid check-in dates are the single source of truth for both the
// displayed check-in count and the progress percentage.
export function completedCheckInDays(skill: SkillChallenge): number {
  return new Set(
    (Array.isArray(skill.completedDates) ? skill.completedDates : []).filter(
      (date): date is string =>
        typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date),
    ),
  ).size;
}

// Progress = unique check-in days / total challenge days * 100.
// Keep the percentage bounded and stable at two decimal places.
export function progressPercent(skill: SkillChallenge): number {
  const totalDays = Number.isFinite(skill.durationDays)
    ? Math.floor(skill.durationDays)
    : 0;
  if (totalDays <= 0) return 0;

  const raw = (completedCheckInDays(skill) / totalDays) * 100;
  return Math.min(100, Math.max(0, Math.round(raw * 100) / 100));
}

// Current streak = consecutive days (ending today or yesterday) checked in.
export function currentStreak(skill: SkillChallenge): number {
  const done = new Set(skill.completedDates);
  let streak = 0;
  const cursor = new Date();

  // If today isn't checked in yet, the streak still counts up through yesterday.
  if (!done.has(todayKey())) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (done.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function isCheckedInToday(skill: SkillChallenge): boolean {
  return skill.completedDates.includes(todayKey());
}

export function toggleTodayCheckIn(skill: SkillChallenge): SkillChallenge {
  const key = todayKey();
  const has = skill.completedDates.includes(key);
  return {
    ...skill,
    completedDates: has
      ? skill.completedDates.filter((d) => d !== key)
      : [...skill.completedDates, key],
  };
}
