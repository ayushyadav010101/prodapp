import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { patchTask, deleteTask, GoogleApiError } from "@/lib/google-api";
import { removeTodayTaskRecord } from "@/lib/today-task-sync";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const { taskListId, status, title } = await req.json();

  if (!taskListId || (typeof status !== "string" && typeof title !== "string")) {
    return NextResponse.json({ error: "Missing taskListId or update field" }, { status: 400 });
  }

  const patch: { status?: "needsAction" | "completed"; title?: string } = {};
  if (typeof status === "string") patch.status = status as "needsAction" | "completed";
  if (typeof title === "string" && title.trim()) patch.title = title.trim();
  if (!patch.status && !patch.title) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const updated = await patchTask(session.accessToken, taskListId, id, patch);
    return NextResponse.json({ task: updated });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const taskListId = req.nextUrl.searchParams.get("taskListId");
  if (!taskListId) {
    return NextResponse.json({ error: "Missing taskListId" }, { status: 400 });
  }

  try {
    await deleteTask(session.accessToken, taskListId, id);
    try {
      await removeTodayTaskRecord(session.accessToken, id);
    } catch (err) {
      // The Google task is already deleted; cleanup of the auxiliary log is
      // best-effort so the user does not see a false deletion failure.
      console.error("Failed to remove today-task log", err);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
