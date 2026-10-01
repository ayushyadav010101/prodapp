import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  deleteTask,
  GoogleApiError,
  insertTask,
  listTasks,
} from "@/lib/google-api";
import {
  eventCheckInKey,
  parseEventCheckInKey,
} from "@/lib/event-checkins";
import { getOrCreateEventCheckInsList } from "@/lib/event-checkins-sync";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const taskListId = await getOrCreateEventCheckInsList(session.accessToken);
    const tasks = await listTasks(session.accessToken, taskListId);
    const keys = tasks
      .map((task) => parseEventCheckInKey(task.title))
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .map(({ eventId, dateKey }) => eventCheckInKey(eventId, dateKey));

    return NextResponse.json({ keys });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to load event check-ins" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as {
    eventId?: unknown;
    dateKey?: unknown;
    checked?: unknown;
  } | null;

  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const dateKey = typeof body?.dateKey === "string" ? body.dateKey : "";
  const checked = body?.checked === true;

  if (!eventId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return NextResponse.json({ error: "Invalid event check-in data" }, { status: 400 });
  }

  try {
    const taskListId = await getOrCreateEventCheckInsList(session.accessToken);
    const tasks = await listTasks(session.accessToken, taskListId);
    const targetTitle = eventCheckInKey(eventId, dateKey);
    const existing = tasks.find((task) => task.title === targetTitle);

    if (checked) {
      if (!existing) {
        await insertTask(session.accessToken, taskListId, {
          title: targetTitle,
          notes: `Event check-in for ${eventId} on ${dateKey}`,
        });
      }
      return NextResponse.json({ checked: true });
    }

    if (existing) {
      await deleteTask(session.accessToken, taskListId, existing.id);
    }
    return NextResponse.json({ checked: false });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update event check-in" }, { status: 500 });
  }
}
