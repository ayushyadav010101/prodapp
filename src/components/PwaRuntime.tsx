"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  notificationsSupported,
  notificationsEnabled,
  checkUpcomingEvents,
  checkOverdueTasks,
} from "@/lib/notifications";

const CHECK_INTERVAL_MS = 60 * 1000; // once a minute is enough for a 10-min-ahead reminder

export function PwaRuntime() {
  const { status } = useSession();

  // Register the service worker once, regardless of notification permission —
  // this is what makes the app installable.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* installability just won't be available; not fatal */
      });
    }
  }, []);

  // Periodic notification checks, only while signed in and enabled.
  useEffect(() => {
    if (status !== "authenticated" || !notificationsSupported()) return;

    const runChecks = async () => {
      if (!notificationsEnabled()) return;
      try {
        const [eventsRes, tasksRes] = await Promise.all([
          fetch("/api/events"),
          fetch("/api/tasks"),
        ]);
        const [eventsData, tasksData] = await Promise.all([
          eventsRes.json(),
          tasksRes.json(),
        ]);
        if (eventsRes.ok) checkUpcomingEvents(eventsData.events ?? []);
        if (tasksRes.ok) checkOverdueTasks(tasksData.tasks ?? []);
      } catch {
        // Silent — notification checks should never surface errors to the user.
      }
    };

    runChecks();
    const interval = setInterval(runChecks, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status]);

  return null;
}
