"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSession, signIn } from "next-auth/react";
import { IconCalendar, IconCheck, IconChevronLeft, IconChevronRight, IconDailyLog, IconProfile } from "@/components/icons";
import { DAILY_FLOW_ICONS, DEFAULT_DAILY_FLOWS, emptyDailyEntry, isDateKey, type DailyFlowIcon, type DailyLogEntry, type DailyLogFlow } from "@/lib/daily-log";
import styles from "./DailyLog.module.css";

type FlowIconProps = { icon: DailyFlowIcon; className?: string };
function FlowIcon({ icon, className = "" }: FlowIconProps) {
  const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, className, "aria-hidden": true as const };
  if (icon === "code") return <svg {...base}><path d="m8 6-5 6 5 6M16 6l5 6-5 6M14 4l-4 16" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (icon === "monitor") return <svg {...base}><rect x="3" y="4" width="18" height="13" rx="1.8" /><path d="M8 21h8M12 17v4" strokeLinecap="round" /></svg>;
  if (icon === "workout") return <svg {...base}><path d="M4 9v6M7 6v12M17 6v12M20 9v6M7 12h10" strokeLinecap="round" /></svg>;
  if (icon === "book") return <svg {...base}><path d="M3.5 5.5A3 3 0 0 1 6.5 3H12v18H6.5a3 3 0 0 0-3 0zM20.5 5.5A3 3 0 0 0 17.5 3H12v18h5.5a3 3 0 0 1 3 0z" strokeLinejoin="round" /></svg>;
  if (icon === "calories") return <svg {...base}><path d="M7 3v7M4.5 3v4M9.5 3v4M7 7v14M17 3v18M17 3c-3 3-3 7 0 9" strokeLinecap="round" /></svg>;
  if (icon === "target") return <svg {...base}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>;
  if (icon === "spark") return <svg {...base}><path d="m12 2 1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-2.8z" strokeLinejoin="round" /></svg>;
  return <svg {...base}><path d="M5 3.5h10l4 4V21H5zM15 3.5V8h4M8 12h8M8 16h8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function parseDate(key: string) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d, 12); }
function formatDate(date: Date, options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" }) { return date.toLocaleDateString(undefined, options); }
function entryPreview(entry: DailyLogEntry, flows: DailyLogFlow[]) {
  const notes = Object.values(entry.notes).map((note) => note.trim()).filter(Boolean);
  if (notes.length) return notes.join(", ").replace(/\s+/g, " ");
  const completeNames = flows.filter((flow) => entry.completedFlowIds.includes(flow.id)).map((flow) => flow.name);
  return completeNames.length ? `${completeNames.join(", ")} completed` : "Daily entry saved";
}

export default function DailyLogPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const datePickerRef = useRef<HTMLInputElement>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [dateReady, setDateReady] = useState(false);
  const [flows, setFlows] = useState<DailyLogFlow[]>(DEFAULT_DAILY_FLOWS);
  const [entries, setEntries] = useState<DailyLogEntry[]>([]);
  const [draftEntry, setDraftEntry] = useState<DailyLogEntry>(() => emptyDailyEntry(dateKey(new Date())));
  const [loaded, setLoaded] = useState(false);
  const [loadingError, setLoadingError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [entryDirty, setEntryDirty] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [menuFlowId, setMenuFlowId] = useState<string | null>(null);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [draggedFlowId, setDraggedFlowId] = useState<string | null>(null);
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowPlan, setNewFlowPlan] = useState("");
  const [newFlowIcon, setNewFlowIcon] = useState<DailyFlowIcon>("spark");
  const [newFlowColor, setNewFlowColor] = useState("#ff8b52");

  const selectedKey = dateKey(selectedDate);
  const activeFlows = useMemo(() => flows.filter((flow) => !flow.archived).sort((a, b) => a.order - b.order), [flows]);
  const completed = useMemo(() => new Set(draftEntry.completedFlowIds), [draftEntry.completedFlowIds]);
  const completedCount = activeFlows.filter((flow) => completed.has(flow.id)).length;
  const avatarUrl = session?.user?.image ?? "";
  const avatarInitials = (session?.user?.name ?? "U").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const isToday = selectedKey === dateKey(new Date());

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("date");
    if (isDateKey(key)) setSelectedDate(parseDate(key));
    setDateReady(true);
  }, []);

  const loadDailyLog = useCallback(async () => {
    if (sessionStatus !== "authenticated" || !dateReady) return;
    setLoadingError("");
    try {
      const response = await fetch("/api/daily-log", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to load Daily Log");
      const nextFlows = Array.isArray(data.flows) ? data.flows as DailyLogFlow[] : DEFAULT_DAILY_FLOWS;
      const nextEntries = Array.isArray(data.entries) ? data.entries as DailyLogEntry[] : [];
      setFlows(nextFlows); setEntries(nextEntries);
      const queryKey = new URLSearchParams(window.location.search).get("date");
      const key = isDateKey(queryKey) ? queryKey : dateKey(new Date());
      setSelectedDate(parseDate(key));
      setDraftEntry(nextEntries.find((entry) => entry.date === key) ?? emptyDailyEntry(key));
      setEntryDirty(false); setConfigDirty(false); setLoaded(true);
    } catch (error) { setLoadingError(error instanceof Error ? error.message : "Could not load Daily Log"); }
  }, [sessionStatus, dateReady]);
  useEffect(() => { void loadDailyLog(); }, [loadDailyLog]);

  const persistConfig = useCallback(async (nextFlows: DailyLogFlow[]) => {
    const response = await fetch("/api/daily-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-config", flows: nextFlows }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Failed to save flow configuration");
    setFlows(data.flows as DailyLogFlow[]); setConfigDirty(false);
  }, []);

  const persistEntry = useCallback(async (key: string, entry: DailyLogEntry) => {
    const response = await fetch("/api/daily-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-entry", entry: { ...entry, date: key } }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Failed to save entry");
    const saved = data.entry as DailyLogEntry;
    setEntries((current) => [saved, ...current.filter((old) => old.date !== key)].sort((a, b) => b.date.localeCompare(a.date)));
    if (dateKey(selectedDate) === key) setDraftEntry(saved);
    setEntryDirty(false); return saved;
  }, [selectedDate]);

  const saveEntry = async () => {
    setSaving(true); setNotice("");
    try { if (configDirty) await persistConfig(flows); await persistEntry(selectedKey, draftEntry); setNotice("Entry saved to your Google account."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not save entry"); }
    finally { setSaving(false); }
  };

  const changeDate = async (nextDate: Date) => {
    if (saving) return;
    if (Number.isNaN(nextDate.getTime())) { setNotice("Choose a valid date."); return; }
    const nextKey = dateKey(nextDate); if (nextKey === selectedKey) return;
    if (entryDirty) {
      setSaving(true);
      try { await persistEntry(selectedKey, draftEntry); }
      catch (error) { setNotice(error instanceof Error ? error.message : "Save the current entry before changing dates."); setSaving(false); return; }
      setSaving(false);
    }
    setSelectedDate(nextDate);
    setDraftEntry(entries.find((entry) => entry.date === nextKey) ?? emptyDailyEntry(nextKey));
    setEntryDirty(false); setNotice(""); router.replace(`/daily-log?date=${nextKey}`, { scroll: false });
  };

  const updateNote = (flowId: string, value: string) => { setDraftEntry((entry) => ({ ...entry, notes: { ...entry.notes, [flowId]: value } })); setEntryDirty(true); setNotice(""); };
  const toggleCompletion = (flowId: string) => {
    setDraftEntry((entry) => { const ids = new Set(entry.completedFlowIds); if (ids.has(flowId)) ids.delete(flowId); else ids.add(flowId); return { ...entry, completedFlowIds: [...ids] }; });
    setEntryDirty(true); setNotice("");
  };
  const updateFlow = (flowId: string, patch: Partial<DailyLogFlow>) => { setFlows((current) => current.map((flow) => flow.id === flowId ? { ...flow, ...patch } : flow)); setConfigDirty(true); };
  const saveFlowConfig = async (nextFlows = flows) => {
    // Keep a retryable dirty state unless the server confirms persistence.
    // This also covers add/rename/reorder/archive/icon changes, not just plans.
    setConfigDirty(true); setSaving(true); setNotice("");
    try { await persistConfig(nextFlows); setNotice("Flow settings saved."); }
    catch (error) { setConfigDirty(true); const detail = error instanceof Error ? error.message : "Could not save flow settings"; setNotice(`${detail}. Your changes remain in this page; retry with Save Entry.`); }
    finally { setSaving(false); }
  };
  const renameFlow = async (flowId: string) => {
    const name = renameValue.trim(); if (!name) { setEditingFlowId(null); return; }
    const nextFlows = flows.map((flow) => flow.id === flowId ? { ...flow, name } : flow);
    setFlows(nextFlows); setEditingFlowId(null); setMenuFlowId(null); await saveFlowConfig(nextFlows);
  };
  const cycleIcon = async (flow: DailyLogFlow) => {
    const icons = DAILY_FLOW_ICONS;
    const palette = ["#ff8b52", "#f05c78", "#35dc51", "#168cff", "#ff6374", "#f5c642", "#bd86ff", "#55c8dc"];
    const nextIndex = (icons.indexOf(flow.icon) + 1) % icons.length;
    const nextFlows = flows.map((item) => item.id === flow.id ? { ...item, icon: icons[nextIndex], color: palette[nextIndex] } : item);
    setFlows(nextFlows); setMenuFlowId(null); await saveFlowConfig(nextFlows);
  };
  const archiveFlow = async (flow: DailyLogFlow) => {
    if (!window.confirm(`Remove “${flow.name}” from your active Daily Log? Historical entries will be preserved.`)) return;
    const nextFlows = flows.map((item) => item.id === flow.id ? { ...item, archived: true } : item);
    setFlows(nextFlows); setMenuFlowId(null); await saveFlowConfig(nextFlows);
  };
  const addFlow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const name = newFlowName.trim(); if (!name) return;
    const flow: DailyLogFlow = { id: `flow-${crypto.randomUUID()}`, name, icon: newFlowIcon, color: newFlowColor, plan: newFlowPlan.trim(), order: flows.length };
    const nextFlows = [...flows, flow]; setFlows(nextFlows); setShowAddFlow(false); setNewFlowName(""); setNewFlowPlan(""); await saveFlowConfig(nextFlows);
  };
  const reorderFlow = async (targetId: string) => {
    if (!draggedFlowId || draggedFlowId === targetId) return;
    const ordered = [...activeFlows]; const from = ordered.findIndex((flow) => flow.id === draggedFlowId); const to = ordered.findIndex((flow) => flow.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1); ordered.splice(to, 0, moved);
    const orderMap = new Map(ordered.map((flow, index) => [flow.id, index]));
    const nextFlows = flows.map((flow) => ({ ...flow, order: orderMap.get(flow.id) ?? flow.order }));
    setFlows(nextFlows); setDraggedFlowId(null); await saveFlowConfig(nextFlows);
  };
  const goToday = () => void changeDate(new Date());
  const previousDay = () => void changeDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 1, 12));
  const nextDay = () => void changeDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1, 12));

  if (sessionStatus === "unauthenticated") return <div className={styles.centerState}><p>Connect your Google account to save Daily Log entries across devices.</p><button type="button" onClick={() => signIn("google")} className={styles.primaryButton}>Connect Google Account</button></div>;

  return <div className={styles.page}>
    <header className={styles.pageHeader}>
      <div className={styles.pageHeading}><p className={styles.eyebrow}>☀ Daily Log</p><h1>Daily Log</h1><p className={styles.subtitle}>Track your daily activities. Add your own flows, mark them complete, and write notes.</p></div>
      <div className={styles.headerActions}>
        <div className={styles.dateNav}><button type="button" aria-label="Previous day" disabled={saving} onClick={previousDay}><IconChevronLeft className={styles.tinyIcon} /></button><div role="button" tabIndex={0} className={styles.dateDisplay} onClick={() => { const picker = datePickerRef.current; if (!picker) return; try { if (typeof picker.showPicker === "function") { picker.showPicker(); return; } } catch { /* Fall back if the browser blocks showPicker(). */ } picker.click(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); const picker = datePickerRef.current; if (!picker) return; try { if (typeof picker.showPicker === "function") { picker.showPicker(); return; } } catch { /* Fall back if the browser blocks showPicker(). */ } picker.click(); } }}><IconCalendar className={styles.tinyIcon} /><span>{formatDate(selectedDate)}</span><input ref={datePickerRef} type="date" value={selectedKey} onChange={(event) => { if (event.target.value) void changeDate(parseDate(event.target.value)); }} aria-label="Choose selected date" /></div><button type="button" aria-label="Next day" disabled={saving} onClick={nextDay}><IconChevronRight className={styles.tinyIcon} /></button></div>
        <button type="button" className={styles.primaryButton} onClick={saveEntry} disabled={saving || !loaded}><IconDailyLog className={styles.actionIcon} /> {saving ? "Saving…" : "Save Entry"}</button>
        <div className={styles.overflowWrap}><button type="button" className={styles.overflowButton} aria-label="More Daily Log actions" aria-expanded={showOverflow} disabled={saving} onClick={() => setShowOverflow((value) => !value)}>⋮</button>{showOverflow && <div className={styles.overflowMenu}><button type="button" disabled={saving} onClick={() => { setShowOverflow(false); goToday(); }}>Go to today</button><button type="button" disabled={saving} onClick={() => { setShowOverflow(false); router.push("/daily-log/history"); }}>View saved history</button><button type="button" disabled={saving} onClick={() => { setShowOverflow(false); const blob = new Blob([JSON.stringify({ flows, entries }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "daily-log-backup.json"; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download backup</button></div>}</div>
      </div>
    </header>
    {loadingError && <div className={styles.errorNotice} role="alert">{loadingError}<button type="button" onClick={() => void loadDailyLog()}>Retry</button></div>}
    {notice && <div className={styles.notice} role="status">{notice}</div>}

    <div className={styles.dashboardGrid}>
      <div className={styles.mainColumn}>
        <section className={styles.introCard}>
          <div className={styles.avatar}>{avatarUrl ? <img src={avatarUrl} alt={`${session?.user?.name ?? "User"} profile`} referrerPolicy="no-referrer" /> : <span>{avatarInitials || <IconProfile className={styles.avatarFallback} />}</span>}</div>
          <div className={styles.introText}><p className={styles.orangeLabel}>{isToday ? "Today" : "Selected date"}</p><h2>{formatDate(selectedDate)}</h2><p>"Small steps every day lead to big results."</p></div>
          <button type="button" className={styles.addFlowButton} disabled={saving} onClick={() => setShowAddFlow(true)}><span>＋</span> Add Flow</button>
        </section>

        <section className={styles.flowSection} aria-label="Daily flows">
          <div className={`${styles.tableHeader} ${styles.flowGrid}`}><span aria-label="Drag handle column">#</span><span>Flow</span><span className={styles.planHeading}>Plan</span><span className={styles.centerHeading}>Today</span><span>My Notes</span><span /></div>
          {!loaded ? <div className={styles.loadingState}>Loading your saved flows…</div> : activeFlows.length === 0 ? <div className={styles.emptyState}>No active flows yet. Add a flow to start tracking your day.</div> : activeFlows.map((flow) => <div className={`${styles.flowRow} ${flow.id === "flow-dsa" || flow.id === "flow-anime" ? styles.flowRowTall : ""} ${styles.flowGrid}`} key={flow.id} id={`flow-${flow.id}`} onDragOver={(event) => event.preventDefault()} onDrop={() => void reorderFlow(flow.id)}>
            <div className={styles.dragCell}><button type="button" aria-label={`Drag to reorder ${flow.name}`} draggable={!saving} disabled={saving} onDragStart={() => setDraggedFlowId(flow.id)} onDragEnd={() => setDraggedFlowId(null)} className={styles.dragHandle}>⠿</button></div>
            <div className={styles.flowIdentity}><span className={styles.flowIcon} style={{ color: flow.color, backgroundColor: `${flow.color}20` }}><FlowIcon icon={flow.icon} /></span>{editingFlowId === flow.id ? <form className={styles.renameForm} onSubmit={(event) => { event.preventDefault(); void renameFlow(flow.id); }}><input value={renameValue} autoFocus disabled={saving} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditingFlowId(null); }} aria-label="Flow name" /><button type="submit" disabled={saving}>Save</button></form> : <span className={styles.flowName}>{flow.name}</span>}</div>
            <div className={styles.planCell}><textarea rows={flow.id === "flow-dsa" || flow.id === "flow-anime" ? 2 : 1} aria-label={`${flow.name} persistent plan`} disabled={saving} value={flow.plan} maxLength={350} placeholder="Plan for this flow…" onChange={(event) => updateFlow(flow.id, { plan: event.target.value })} onBlur={() => { if (configDirty) void saveFlowConfig(); }} /></div>
            <div className={styles.todayCell}><input type="checkbox" aria-label={`Mark ${flow.name} complete for ${formatDate(selectedDate)}`} disabled={saving} checked={completed.has(flow.id)} onChange={() => toggleCompletion(flow.id)} /></div>
            <div className={styles.notesCell}><textarea rows={1} aria-label={`${flow.name} notes for ${formatDate(selectedDate)}`} disabled={saving} value={draftEntry.notes[flow.id] ?? ""} maxLength={500} placeholder={flow.id === "flow-general-notes" ? "What went good today? What can improve?" : `e.g. ${flow.name === "DSA" ? "Arrays, Sorting, 5 questions…" : flow.name === "Anime / Movie" ? "One Piece Ep 100–102…" : flow.name === "Workout" ? "Gym - Chest + Triceps" : flow.name === "Skill" ? "Web Dev, React Hooks…" : flow.name === "Calories" ? "2079 / 2510, Meals…" : "Add today's notes…"}`} onChange={(event) => updateNote(flow.id, event.target.value)} /></div>
            <div className={styles.actionCell}><button type="button" aria-label={`Actions for ${flow.name}`} className={styles.rowAction} disabled={saving} onClick={() => setMenuFlowId((current) => current === flow.id ? null : flow.id)}>⋮</button>{menuFlowId === flow.id && <div className={styles.rowMenu}><button type="button" disabled={saving} onClick={() => { setEditingFlowId(flow.id); setRenameValue(flow.name); setMenuFlowId(null); }}>Rename flow</button><button type="button" disabled={saving} onClick={() => void cycleIcon(flow)}>Change icon/color</button><button type="button" disabled={saving} className={styles.dangerAction} onClick={() => void archiveFlow(flow)}>Delete flow</button></div>}</div>
          </div>)}
          <button type="button" className={styles.addNewFlow} disabled={saving} onClick={() => setShowAddFlow(true)}><span>＋</span> Add New Flow</button>
        </section>
      </div>

      <aside className={styles.rightSidebar}>
        <section className={styles.sideCard}>
          <div className={styles.sideCardHeader}><h2>Today&apos;s Progress</h2><span>{completedCount} / {activeFlows.length} completed</span></div>
          <div className={styles.progressList}>{activeFlows.map((flow) => { const done = completed.has(flow.id); return <button type="button" key={flow.id} className={styles.progressItem} onClick={() => document.getElementById(`flow-${flow.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}><span className={styles.progressIcon} style={{ color: flow.color, backgroundColor: `${flow.color}20` }}><FlowIcon icon={flow.icon} /></span><span className={styles.progressName}>{flow.name}</span><span className={`${styles.progressCheckbox} ${done ? styles.progressCheckboxDone : ""}`}>{done && <IconCheck className={styles.checkIcon} />}</span><span className={styles.progressArrow}>›</span></button>; })}</div>
          <div className={styles.progressFooter}><span style={{ width: `${activeFlows.length ? (completedCount / activeFlows.length) * 100 : 0}%` }} /></div>
        </section>
        <section className={styles.sideCard}>
          <div className={styles.sideCardHeader}><h2>Recent Entries</h2><Link href="/daily-log/history" className={styles.orangeLink}>View All</Link></div>
          {entries.slice(0, 5).length ? <div className={styles.recentList}>{entries.slice(0, 5).map((entry) => <button type="button" key={entry.date} onClick={() => void changeDate(parseDate(entry.date))} className={styles.recentEntry}><IconDailyLog className={styles.actionIcon} /><span><strong>{formatDate(parseDate(entry.date), { day: "numeric", month: "short", year: "numeric" })}</strong><small>{entryPreview(entry, flows)}</small></span><IconChevronRight className={styles.tinyIcon} /></button>)}</div> : <div className={styles.sideEmpty}>Your saved daily entries appear here. Use <strong>Save Entry</strong> to start your history.</div>}
        </section>
      </aside>
    </div>

    {showAddFlow && <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddFlow(false); }}><form className={styles.addFlowModal} onSubmit={addFlow}>
      <div className={styles.modalHeader}><h2>Add New Flow</h2><button type="button" aria-label="Close" onClick={() => setShowAddFlow(false)}>×</button></div>
      <label>Flow name<input value={newFlowName} onChange={(event) => setNewFlowName(event.target.value)} autoFocus maxLength={80} required placeholder="e.g. Reading" /></label>
      <label>Persistent plan<textarea value={newFlowPlan} onChange={(event) => setNewFlowPlan(event.target.value)} rows={2} placeholder="What do you want to do in this flow?" /></label>
      <div className={styles.modalTwoCol}><label>Icon<select value={newFlowIcon} onChange={(event) => setNewFlowIcon(event.target.value as DailyFlowIcon)}>{(["code", "monitor", "workout", "book", "calories", "note", "spark", "target"] as DailyFlowIcon[]).map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select></label><label>Color<select value={newFlowColor} onChange={(event) => setNewFlowColor(event.target.value)}><option value="#ff8b52">Orange</option><option value="#f05c78">Pink</option><option value="#35dc51">Green</option><option value="#168cff">Blue</option><option value="#f5c642">Gold</option><option value="#bd86ff">Purple</option></select></label></div>
      <div className={styles.modalActions}><button type="button" className={styles.secondaryButton} onClick={() => setShowAddFlow(false)}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? "Saving…" : "Add Flow"}</button></div>
    </form></div>}
  </div>;
}
