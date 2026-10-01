"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useLevel, useTasksData } from "@/lib/use-google-data";
import { SyncStatus } from "@/components/SyncStatus";
import {
  IconShare,
  IconTrash,
  IconPencil,
  IconTasks,
  IconGraduationCap,
  IconBriefcase,
  IconFolder,
  IconStar,
  IconChevronDown,
} from "@/components/icons";
import { generateShareCard, shareOrDownload } from "@/lib/shareCard";

// Deterministic icon per category, based on the category name — so a
// category always gets the same icon across renders/devices without
// needing to store an extra field for it.
const CATEGORY_ICONS = [IconTasks, IconGraduationCap, IconBriefcase, IconFolder, IconStar];
function categoryIcon(title: string) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return CATEGORY_ICONS[hash % CATEGORY_ICONS.length];
}

export default function TasksPage() {
  const { status: sessionStatus, data: session } = useSession();
  const { tasks, taskLists, syncState, error, refresh } = useTasksData();
  const { level } = useLevel();
  const [addingToList, setAddingToList] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState("");
  const [editingTaskSavingId, setEditingTaskSavingId] = useState<string | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // On mobile, the first category starts expanded and the rest collapsed.
  // Desktop always shows every category in full (handled purely via CSS),
  // so this state only matters below the md breakpoint.
  useEffect(() => {
    if (taskLists.length === 0) return;
    setExpanded((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const next: Record<string, boolean> = {};
      taskLists.forEach((list, i) => {
        next[list.id] = i === 0;
      });
      return next;
    });
  }, [taskLists]);

  const toggleExpanded = (listId: string) => {
    setExpanded((prev) => ({ ...prev, [listId]: !prev[listId] }));
  };

  const addTask = async (taskListId: string) => {
    if (!newTaskTitle.trim() || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTaskTitle.trim(), taskListId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create task");
      setNewTaskTitle("");
      setAddingToList(null);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    if (!categoryName.trim() || savingCategory) return;
    setSavingCategory(true);
    setFormError(null);
    try {
      const res = await fetch("/api/tasklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: categoryName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create category");
      setCategoryName("");
      setShowCategoryForm(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setSavingCategory(false);
    }
  };

  const toggleTask = async (taskId: string, taskListId: string, currentStatus: string) => {
    setPendingIds((prev) => new Set(prev).add(taskId));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskListId,
          status: currentStatus === "completed" ? "needsAction" : "completed",
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      refresh();
    } catch {
      setFormError("Couldn't update that task. Try again.");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const deleteCategory = async (listId: string, listTitle: string) => {
    if (!confirm(`Delete category "${listTitle}" and all its tasks? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/tasklists/${listId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete category");
      refresh();
    } catch {
      setFormError("Couldn't delete that category. Try again.");
    }
  };

  const shareCategory = async (listId: string, listTitle: string) => {
    const listTasks = tasks.filter((t) => t.taskListId === listId);
    const completed = listTasks.filter((t) => t.status === "completed").length;
    const percent = listTasks.length ? (completed / listTasks.length) * 100 : 0;
    const blob = await generateShareCard({
      eyebrow: "Task Category",
      title: listTitle,
      statLine: `${listTasks.length} task${listTasks.length === 1 ? "" : "s"} · ${completed} completed`,
      progressPercent: percent,
      footer: "conflict-calendar",
      userName: session?.user?.name ?? undefined,
      avatarUrl: session?.user?.image ?? undefined,
      level,
      items: listTasks.map((task) => ({
        title: task.title || "(Untitled task)",
        completed: task.status === "completed",
      })),
    });
    if (blob) {
      await shareOrDownload(
        blob,
        `${listTitle.replace(/\s+/g, "-").toLowerCase()}-tasks.png`,
        `My ${listTitle} task category: ${completed} of ${listTasks.length} tasks completed.`
      );
    }
  };

  const startTaskEdit = (taskId: string, currentTitle: string) => {
    setEditingTaskId(taskId);
    setEditTaskTitle(currentTitle);
  };

  const cancelTaskEdit = () => {
    setEditingTaskId(null);
    setEditTaskTitle("");
  };

  const saveTaskTitle = async (taskId: string, taskListId: string) => {
    const nextTitle = editTaskTitle.trim();
    if (!nextTitle || editingTaskSavingId) return;
    setEditingTaskSavingId(taskId);
    setFormError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskListId, title: nextTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to rename task");
      cancelTaskEdit();
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't rename that task. Try again.");
    } finally {
      setEditingTaskSavingId(null);
    }
  };

  const deleteTaskItem = async (taskId: string, taskListId: string) => {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setPendingIds((prev) => new Set(prev).add(taskId));
    try {
      const res = await fetch(`/api/tasks/${taskId}?taskListId=${taskListId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete task");
      refresh();
    } catch {
      setFormError("Couldn't delete that task. Try again.");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  if (sessionStatus === "unauthenticated") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="font-serif text-3xl font-semibold mb-4">Tasks</h1>
        <div className="border border-rule p-10 text-center">
          <p className="text-sm text-ink-soft mb-4">
            Connect Google Tasks to see your task lists here.
          </p>
          <button
            onClick={() => signIn("google")}
            className="bg-ink text-paper text-sm font-medium px-5 py-2.5 hover:bg-accent transition-colors"
          >
            Connect Google Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 py-4 space-y-3 md:px-6 md:py-10 md:space-y-6">
      <header className="flex items-start justify-between border-b border-rule pb-2 md:pb-4">
        <div>
          <p className="text-[9px] md:text-[11px] uppercase tracking-[0.2em] text-accent font-medium mb-0.5 md:mb-1">
            Section Three
          </p>
          <h1 className="font-serif text-xl md:text-4xl font-semibold tracking-tight">Tasks</h1>
        </div>
        <SyncStatus state={syncState} onRetry={refresh} />
      </header>

      <div className="flex justify-end">
        <button
          onClick={() => setShowCategoryForm((v) => !v)}
          className="text-xs uppercase tracking-widest border border-rule px-3 py-1.5 hover:border-ink transition-colors"
        >
          {showCategoryForm ? "Cancel" : "+ New Category"}
        </button>
      </div>

      {showCategoryForm && (
        <div className="border border-rule p-4 bg-paper-raised flex gap-3 items-center">
          <input
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="Category name, e.g. Work, Personal"
            className="flex-1 border border-rule bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={addCategory}
            disabled={!categoryName.trim() || savingCategory}
            className="bg-ink text-paper text-sm font-medium px-4 py-2 hover:bg-accent disabled:opacity-40 whitespace-nowrap"
          >
            {savingCategory ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      {(error || formError) && (
        <div className="border border-red-600/30 bg-red-600/5 p-4 text-sm text-red-700 dark:text-red-400">
          {error ?? formError}
        </div>
      )}

      {syncState === "syncing" && taskLists.length === 0 && (
        <p className="text-sm text-ink-soft">Loading your tasks…</p>
      )}

      {syncState !== "syncing" && taskLists.length === 0 && (
        <div className="border border-dashed border-rule p-10 text-center text-sm text-ink-soft">
          No task categories found.
        </div>
      )}

      <div className="grid gap-5 md:gap-6 lg:gap-7 sm:grid-cols-2 lg:grid-cols-3 items-start">
        {taskLists.map((list) => {
          const listTasks = tasks.filter((t) => t.taskListId === list.id);
          const isAdding = addingToList === list.id;
          const isOpen = expanded[list.id] ?? true;
          const CatIcon = categoryIcon(list.title);
          return (
            <div key={list.id} className="border border-rule">
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 md:px-5 md:py-4 md:gap-3 border-b border-rule bg-accent/10">
                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                  <span className="w-7 h-7 md:w-10 md:h-10 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <CatIcon className="w-3.5 h-3.5 md:w-5 md:h-5" />
                  </span>
                  <h2 className="text-xs md:text-base uppercase tracking-widest font-bold text-ink truncate">
                    {list.title}
                  </h2>
                </div>
                <div className="flex items-center gap-0.5 md:gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setAddingToList(isAdding ? null : list.id);
                      setNewTaskTitle("");
                      if (!isOpen) toggleExpanded(list.id);
                    }}
                    className="w-7 h-7 md:w-10 md:h-10 rounded-full flex items-center justify-center text-ink-soft hover:text-accent hover:bg-paper transition-colors text-lg md:text-2xl leading-none"
                    aria-label="Add task"
                  >
                    +
                  </button>
                  <button
                    onClick={() => shareCategory(list.id, list.title)}
                    className="w-7 h-7 md:w-10 md:h-10 rounded-full flex items-center justify-center text-ink-soft hover:text-accent hover:bg-paper transition-colors"
                    aria-label="Share category"
                  >
                    <IconShare className="w-3.5 h-3.5 md:w-5 md:h-5" />
                  </button>
                  <button
                    onClick={() => deleteCategory(list.id, list.title)}
                    className="w-8 h-8 md:w-11 md:h-11 rounded-full flex items-center justify-center text-ink-soft/70 hover:text-red-600 hover:bg-paper transition-colors"
                    aria-label="Delete category"
                  >
                    <IconTrash className="w-4 h-4 md:w-6 md:h-6" />
                  </button>
                  <button
                    onClick={() => toggleExpanded(list.id)}
                    className="md:hidden w-7 h-7 rounded-full flex items-center justify-center text-ink-soft hover:text-accent hover:bg-paper transition-colors"
                    aria-label={isOpen ? "Collapse category" : "Expand category"}
                    aria-expanded={isOpen}
                  >
                    <IconChevronDown
                      className={`w-5 h-5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>
              </div>

              <div className={`${isOpen ? "block" : "hidden"} md:block`}>
                {isAdding && (
                  <div className="p-3.5 border-b border-rule flex gap-2">
                    <input
                      autoFocus
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addTask(list.id)}
                      placeholder="Task title"
                      className="flex-1 border border-rule bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => addTask(list.id)}
                      disabled={!newTaskTitle.trim() || saving}
                      className="text-xs uppercase tracking-widest bg-ink text-paper px-3 disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                )}

                {listTasks.length === 0 ? (
                  <p className="text-xs text-ink-soft px-4 py-8 text-center">No tasks yet.</p>
                ) : (
                  <ul className="divide-y divide-rule px-3 md:px-5">
                    {listTasks.map((task) => {
                      const pending = pendingIds.has(task.id);
                      return (
                        <li key={task.id} className="py-2 md:py-4.5 flex items-start gap-2 md:gap-3 group">
                          <button
                            onClick={() => toggleTask(task.id, list.id, task.status)}
                            disabled={pending}
                            className={`mt-0.5 w-3.5 h-3.5 md:w-4 md:h-4 border shrink-0 transition-colors ${
                              task.status === "completed"
                                ? "bg-ink border-ink"
                                : "border-ink-soft hover:border-ink"
                            } ${pending ? "opacity-40" : ""}`}
                          />
                          <div className="flex-1 min-w-0">
                            {editingTaskId === task.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  autoFocus
                                  value={editTaskTitle}
                                  onChange={(e) => setEditTaskTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveTaskTitle(task.id, list.id);
                                    if (e.key === "Escape") cancelTaskEdit();
                                  }}
                                  className="min-w-0 flex-1 border border-rule bg-transparent px-2 py-1 text-xs md:text-sm outline-none focus:border-accent"
                                  aria-label="Edit task title"
                                />
                                <button
                                  type="button"
                                  onClick={() => saveTaskTitle(task.id, list.id)}
                                  disabled={!editTaskTitle.trim() || editingTaskSavingId === task.id}
                                  className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-accent disabled:opacity-40"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelTaskEdit}
                                  disabled={editingTaskSavingId === task.id}
                                  className="text-[10px] md:text-xs text-ink-soft"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={`text-xs md:text-sm ${
                                      task.status === "completed" ? "line-through text-ink-soft" : ""
                                    }`}
                                  >
                                    {task.title || "(Untitled task)"}
                                  </p>
                                  {task.due && (
                                    <p className="text-[10px] md:text-xs text-ink-soft mt-0.5">
                                      Due {new Date(task.due).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => startTaskEdit(task.id, task.title || "")}
                                  disabled={pending}
                                  className="edit-title-button"
                                  aria-label="Edit task title"
                                >
                                  <IconPencil className="w-[18px] h-[18px]" />
                                </button>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => deleteTaskItem(task.id, list.id)}
                            disabled={pending || editingTaskSavingId === task.id}
                            className="text-ink-soft/50 hover:text-red-600 transition-colors shrink-0 mt-0.5"
                            aria-label="Delete task"
                          >
                            <IconTrash className="w-4 h-4 md:w-6 md:h-6" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
