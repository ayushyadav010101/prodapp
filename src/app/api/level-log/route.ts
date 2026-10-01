import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listTasks, insertTask, GoogleApiError } from "@/lib/google-api";
import { getOrCreateLevelLogList } from "@/lib/level-sync";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const taskListId = await getOrCreateLevelLogList(session.accessToken);
    const tasks = await listTasks(session.accessToken, taskListId);
    // Each task's title IS the logged day (e.g. "Wed Sep 25 2026").
    const days = tasks.map((t) => t.title).filter(Boolean);
    return NextResponse.json({ days });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to load level log" }, { status: 500 });
  }
}

// Adds one or more day-keys to the permanent log. Safe to call repeatedly —
// only days not already present get created, so the log never duplicates
// and the resulting Level can only ever grow, never shrink.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { days } = await req.json();
  if (!Array.isArray(days) || days.length === 0) {
    return NextResponse.json({ error: "Invalid days" }, { status: 400 });
  }

  try {
    const taskListId = await getOrCreateLevelLogList(session.accessToken);
    const existing = await listTasks(session.accessToken, taskListId);
    const existingSet = new Set(existing.map((t) => t.title));

    const toAdd = [...new Set(days as string[])].filter((d) => !existingSet.has(d));
    for (const day of toAdd) {
      await insertTask(session.accessToken, taskListId, { title: day });
    }

    return NextResponse.json({ added: toAdd.length });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update level log" }, { status: 500 });
  }
}
