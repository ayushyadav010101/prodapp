export type DailyFlowIcon = "code" | "monitor" | "workout" | "book" | "calories" | "note" | "spark" | "target";
export const DAILY_FLOW_ICONS: DailyFlowIcon[] = ["code", "monitor", "workout", "book", "calories", "note", "spark", "target"];

export function isDailyFlowIcon(value: unknown): value is DailyFlowIcon {
  return typeof value === "string" && DAILY_FLOW_ICONS.includes(value as DailyFlowIcon);
}

export type DailyLogFlow = {
  id: string;
  name: string;
  icon: DailyFlowIcon;
  color: string;
  plan: string;
  order: number;
  archived?: boolean;
};

export type DailyLogEntry = {
  date: string;
  completedFlowIds: string[];
  notes: Record<string, string>;
  savedAt: string;
};

export const DAILY_LOG_LIST_TITLE = "Daily Log (Productivity App)";
export const DAILY_LOG_CONFIG_TITLE = "DAILY_LOG_CONFIG_V1";
export const DAILY_LOG_ENTRY_PREFIX = "DAILY_LOG_ENTRY::";
export const DAILY_LOG_CONFIG_PREFIX = "DAILY_LOG_CONFIG_V1::";
export const DAILY_LOG_ENTRY_NOTES_PREFIX = "DAILY_LOG_ENTRY_V1::";

export const DEFAULT_DAILY_FLOWS: DailyLogFlow[] = [
  { id: "flow-dsa", name: "DSA", icon: "code", color: "#ff8b52", plan: "Plan: revise arrays, solve 3 questions, watch intuition video...", order: 0 },
  { id: "flow-anime", name: "Anime / Movie", icon: "monitor", color: "#f05c78", plan: "Plan: watch 2 episodes, note key points, plan Saturday movie night...", order: 1 },
  { id: "flow-workout", name: "Workout", icon: "workout", color: "#35dc51", plan: "Plan: Gym - Chest + Triceps...", order: 2 },
  { id: "flow-skill", name: "Skill", icon: "book", color: "#168cff", plan: "Plan: Web Dev, React Hooks...", order: 3 },
  { id: "flow-calories", name: "Calories", icon: "calories", color: "#ff6374", plan: "Plan: hit 2079 / 2510, balanced meals...", order: 4 },
  { id: "flow-general-notes", name: "General Notes", icon: "note", color: "#f5c642", plan: "Plan: reflect on the day, plan tomorrow...", order: 5 },
];

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

export function encodeConfig(flows: DailyLogFlow[]): string {
  return DAILY_LOG_CONFIG_PREFIX + JSON.stringify({ version: 1, flows });
}

export function decodeConfig(notes?: string): DailyLogFlow[] | null {
  if (!notes?.startsWith(DAILY_LOG_CONFIG_PREFIX)) return null;
  try {
    const parsed = JSON.parse(notes.slice(DAILY_LOG_CONFIG_PREFIX.length)) as { flows?: unknown };
    if (!Array.isArray(parsed.flows)) return null;
    return parsed.flows.filter((flow): flow is DailyLogFlow => Boolean(
      flow && typeof flow === "object" &&
      typeof (flow as DailyLogFlow).id === "string" &&
      typeof (flow as DailyLogFlow).name === "string" &&
      typeof (flow as DailyLogFlow).plan === "string" &&
      typeof (flow as DailyLogFlow).color === "string" &&
      isDailyFlowIcon((flow as DailyLogFlow).icon)
    ));
  } catch {
    return null;
  }
}

export function encodeEntry(entry: DailyLogEntry): string {
  return DAILY_LOG_ENTRY_NOTES_PREFIX + JSON.stringify(entry);
}

export function decodeEntry(notes?: string): DailyLogEntry | null {
  if (!notes?.startsWith(DAILY_LOG_ENTRY_NOTES_PREFIX)) return null;
  try {
    const entry = JSON.parse(notes.slice(DAILY_LOG_ENTRY_NOTES_PREFIX.length)) as DailyLogEntry;
    if (!isDateKey(entry.date) || !Array.isArray(entry.completedFlowIds) || !entry.notes || typeof entry.notes !== "object") return null;
    return {
      date: entry.date,
      completedFlowIds: [...new Set(entry.completedFlowIds.filter((id) => typeof id === "string"))],
      notes: Object.fromEntries(Object.entries(entry.notes).filter(([, value]) => typeof value === "string")),
      savedAt: typeof entry.savedAt === "string" ? entry.savedAt : "",
    };
  } catch {
    return null;
  }
}

export function emptyDailyEntry(date: string): DailyLogEntry {
  return { date, completedFlowIds: [], notes: {}, savedAt: "" };
}
