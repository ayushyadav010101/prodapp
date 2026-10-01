import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { patchTask, deleteTask, GoogleApiError } from "@/lib/google-api";
import { getOrCreateSkillsList, encodeSkillNotes } from "@/lib/skills-sync";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const { durationDays, startDate, completedDates, name } = await req.json();

  const hasMetaPatch = durationDays !== undefined && startDate !== undefined && completedDates !== undefined;
  const hasNamePatch = typeof name === "string" && name.trim().length > 0;
  if (!hasMetaPatch && !hasNamePatch) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const taskListId = await getOrCreateSkillsList(session.accessToken);
    const taskPatch: { title?: string; notes?: string } = {};
    if (hasNamePatch) taskPatch.title = name.trim();
    if (hasMetaPatch) {
      taskPatch.notes = encodeSkillNotes({ durationDays, startDate, completedDates });
    }
    const task = await patchTask(session.accessToken, taskListId, id, taskPatch);
    return NextResponse.json({ ok: true, task });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update skill" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const taskListId = await getOrCreateSkillsList(session.accessToken);
    await deleteTask(session.accessToken, taskListId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 });
  }
}
