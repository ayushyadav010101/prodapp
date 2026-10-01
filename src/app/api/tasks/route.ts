import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { localDateKey } from "@/lib/event-checkins";
import { listTaskLists, listTasks, insertTask, GoogleApiError } from "@/lib/google-api";
import { SKILLS_LIST_TITLE } from "@/lib/skills-sync";
import { LEVEL_LOG_LIST_TITLE } from "@/lib/level-sync";
import { EVENT_CHECKIN_LIST_TITLE } from "@/lib/event-checkins";
import {
  TODAY_TASK_LOG_LIST_TITLE,
  getTodayTaskIds,
  recordTodayTask,
} from "@/lib/today-task-sync";

export async function GET() {
  const session = await auth();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json(
      { error: "Google session expired, please reconnect" },
      { status: 401 }
    );
  }

  try {
    const allLists = await listTaskLists(session.accessToken);
    // The Skill Challenges list is internal to the Skills feature — don't
    // surface it as a regular task category here.
    const taskLists = allLists.filter(
      (l) =>
        l.title !== SKILLS_LIST_TITLE &&
        l.title !== LEVEL_LOG_LIST_TITLE &&
        l.title !== EVENT_CHECKIN_LIST_TITLE &&
        l.title !== TODAY_TASK_LOG_LIST_TITLE
    );

    const tasksByList = await Promise.all(
      taskLists.map((list) =>
        listTasks(session.accessToken!, list.id).catch((err) => {
          console.error(`Failed to fetch tasks for list ${list.id}`, err);
          return [];
        })
      )
    );

    const tasks = tasksByList.flat();
    let todayTaskIds: string[] = [];
    try {
      todayTaskIds = await getTodayTaskIds(session.accessToken, localDateKey(new Date()));
    } catch (err) {
      console.error("Failed to load today-task log", err);
    }

    return NextResponse.json({ taskLists, tasks, todayTaskIds });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status }
      );
    }
    console.error(err);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

// Creates a new task. Defaults to the user's first (default) Google Tasks
// list unless a taskListId is specified — writes go straight to Google.
export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { title, due, taskListId, todayDateKey } = await req.json();
  if (!title) {
    return NextResponse.json({ error: "Missing task title" }, { status: 400 });
  }

  try {
    const lists = await listTaskLists(session.accessToken);
    let listId = taskListId;
    if (!listId) {
      listId = lists[0]?.id;
      if (!listId) {
        return NextResponse.json({ error: "No task list found" }, { status: 400 });
      }
    }

    const created = await insertTask(session.accessToken, listId, {
      title,
      ...(due ? { due } : {}),
    });

    // The first Google Task list is the user's default "My Tasks" list in
    // this app. Tasks created there through this UI are today's tasks for
    // Today Progress, without requiring a Google Tasks due date.
    const isDefaultList = listId === lists[0]?.id;
    const validTodayDate =
      typeof todayDateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(todayDateKey)
        ? todayDateKey
        : null;
    let isTodayTask = false;
    if (isDefaultList && validTodayDate) {
      try {
        await recordTodayTask(session.accessToken, created.id, validTodayDate);
        isTodayTask = true;
      } catch (err) {
        // The user task was already created successfully. Keep that success
        // visible even if the optional Today Progress log cannot be written.
        console.error("Failed to record today task", err);
      }
    }

    return NextResponse.json({
      task: { ...created, taskListId: listId },
      isTodayTask,
    });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
