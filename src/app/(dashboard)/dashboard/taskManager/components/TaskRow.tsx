"use client";

import { useState } from "react";
import { Pencil, Archive, X, Check, History, CheckSquare, Square, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { TMTask, TMProject, TaskType } from "@/types/taskManager";
import { User } from "@/types";
import { minTaskDate } from "@/lib/taskDateLimits";
import { STATUS_STYLES } from "../statusStyles";
import OwnerSelect from "./OwnerSelect";
import FrequencySelect from "./FrequencySelect";
import SubtaskPanel from "./SubtaskPanel";

export default function TaskRow({
  task,
  editMode,
  users,
  projects,
  currentUserId,
  isSeniorManagement,
  variant = "register",
  onChanged,
  onOpenAudit,
}: {
  task: TMTask;
  editMode: boolean;
  users: User[];
  // Every active project, for the "Project" move selector — undefined/empty
  // just hides that selector rather than breaking (e.g. any caller that
  // hasn't been updated to pass it yet).
  projects?: TMProject[];
  currentUserId: string | null;
  isSeniorManagement: boolean;
  variant?: "register" | "monitoring";
  onChanged: () => void;
  onOpenAudit: (task: TMTask) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [ownerId, setOwnerId] = useState<string | null>(task.owner_id ?? null);
  const [startDate, setStartDate] = useState(task.start_date ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [indicator, setIndicator] = useState(task.indicator ?? "");
  const [frequency, setFrequency] = useState(task.frequency ?? "");
  const [methodProvider, setMethodProvider] = useState(task.method_provider ?? "");
  const [projectId, setProjectId] = useState(task.project_id);
  // Which tab this task belongs to — drives the edit form itself (e.g.
  // whether the indicator/method-provider inputs show up), not just where
  // it's saved to, so switching it while editing updates the form right
  // away rather than needing a second edit pass after moving.
  const [taskType, setTaskType] = useState<TaskType>(task.task_type);
  // Only a user choice when taskType isn't "monitoring" — monitoring items
  // are recurring by nature and always send is_recurring: true regardless
  // of this state (see handleSave below).
  const [isRecurring, setIsRecurring] = useState(task.is_recurring);

  const [savingProgress, setSavingProgress] = useState(false);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const minDate = minTaskDate();

  const status = task.display_status ?? "Not Started";
  const style = STATUS_STYLES[status];

  const resetDraft = () => {
    setTitle(task.title);
    setOwnerId(task.owner_id ?? null);
    setStartDate(task.start_date ?? "");
    setDueDate(task.due_date ?? "");
    setIndicator(task.indicator ?? "");
    setFrequency(task.frequency ?? "");
    setMethodProvider(task.method_provider ?? "");
    setProjectId(task.project_id);
    setTaskType(task.task_type);
    setIsRecurring(task.is_recurring);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Task name can't be empty");
      return;
    }
    if ((startDate && startDate < minDate) || (dueDate && dueDate < minDate)) {
      toast.error("Start and due dates can't be more than a year in the past");
      return;
    }
    const recurring = taskType === "monitoring" ? true : isRecurring;
    const movedProject = projectId !== task.project_id;
    const movedTab = taskType !== task.task_type;
    setSaving(true);
    try {
      await api.patch(`/task-manager/tasks/${task.id}`, {
        title: title.trim(),
        owner_id: ownerId,
        start_date: startDate || null,
        due_date: dueDate || null,
        is_recurring: recurring,
        frequency: recurring ? frequency || null : null,
        project_id: projectId,
        task_type: taskType,
        ...(taskType === "monitoring" && {
          indicator: indicator || null,
          method_provider: methodProvider || null,
        }),
      });
      let message = "Task updated";
      if (movedProject && movedTab) message = `Task updated, moved to the new project and ${taskType === "monitoring" ? "Monitoring Schedule" : "Obligation Register"}`;
      else if (movedProject) message = "Task updated and moved to the new project";
      else if (movedTab) message = `Task updated and moved to ${taskType === "monitoring" ? "Monitoring Schedule" : "Obligation Register"}`;
      toast.success(message);
      setEditing(false);
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    try {
      await api.post(`/task-manager/tasks/${task.id}/archive`);
      toast.success("Task archived");
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to archive task");
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${task.title}"? This can be restored later from the Archived/Deleted view.`)) return;
    try {
      await api.post(`/task-manager/tasks/${task.id}/delete`);
      toast.success("Task deleted");
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to delete task");
    }
  };

  const handleRestore = async () => {
    try {
      await api.post(`/task-manager/tasks/${task.id}/restore`);
      toast.success("Task restored");
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to restore task");
    }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const handleToggleComplete = async () => {
    try {
      const endpoint = task.lifecycle_status === "completed" ? "restore" : "complete";
      const res = await api.post(`/task-manager/tasks/${task.id}/${endpoint}`);
      if (res.data?.recurred) {
        toast.success(`Recurring task — next due date set to ${fmtDate(res.data.next_due_date)}`);
      }
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to update task");
    }
  };

  // A task with no subtasks is, in effect, a single leaf worth 100% of
  // itself — so there's nothing to drag, just a tick. Unticking goes back
  // to 0 rather than whatever it was before, since there's no partial state
  // to preserve without subtasks to track it. Tasks WITH subtasks never
  // call this — their progress is fully computed from ticking those (see
  // SubtaskPanel), never set directly.
  const handleToggleTaskDone = async () => {
    if (!canEditProgress || task.has_subtasks) return;
    const nextDone = task.progress_percent < 100;
    setSavingProgress(true);
    try {
      const res = await api.patch(`/task-manager/tasks/${task.id}/progress`, { progress_percent: nextDone ? 100 : 0 });
      if (nextDone) {
        toast.success(
          res.data?.recurred ? `Recurring task — next due date set to ${fmtDate(res.data.next_due_date)}` : "Marked complete",
        );
      }
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to update progress");
    } finally {
      setSavingProgress(false);
    }
  };

  const isLifecycleActive = task.lifecycle_status === "active";
  const canEditProgress = isLifecycleActive && (isSeniorManagement || (!!currentUserId && task.owner_id === currentUserId));

  if (editing) {
    return (
      <div className="bg-red-50/60 rounded-lg px-3 py-2.5 space-y-3 border-b border-gray-100 md:border-0">
        {/* Mobile edit form */}
        <div className="md:hidden space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border-2 border-red-600 rounded-md px-2 py-1.5 text-sm font-medium focus:outline-none"
            autoFocus
          />
          <OwnerSelect users={users} value={ownerId} onChange={setOwnerId} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Start Date</label>
              <input
                type="date"
                value={startDate}
                min={minDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border-2 border-red-600 rounded-md px-2 py-1.5 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Due Date</label>
              <input
                type="date"
                value={dueDate}
                min={minDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border-2 border-red-600 rounded-md px-2 py-1.5 text-sm focus:outline-none"
              />
            </div>
          </div>
          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold border ${style.bg} ${style.text} ${style.border}`}>
            {status}
          </span>
          {projects && projects.length > 1 && (
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none bg-white"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-[10px] text-gray-400 block mb-0.5">Move to</label>
            <select
              value={taskType === "monitoring" ? "monitoring" : "register"}
              onChange={(e) =>
                setTaskType(e.target.value === "monitoring" ? "monitoring" : task.task_type !== "monitoring" ? task.task_type : "general")
              }
              className="w-full border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none bg-white"
            >
              <option value="register">Obligation Register</option>
              <option value="monitoring">Monitoring Schedule</option>
            </select>
          </div>
          {taskType === "monitoring" && (
            <div className="space-y-2">
              <input value={indicator} onChange={(e) => setIndicator(e.target.value)} placeholder="Indicator" className="w-full border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none" />
              <FrequencySelect value={frequency} onChange={setFrequency} className="w-full border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none bg-white" />
              <input value={methodProvider} onChange={(e) => setMethodProvider(e.target.value)} placeholder="Method / provider" className="w-full border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none" />
            </div>
          )}
          {taskType !== "monitoring" && (
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="accent-red-600 w-3.5 h-3.5 cursor-pointer" />
                Recurring
              </label>
              {isRecurring && (
                <FrequencySelect value={frequency} onChange={setFrequency} className="w-full border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none bg-white" />
              )}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-1 bg-red-600 text-white text-xs font-semibold px-3 py-2 rounded-md hover:bg-red-700 disabled:opacity-60">
              <Check className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => { resetDraft(); setEditing(false); }} disabled={saving} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2">
              Cancel
            </button>
          </div>
        </div>

        {/* Desktop edit form */}
        <div className="hidden md:block space-y-2">
        <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_1fr_1fr_auto] gap-3 items-center">
          <div />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-2 border-red-600 rounded-md px-2 py-1.5 text-sm font-medium focus:outline-none"
            autoFocus
          />
          <OwnerSelect users={users} value={ownerId} onChange={setOwnerId} />
          <input
            type="date"
            value={startDate}
            min={minDate}
            onChange={(e) => setStartDate(e.target.value)}
            title="Start date"
            className="border-2 border-red-600 rounded-md px-2 py-1.5 text-sm focus:outline-none"
          />
          <input
            type="date"
            value={dueDate}
            min={minDate}
            onChange={(e) => setDueDate(e.target.value)}
            title="Due date"
            className="border-2 border-red-600 rounded-md px-2 py-1.5 text-sm focus:outline-none"
          />
          <div>
            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold border ${style.bg} ${style.text} ${style.border}`}>
              {status}
            </span>
            <p className="text-[10px] text-gray-400 italic mt-0.5">auto — from due date</p>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-60"
            >
              <Check className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => {
                resetDraft();
                setEditing(false);
              }}
              disabled={saving}
              className="text-xs text-gray-500 hover:text-gray-700 px-2"
            >
              Cancel
            </button>
          </div>
        </div>
        <div className="grid grid-cols-[2.5rem_1fr_1fr_auto] gap-3 items-center">
          <div />
          {projects && projects.length > 1 ? (
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Project</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none bg-white"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div />
          )}
          <div>
            <label className="text-[10px] text-gray-400 block mb-0.5">Move to</label>
            <select
              value={taskType === "monitoring" ? "monitoring" : "register"}
              onChange={(e) =>
                setTaskType(e.target.value === "monitoring" ? "monitoring" : task.task_type !== "monitoring" ? task.task_type : "general")
              }
              className="w-full border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none bg-white"
            >
              <option value="register">Obligation Register</option>
              <option value="monitoring">Monitoring Schedule</option>
            </select>
          </div>
          <div />
        </div>
        {taskType === "monitoring" && (
          <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_auto] gap-3 items-center">
            <div />
            <input
              value={indicator}
              onChange={(e) => setIndicator(e.target.value)}
              placeholder="Indicator (e.g. Air Quality)"
              className="border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none"
            />
            <FrequencySelect value={frequency} onChange={setFrequency} className="border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none bg-white" />
            <input
              value={methodProvider}
              onChange={(e) => setMethodProvider(e.target.value)}
              placeholder="Method / provider"
              className="border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none"
            />
            <div />
          </div>
        )}
        {taskType !== "monitoring" && (
          <div className="grid grid-cols-[2.5rem_1fr_1fr_auto] gap-3 items-center">
            <div />
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="accent-red-600 w-3.5 h-3.5 cursor-pointer"
              />
              Recurring
            </label>
            {isRecurring ? (
              <FrequencySelect value={frequency} onChange={setFrequency} className="border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none bg-white" />
            ) : (
              <div />
            )}
            <div />
          </div>
        )}
        </div>
      </div>
    );
  }

  const metaLine = (variant === "monitoring" ? [task.indicator, task.frequency, task.method_provider] : [task.frequency]).filter(Boolean).join(" · ");
  const fmtShort = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const startLabel = task.start_date ? fmtShort(task.start_date) : "—";
  const dueLabel = task.due_date ? fmtShort(task.due_date) : "—";

  const actionButtons = (
    <>
      <button onClick={() => onOpenAudit(task)} title="History" className="p-1.5 rounded-full border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400">
        <History className="w-3.5 h-3.5" />
      </button>
      {editMode && isLifecycleActive && (
        <>
          <button onClick={() => setEditing(true)} title="Edit" className="p-1.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleArchive} title="Archive" className="p-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50">
            <Archive className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDelete} title="Delete" className="p-1.5 rounded-full border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      )}
      {editMode && !isLifecycleActive && (
        <button onClick={handleRestore} className="text-xs font-semibold text-red-600 hover:text-red-700 px-2">
          Restore
        </button>
      )}
    </>
  );

  // The bar is never manually draggable — it's always automatic. A task
  // with subtasks shows a read-only rollup of them (see SubtaskPanel); a
  // task without any is effectively its own single leaf worth 100% of
  // itself, so the only control is a plain tick that flips it between 0
  // and 100 (see handleToggleTaskDone).
  const progressBlock = isLifecycleActive && (canEditProgress || task.progress_percent > 0) ? (
    <div className="flex items-center gap-1.5 mt-1.5 w-full max-w-[110px]">
      {!task.has_subtasks && (
        <input
          type="checkbox"
          checked={task.progress_percent >= 100}
          disabled={!canEditProgress || savingProgress}
          onChange={handleToggleTaskDone}
          title={canEditProgress ? "Mark complete" : undefined}
          className="accent-red-600 w-3.5 h-3.5 cursor-pointer disabled:cursor-default shrink-0"
        />
      )}
      <span className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <span className="block h-full bg-red-500 rounded-full" style={{ width: `${task.progress_percent}%` }} />
      </span>
      <span className="text-[10px] text-gray-400">{task.progress_percent}%</span>
    </div>
  ) : null;

  // Shown for any task that already has subtasks (so anyone with progress
  // access can open and tick them), or for Senior Management on any active
  // task without them yet (so they have a way to start breaking one down).
  const subtasksToggle = isLifecycleActive && (task.has_subtasks || isSeniorManagement) ? (
    <button
      onClick={() => setSubtasksOpen((v) => !v)}
      className="flex items-center gap-1 mt-1 text-[10px] font-medium text-gray-400 hover:text-red-600"
    >
      {subtasksOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      Subtasks
    </button>
  ) : null;

  const completeToggle = editMode && isLifecycleActive ? (
    <button onClick={handleToggleComplete} title="Mark complete" className="text-gray-300 hover:text-green-600">
      <Square className="w-4 h-4" />
    </button>
  ) : task.lifecycle_status === "completed" ? (
    <button onClick={handleToggleComplete} title="Mark active again" className="text-green-600">
      <CheckSquare className="w-4 h-4" />
    </button>
  ) : (
    <span className="w-4 h-4 block" />
  );

  return (
    <>
      {/* Mobile card */}
      <div className="md:hidden px-3 py-3 border-b border-gray-100 last:border-0 bg-white">
        <div className="flex items-start gap-2">
          <div className="pt-0.5 shrink-0">{completeToggle}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{task.title}</p>
            {metaLine && <p className="text-xs text-gray-400 mt-0.5">{metaLine}</p>}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs">
              <div>
                <span className="text-gray-400">Owner</span>
                <p className="text-gray-700 font-medium">{task.owner_name ?? "Unassigned"}</p>
              </div>
              <div>
                <span className="text-gray-400">Start Date</span>
                <p className="text-gray-700 font-medium">{startLabel}</p>
              </div>
              <div>
                <span className="text-gray-400">{variant === "monitoring" ? "Next Due" : "Due Date"}</span>
                <p className="text-gray-700 font-medium">{dueLabel}</p>
              </div>
            </div>
            <div className="mt-2">
              <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold border ${style.bg} ${style.text} ${style.border}`}>
                {status}
              </span>
              {progressBlock}
              {subtasksToggle}
            </div>
            {subtasksOpen && (
              <div className="mt-2">
                <SubtaskPanel task={task} canManage={isSeniorManagement} canToggle={canEditProgress} onChanged={onChanged} />
              </div>
            )}
            <div className="flex items-center gap-1.5 mt-3">{actionButtons}</div>
          </div>
        </div>
      </div>

      {/* Desktop row */}
      <div className="hidden md:block border-b border-gray-100 last:border-0">
        <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_1fr_1fr_auto] gap-3 items-center px-3 py-2.5 hover:bg-gray-50/60 group">
          <div className="flex justify-center">
            {completeToggle}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{task.title}</p>
            {metaLine && (
              <p className="text-xs text-gray-400 mt-0.5">{metaLine}</p>
            )}
          </div>
          <p className="text-sm text-gray-500">{task.owner_name ?? "Unassigned"}</p>
          <p className="text-sm text-gray-500">{startLabel}</p>
          <p className="text-sm text-gray-500">{dueLabel}</p>
          <div>
            <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold border ${style.bg} ${style.text} ${style.border}`}>
              {status}
            </span>
            {progressBlock}
            {subtasksToggle}
          </div>
          <div className="flex items-center gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition">
            {actionButtons}
          </div>
        </div>
        {subtasksOpen && (
          <div className="px-3 pb-2.5 pl-[calc(2.5rem+0.75rem)]">
            <SubtaskPanel task={task} canManage={isSeniorManagement} canToggle={canEditProgress} onChanged={onChanged} />
          </div>
        )}
      </div>
    </>
  );
}
