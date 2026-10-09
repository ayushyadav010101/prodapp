import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createTaskList,
  deleteTask,
  GoogleApiError,
  insertTask,
  listTaskLists,
  listTasks,
  patchTask,
} from "@/lib/google-api";
import {
  DAILY_LOG_CONFIG_TITLE,
  DAILY_LOG_ENTRY_PREFIX,
  DAILY_LOG_LIST_TITLE,
  DEFAULT_DAILY_FLOWS,
  decodeConfig,
  decodeEntry,
  encodeConfig,
  encodeEntry,
  isDateKey,
  isDailyFlowIcon,
  type DailyLogEntry,
  type DailyLogFlow,
} from "@/lib/daily-log";

async function getOrCreateDailyLogList(accessToken: string) {
  const lists = await listTaskLists(accessToken);
  const existing = lists.find((list) => list.title === DAILY_LOG_LIST_TITLE);
  return existing ?? createTaskList(accessToken, DAILY_LOG_LIST_TITLE);
}

async function readLog(accessToken: string) {
  const list = await getOrCreateDailyLogList(accessToken);
  const tasks = await listTasks(accessToken, list.id);
  let configTask = tasks.find((task) => task.title === DAILY_LOG_CONFIG_TITLE);
  let flows = configTask ? decodeConfig(configTask.notes) : null;
  if (!configTask) {
    configTask = await insertTask(accessToken, list.id, {
      title: DAILY_LOG_CONFIG_TITLE,
      notes: encodeConfig(DEFAULT_DAILY_FLOWS),
    });
    flows = DEFAULT_DAILY_FLOWS;
  } else if (!flows) {
    // A newly introduced feature has no config yet; seed templates only once.
    flows = DEFAULT_DAILY_FLOWS;
    await patchTask(accessToken, list.id, configTask.id, { notes: encodeConfig(flows) });
  }

  const entriesByDate = new Map<string, DailyLogEntry>();
  for (const task of tasks) {
    if (!task.title?.startsWith(DAILY_LOG_ENTRY_PREFIX)) continue;
    const entry = decodeEntry(task.notes);
    if (!entry) continue;
    const previous = entriesByDate.get(entry.date);
    if (!previous || entry.savedAt >= previous.savedAt) entriesByDate.set(entry.date, entry);
  }

  return {
    listId: list.id,
    configTaskId: configTask.id,
    flows: (flows ?? DEFAULT_DAILY_FLOWS).sort((a, b) => a.order - b.order),
    entries: [...entriesByDate.values()].sort((a, b) => b.date.localeCompare(a.date)),
    tasks,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Google session expired, please reconnect" }, { status: 401 });
  }

  try {
    const data = await readLog(session.accessToken);
    return NextResponse.json({ flows: data.flows, entries: data.entries });
  } catch (error) {
    if (error instanceof GoogleApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Daily Log GET failed", error);
    return NextResponse.json({ error: "Failed to load Daily Log" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json({ error: "Google session expired, please reconnect" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const data = await readLog(session.accessToken);
    if (body.action === "save-config") {
      if (!Array.isArray(body.flows) || body.flows.length > 12) {
        return NextResponse.json({ error: "Invalid flow configuration" }, { status: 400 });
      }
      const flows = (body.flows as DailyLogFlow[]).map((flow, index) => ({
        id: typeof flow?.id === "string" ? flow.id.slice(0, 100) : "",
        name: typeof flow?.name === "string" ? flow.name.trim().slice(0, 80) : "",
        icon: isDailyFlowIcon(flow?.icon) ? flow.icon : "note",
        color: typeof flow?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(flow.color) ? flow.color : "#ff8b52",
        plan: typeof flow?.plan === "string" ? flow.plan.slice(0, 350) : "",
        order: Number.isFinite(flow?.order) ? Number(flow.order) : index,
        ...(flow?.archived ? { archived: true } : {}),
      }));
      if (flows.some((flow) => !flow.id || !flow.name) || new Set(flows.map((flow) => flow.id)).size !== flows.length) {
        return NextResponse.json({ error: "Every flow needs a unique ID and name" }, { status: 400 });
      }
      await patchTask(session.accessToken, data.listId, data.configTaskId, { notes: encodeConfig(flows) });
      return NextResponse.json({ flows: flows.sort((a, b) => a.order - b.order) });
    }

    if (body.action === "save-entry") {
      const candidate = body.entry as Partial<DailyLogEntry> | undefined;
      if (!candidate || !isDateKey(candidate.date) || !Array.isArray(candidate.completedFlowIds) || !candidate.notes || typeof candidate.notes !== "object") {
        return NextResponse.json({ error: "Invalid daily entry" }, { status: 400 });
      }
      const entry: DailyLogEntry = {
        date: candidate.date,
        completedFlowIds: [...new Set(candidate.completedFlowIds.filter((id): id is string => typeof id === "string" && id.length < 120))],
        notes: Object.fromEntries(Object.entries(candidate.notes).filter(([, value]) => typeof value === "string").map(([key, value]) => [key, (value as string).slice(0, 500)])),
        savedAt: new Date().toISOString(),
      };
      const title = `${DAILY_LOG_ENTRY_PREFIX}${entry.date}`;
      const existing = data.tasks.filter((task) => task.title === title);
      if (existing.length) {
        await patchTask(session.accessToken, data.listId, existing[0].id, { notes: encodeEntry(entry), status: "needsAction" });
        for (const duplicate of existing.slice(1)) await deleteTask(session.accessToken, data.listId, duplicate.id);
      } else {
        await insertTask(session.accessToken, data.listId, { title, notes: encodeEntry(entry) });
      }
      return NextResponse.json({ entry });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    if (error instanceof GoogleApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Daily Log POST failed", error);
    return NextResponse.json({ error: "Failed to save Daily Log" }, { status: 500 });
  }
}
