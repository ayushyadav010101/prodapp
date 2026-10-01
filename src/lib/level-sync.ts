import { listTaskLists, createTaskList } from "@/lib/google-api";

export const LEVEL_LOG_LIST_TITLE = "Level Log (Productivity App)";

export async function getOrCreateLevelLogList(accessToken: string): Promise<string> {
  const lists = await listTaskLists(accessToken);
  const existing = lists.find((l) => l.title === LEVEL_LOG_LIST_TITLE);
  if (existing) return existing.id;
  const created = await createTaskList(accessToken, LEVEL_LOG_LIST_TITLE);
  return created.id;
}
