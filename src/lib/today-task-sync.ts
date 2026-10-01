import {
  createTaskList,
  deleteTask,
  insertTask,
  listTaskLists,
  listTasks,
} from "@/lib/google-api";

export const TODAY_TASK_LOG_LIST_TITLE = "Today Task Log (Productivity App)";
export const TODAY_TASK_PREFIX = "TODAY_TASK::";

export function todayTaskKey(taskId: string, dateKey: string): string {
  return `${TODAY_TASK_PREFIX}${dateKey}::${taskId}`;
}

export function parseTodayTaskKey(value: string): { taskId: string; dateKey: string } | null {
  if (!value.startsWith(TODAY_TASK_PREFIX)) return null;
  const payload = value.slice(TODAY_TASK_PREFIX.length);
  const separator = payload.indexOf("::");
  if (separator <= 0) return null;
  const dateKey = payload.slice(0, separator);
  const taskId = payload.slice(separator + 2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !taskId) return null;
  return { taskId, dateKey };
}

export async function findTodayTaskLogList(accessToken: string) {
  const lists = await listTaskLists(accessToken);
  return lists.find((list) => list.title === TODAY_TASK_LOG_LIST_TITLE) ?? null;
}

export async function getOrCreateTodayTaskLogList(accessToken: string): Promise<string> {
  const existing = await findTodayTaskLogList(accessToken);
  if (existing) return existing.id;
  const created = await createTaskList(accessToken, TODAY_TASK_LOG_LIST_TITLE);
  return created.id;
}

export async function recordTodayTask(
  accessToken: string,
  taskId: string,
  dateKey: string
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("Invalid today-task date");
  }

  const listId = await getOrCreateTodayTaskLogList(accessToken);
  const tasks = await listTasks(accessToken, listId);
  const targetTitle = todayTaskKey(taskId, dateKey);
  if (tasks.some((task) => task.title === targetTitle)) return;

  await insertTask(accessToken, listId, {
    title: targetTitle,
    notes: `App-created My Tasks item ${taskId} for ${dateKey}`,
  });
}

export async function getTodayTaskIds(
  accessToken: string,
  dateKey: string
): Promise<string[]> {
  const list = await findTodayTaskLogList(accessToken);
  if (!list) return [];

  const tasks = await listTasks(accessToken, list.id);
  return tasks
    .map((task) => parseTodayTaskKey(task.title))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .filter((entry) => entry.dateKey === dateKey)
    .map((entry) => entry.taskId);
}

export async function removeTodayTaskRecord(
  accessToken: string,
  taskId: string
): Promise<void> {
  const list = await findTodayTaskLogList(accessToken);
  if (!list) return;

  const tasks = await listTasks(accessToken, list.id);
  const matches = tasks.filter((task) => {
    const parsed = parseTodayTaskKey(task.title);
    return parsed?.taskId === taskId;
  });

  await Promise.all(matches.map((task) => deleteTask(accessToken, list.id, task.id)));
}
