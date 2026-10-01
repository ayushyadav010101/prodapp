import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteEvent, patchEvent, GoogleApiError } from "@/lib/google-api";
import { removeEventCheckIns } from "@/lib/event-checkins-sync";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const calendarId = req.nextUrl.searchParams.get("calendarId") ?? "primary";
  const { summary } = await req.json();

  if (typeof summary !== "string" || !summary.trim()) {
    return NextResponse.json({ error: "Missing event title" }, { status: 400 });
  }

  try {
    const event = await patchEvent(session.accessToken, calendarId, id, { summary: summary.trim() });
    return NextResponse.json({ event });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
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
  const calendarId = req.nextUrl.searchParams.get("calendarId") ?? "primary";

  try {
    await deleteEvent(session.accessToken, calendarId, id);
    await removeEventCheckIns(session.accessToken, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
