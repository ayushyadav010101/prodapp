import { createTaskList, deleteTask, listTaskLists, listTasks } from "@/lib/google-api";
import { EVENT_CHECKIN_LIST_TITLE, parseEventCheckInKey } from "@/lib/event-checkins";

export async function getOrCreateEventCheckInsList(accessToken: string): Promise<string> {
  const lists = await listTaskLists(accessToken);
  const existing = lists.find((list) => list.title === EVENT_CHECKIN_LIST_TITLE);
  if (existing) return existing.id;
  const created = await createTaskList(accessToken, EVENT_CHECKIN_LIST_TITLE);
  return created.id;
}

export async function removeEventCheckIns(accessToken: string, eventId: string): Promise<void> {
  try {
    const taskListId = await getOrCreateEventCheckInsList(accessToken);
    const tasks = await listTasks(accessToken, taskListId);
    const matching = tasks.filter((task) => parseEventCheckInKey(task.title)?.eventId === eventId);
    await Promise.all(matching.map((task) => deleteTask(accessToken, taskListId, task.id)));
  } catch {
    // Event deletion should never fail only because its optional check-in
    // history cannot be cleaned up.
  }
}
