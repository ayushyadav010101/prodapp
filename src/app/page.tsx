"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import {
  IconArrowRight,
  IconCalendar,
  IconProfile,
  IconSettings,
  IconTasks,
  IconTrophy,
} from "@/components/icons";
import {
  useCalendarData,
  useTasksData,
  useSkillsData,
  useLevelFromData,
} from "@/lib/use-google-data";

const HOME_QUOTE =
  "One day, you'll realize that every dream you had died because you chose comfort over effort, and there will be no one to blame but yourself. That regret will haunt you forever.";

function getGreeting() {
  const hour = new Date().getHours();
  return hour < 5 ? "Night" : hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : hour < 21 ? "Evening" : "Night";
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const { events, error: calError, refresh: refreshEvents } = useCalendarData();
  const { tasks, error: taskError, refresh: refreshTasks } = useTasksData();
  const { skills } = useSkillsData();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  const today = new Date();
  const todayKey = today.toDateString();
  const todayIso = today.toISOString().slice(0, 10);
  const dateStr = today.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const todaysEventCount = useMemo(
    () =>
      events.filter((e) => {
        const raw = e.start?.dateTime ?? e.start?.date;
        if (!raw) return false;
        return new Date(e.start?.date ? `${e.start.date}T00:00:00` : raw).toDateString() === todayKey;
      }).length,
    [events, todayKey]
  );

  const pendingTaskCount = useMemo(
    () => tasks.filter((t) => t.status !== "completed").length,
    [tasks]
  );

  // Home shows how many challenge records the user has, not only challenges
  // whose date window happens to include today. Completed/expired challenges
  // still belong to the user's challenge history.
  const challengeCount = skills.length;

  const completedTasksToday = tasks.filter(
    (t) => t.status === "completed" && t.completed && new Date(t.completed).toDateString() === todayKey
  ).length;
  const completedChallengesToday = skills.filter((s) => s.completedDates.includes(todayIso)).length;
  // Uses the already-fetched data above (no duplicate network calls), merged
  // with the permanent Level Log so the level can never drop.
  const { level } = useLevelFromData(events, tasks, skills);

  if (status === "unauthenticated") {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium mb-3">Front Page</p>
        <h1 className="font-serif text-4xl font-semibold leading-tight">Your day, in order.</h1>
        <p className="text-sm text-ink-soft mt-4 leading-relaxed">
          Sign in once, and this page keeps itself current — real events, real tasks, no fake placeholders, ever.
        </p>
        <button onClick={() => signIn("google")} className="mt-6 inline-flex items-center gap-2 bg-ink text-paper text-sm font-medium px-5 py-2.5 hover:bg-accent transition-colors rounded-full">
          Connect Google Account →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-5 md:px-6 py-3 sm:py-5 md:py-5 pb-20 md:pb-5">
      <div className={`grid gap-3 md:gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(290px,0.8fr)] transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
        <section className="rounded-2xl sm:rounded-[1.9rem] border border-rule bg-paper-raised p-4 sm:p-5 md:p-6 md:h-[430px] flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-5 min-w-0">
              <div className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl sm:rounded-[1.2rem] bg-[#efe6cf] text-ink flex items-center justify-center shrink-0 border border-rule shadow-sm overflow-hidden">
                <IconProfile className="w-[3.2rem] h-[3.2rem] sm:w-[4.5rem] sm:h-[4.5rem] md:w-20 md:h-20" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[11px] uppercase tracking-[0.18em] text-accent font-semibold">Profile</p>
                <h1 className="font-serif text-xl sm:text-2xl md:text-4xl font-semibold truncate mt-0.5 sm:mt-1">
                  {getGreeting()}, {session?.user?.name?.split(" ")[0] ?? "there"}
                </h1>
                <p className="text-sm sm:text-base text-ink-soft mt-1 sm:mt-1.5">{dateStr}</p>
              </div>
            </div>
            <Link href="/settings" aria-label="Settings" className="w-7 h-7 sm:w-9 sm:h-9 md:w-11 md:h-11 rounded-full border border-rule flex items-center justify-center hover:border-ink transition-colors shrink-0">
              <IconSettings className="w-3.5 h-3.5 md:w-5 md:h-5" />
            </Link>
          </div>

          <div className="mt-4 pt-4 sm:mt-5 sm:pt-5 border-t border-rule flex items-end justify-between gap-5">
            <div>
              <p className="text-[9px] sm:text-[11px] uppercase tracking-[0.2em] text-ink-soft font-semibold">Current level</p>
              <div className="flex items-baseline gap-2 sm:gap-3 mt-0.5 sm:mt-1">
                <p className="font-serif text-5xl sm:text-6xl md:text-7xl font-bold leading-none tabular-nums">{level}</p>
                <span className="text-xs sm:text-sm md:text-base text-ink-soft">one level per active day</span>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-1 gap-3 sm:gap-3 md:gap-4">
          <HomeCountCard
            href="/calendar"
            icon={<IconCalendar className="w-6 h-6 sm:w-7 sm:h-7" />}
            label="Today events"
            count={todaysEventCount}
            noun={todaysEventCount === 1 ? "event" : "events"}
          />
          <HomeCountCard
            href="/tasks"
            icon={<IconTasks className="w-6 h-6 sm:w-7 sm:h-7" />}
            label="Tasks"
            count={pendingTaskCount}
            noun={pendingTaskCount === 1 ? "task" : "tasks"}
          />
          <HomeCountCard
            href="/skills"
            icon={<IconTrophy className="w-6 h-6 sm:w-7 sm:h-7" />}
            label="Challenges"
            count={challengeCount}
            noun={challengeCount === 1 ? "challenge" : "challenges"}
          />
        </div>
      </div>

      {session?.error === "RefreshAccessTokenError" && (
        <div className="mt-4 rounded-2xl border border-red-600/30 bg-red-600/5 p-4">
          <p className="text-sm text-red-700 dark:text-red-400">Your Google session expired. Please reconnect.</p>
          <button onClick={() => signIn("google")} className="mt-3 bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-red-700">Reconnect</button>
        </div>
      )}

      {(calError || taskError) && (
        <div className="mt-4 rounded-2xl border border-red-600/30 bg-red-600/5 p-4">
          <p className="text-sm text-red-700 dark:text-red-400">{calError ?? taskError}</p>
          <button onClick={() => { refreshEvents(); refreshTasks(); }} className="mt-2 text-xs underline text-red-700 dark:text-red-400">Retry</button>
        </div>
      )}

      <section className="mt-3 md:mt-4 rounded-2xl sm:rounded-[1.9rem] border border-rule bg-paper-raised overflow-hidden">
        <div className="px-4 sm:px-5 md:px-6 py-4 sm:py-4 md:py-5 flex items-center gap-3 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-rule flex items-center justify-center shrink-0">
            <span className="text-accent text-lg sm:text-xl">“</span>
          </div>
          <div>
            <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.16em] sm:tracking-[0.2em] text-ink-soft font-semibold">Today&apos;s reminder</p>
            <blockquote className="font-serif text-sm sm:text-lg md:text-xl leading-snug mt-1 sm:mt-1 line-clamp-3 sm:line-clamp-none">
              “{HOME_QUOTE}”
            </blockquote>
          </div>
        </div>
        <div className="hidden sm:flex px-4 sm:px-5 md:px-6 pb-3.5 sm:pb-4 text-[10px] sm:text-xs text-ink-soft flex-wrap gap-x-4 gap-y-1.5">
          <span>{completedTasksToday} task{completedTasksToday === 1 ? "" : "s"} completed today</span>
          <span>{completedChallengesToday} challenge check-in{completedChallengesToday === 1 ? "" : "s"}</span>
        </div>
      </section>
    </div>
  );
}

function HomeCountCard({
  href,
  icon,
  label,
  count,
  noun,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  count: number;
  noun: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl sm:rounded-[1.65rem] border border-rule bg-paper-raised p-4 sm:p-4 md:p-5 flex items-center justify-between gap-2 sm:gap-3 min-h-[72px] sm:min-h-[96px] md:h-[calc((430px-32px)/3)] hover:border-ink transition-colors"
    >
      <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
        <div className="text-accent shrink-0">{icon}</div>
        <div className="min-w-0 flex items-baseline gap-1.5 sm:block">
          <p className="text-[11px] sm:text-[11px] md:text-xs uppercase tracking-[0.14em] sm:tracking-[0.18em] text-ink-soft font-semibold sm:mb-0">{label}</p>
          <p className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold leading-none sm:mt-1 tabular-nums">{count}</p>
          <p className="hidden sm:block text-xs sm:text-sm text-ink-soft mt-1">{noun}</p>
        </div>
      </div>
      <IconArrowRight className="w-5 h-5 sm:w-5 sm:h-5 md:w-6 md:h-6 shrink-0 text-ink-soft group-hover:text-ink transition-colors" />
    </Link>
  );
}
