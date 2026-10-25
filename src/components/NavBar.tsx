"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "./ThemeProvider";
import {
  IconHome,
  IconCalendar,
  IconTasks,
  IconSkills,
  IconDailyLog,
  IconAnalytics,
  IconSettings,
} from "./icons";

const NAV_ITEMS = [
  { href: "/", label: "Home", Icon: IconHome },
  { href: "/calendar", label: "Calendar", Icon: IconCalendar },
  { href: "/tasks", label: "Tasks", Icon: IconTasks },
  { href: "/skills", label: "ZenSpace", Icon: IconSkills },
  { href: "/daily-log", label: "Daily Log", Icon: IconDailyLog },
  { href: "/analytics", label: "Analytics", Icon: IconAnalytics },
  { href: "/settings", label: "Settings", Icon: IconSettings },
];

// Keep the mobile bottom bar readable: core sections plus the new Daily Log.
// Analytics and Settings remain available in the desktop sidebar and from links.
// The remaining destinations live in the "More" drawer so every page is reachable on phones.
const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.href !== "/analytics" && item.href !== "/settings");

function IconMenu({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" className={className} aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
}

export function NavBar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  // The drawer is tied to the path it was opened on, so any navigation closes it without an effect.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const setDrawerOpen = (open: boolean) => setDrawerPath(open ? pathname : null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const moreActive = pathname === "/analytics" || pathname === "/settings" || pathname.startsWith("/analytics/") || pathname.startsWith("/settings/");

  // Modal behaviour: lock background scroll, Escape closes, Tab stays inside, focus returns to trigger.
  useEffect(() => {
    if (!drawerOpen) return;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () => Array.from(drawerRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
    focusables()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setDrawerPath(null); return; }
      if (event.key !== "Tab") return;
      const items = focusables(); if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = previousOverflow; trigger?.focus(); };
  }, [drawerOpen]);

  return (
    <>
      {/* Desktop masthead sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-[220px] md:shrink-0 md:border-r md:border-rule md:py-8 md:px-4">
        <div className="mb-10">
          <p className="font-serif text-[28px] font-semibold tracking-tight text-ink lowercase">
            conflict<span className="text-accent">-calendar</span>
          </p>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="mt-3 text-xs uppercase tracking-widest text-ink-soft hover:text-accent transition-colors"
          >
            {theme === "light" ? "☾ Dark mode" : "☀ Light mode"}
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 text-sm uppercase tracking-widest py-2 border-l-2 pl-3 transition-colors ${
                  active
                    ? "border-accent text-ink font-medium"
                    : "border-transparent text-ink-soft hover:text-ink hover:border-rule"
                }`}
              >
                <item.Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav — full-width, square edges, always dark regardless of theme */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20">
        <ul className="flex items-stretch justify-between bg-nav-bg text-nav-fg px-1">
          {MOBILE_NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={`flex flex-col items-center gap-1 py-3.5 transition-colors ${
                    active ? "text-accent" : "text-nav-fg/60"
                  }`}
                >
                  <item.Icon className="w-6 h-6" />
                  <span className="text-[9px] uppercase tracking-wide font-medium whitespace-nowrap">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              aria-label="More navigation"
              className={`w-full flex flex-col items-center gap-1 py-3.5 transition-colors focus-visible:outline-2 focus-visible:outline-accent ${moreActive ? "text-accent" : "text-nav-fg/60"}`}
            >
              <IconMenu className="w-6 h-6" />
              <span className="text-[9px] uppercase tracking-wide font-medium whitespace-nowrap">More</span>
            </button>
          </li>
        </ul>
      </nav>

      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40" role="presentation">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <div ref={drawerRef} role="dialog" aria-modal="true" aria-label="Site navigation" className="absolute inset-y-0 left-0 w-[min(82vw,300px)] bg-paper-raised border-r border-rule px-4 py-6 flex flex-col overflow-y-auto">
            <div className="flex items-start justify-between mb-8">
              <p className="font-serif text-[24px] font-semibold tracking-tight text-ink lowercase">conflict<span className="text-accent">-calendar</span></p>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close navigation" className="w-9 h-9 -mr-2 text-2xl leading-none text-ink-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-accent">×</button>
            </div>
            <nav aria-label="All pages" className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                    className={`flex items-center gap-2.5 text-sm uppercase tracking-widest min-h-11 border-l-2 pl-3 transition-colors focus-visible:outline-2 focus-visible:outline-accent ${active ? "border-accent text-ink font-medium" : "border-transparent text-ink-soft hover:text-ink hover:border-rule"}`}
                  >
                    <item.Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <button onClick={toggle} aria-label="Toggle theme" className="mt-8 text-left text-xs uppercase tracking-widest text-ink-soft hover:text-accent transition-colors min-h-11">
              {theme === "light" ? "☾ Dark mode" : "☀ Light mode"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
