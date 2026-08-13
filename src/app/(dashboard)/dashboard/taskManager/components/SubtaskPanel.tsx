"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { TMSubtask, TMTask } from "@/types/taskManager";
import { User } from "@/types";
import { evenSplitWeights, isDateWithin, computeNodeCompletion } from "@/lib/subtaskProgress";
import { STATUS_STYLES } from "../statusStyles";

// Dates are kept as "" (not null) in draft state so the native <input
// type="date"> stays a controlled component; converted to null right before
// the PUT request goes out (see saveGroup in the main component below).
type DraftItem = {
  id?: string;
  title: string;
  weight_percent: number;
  owner_id: string | null;
  start_date: string;
  due_date: string;
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// Short form for the tight table columns below — "15 Jan" rather than the
// full "15 January 2026" fmtDate above uses elsewhere in this file.
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Same six columns the main task table uses (Task / Owner / Start / Due /
// Status), plus the existing weight-percent and an actions slot — shared by
// the header row and every subtask row so they line up. The Task column
// itself absorbs the per-depth indent (see SubtaskNode) so the other
// columns stay aligned no matter how deep a row is nested.
const SUBTASK_GRID_COLS = "grid-cols-[minmax(140px,1fr)_108px_88px_88px_84px_44px_22px]";

/**
 * Inline editor for one sibling group (all subtasks sharing a parent).
 * Hard-blocked from saving until the percentages add up to exactly
 * `targetTotal` (Sheila's explicit choice over just warning) and every row's
 * dates fall within boundStart/boundEnd — the immediate parent's own dates
 * (the task's, for the top-level group; the parent subtask's, for a nested
 * one). weight_percent is absolute at every depth — each row's own share of
 * the WHOLE task, not of its immediate parent — so `targetTotal` is 100 for
 * the top-level group (the task's own "weight"), or the parent subtask's own
 * weight_percent for a nested group (e.g. breaking a 30%-weight subtask into
 * 4 even children targets 30, giving ~7.5% each, not 25% each) — see
 * computeNodeCompletion in subtaskProgress.ts. Editing an existing group
 * pre-fills its current rows (ids included, so the save is an update, not a
 * delete-and-recreate); starting a brand new group opens with two blank rows
 * split evenly across `targetTotal`.
 */
function GroupEditor({
  initialItems,
  users,
  boundStart,
  boundEnd,
  targetTotal,
  saving,
  onCancel,
  onSave,
}: {
  initialItems: DraftItem[];
  users: User[];
  boundStart: string | null;
  boundEnd: string | null;
  targetTotal: number;
  saving: boolean;
  onCancel: () => void;
  onSave: (items: DraftItem[]) => void;
}) {
  const [rows, setRows] = useState<DraftItem[]>(
    initialItems.length > 0
      ? initialItems
      : evenSplitWeights(2, targetTotal).map((w) => ({ title: "", weight_percent: w, owner_id: null, start_date: "", due_date: "" })),
  );

  const total = rows.reduce((sum, r) => sum + (Number(r.weight_percent) || 0), 0);
  const datesValid = rows.every((r) => {
    if (r.start_date && r.due_date && r.due_date < r.start_date) return false;
    return isDateWithin(r.start_date || null, boundStart, boundEnd) && isDateWithin(r.due_date || null, boundStart, boundEnd);
  });
  const canSave = rows.length > 0 && rows.every((r) => r.title.trim()) && total === targetTotal && datesValid;

  const updateRow = (i: number, patch: Partial<DraftItem>) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // Adding/removing a row re-splits every row's weight evenly across
  // targetTotal (e.g. 4 rows over 30 -> 8/8/7/7) — the common case is an
  // equal split, so this saves typing it out by hand every time. Editing a
  // single row's own number (updateRow above) is untouched — that's still
  // a direct, free-form override for an intentionally uneven split.
  const addRow = () =>
    setRows((prev) => {
      const next = [...prev, { title: "", weight_percent: 0, owner_id: null, start_date: "", due_date: "" }];
      const split = evenSplitWeights(next.length, targetTotal);
      return next.map((r, i) => ({ ...r, weight_percent: split[i] }));
    });
  const removeRow = (i: number) =>
    setRows((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      const split = evenSplitWeights(next.length, targetTotal);
      return next.map((r, idx) => ({ ...r, weight_percent: split[idx] }));
    });

  return (
    <div className="bg-white rounded-md border border-red-200 p-2 space-y-1.5 mt-1">
      {rows.map((row, i) => (
        <div key={row.id ?? `new-${i}`} className="border border-gray-100 rounded-md p-1.5 space-y-1">
          <div className="flex items-center gap-1.5">
            <input
              value={row.title}
              onChange={(e) => updateRow(i, { title: e.target.value })}
              placeholder="Subtask name"
              className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-red-400"
            />
            <input
              type="number"
              min={0}
              max={targetTotal}
              value={row.weight_percent}
              onChange={(e) => updateRow(i, { weight_percent: Number(e.target.value) })}
              className="w-14 shrink-0 border border-gray-200 rounded px-1.5 py-1 text-xs text-right focus:outline-none focus:border-red-400"
            />
            <span className="text-[10px] text-gray-400 shrink-0">%</span>
            <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-600 px-0.5 shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={row.owner_id ?? ""}
              onChange={(e) => updateRow(i, { owner_id: e.target.value || null })}
              className="flex-1 min-w-[110px] border border-gray-200 rounded px-1.5 py-1 text-[11px] bg-white focus:outline-none focus:border-red-400"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.first_name} {u.last_name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={row.start_date}
              min={boundStart ?? undefined}
              max={row.due_date || boundEnd || undefined}
              onChange={(e) => updateRow(i, { start_date: e.target.value })}
              title="Start date"
              className="border border-gray-200 rounded px-1.5 py-1 text-[11px] focus:outline-none focus:border-red-400"
            />
            <input
              type="date"
              value={row.due_date}
              min={row.start_date || boundStart || undefined}
              max={boundEnd ?? undefined}
              onChange={(e) => updateRow(i, { due_date: e.target.value })}
              title="Due date"
              className="border border-gray-200 rounded px-1.5 py-1 text-[11px] focus:outline-none focus:border-red-400"
            />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between pt-0.5">
        <button onClick={addRow} className="text-[11px] font-semibold text-red-600 hover:text-red-700 flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add row
        </button>
        <span className={`text-[11px] font-semibold ${total === targetTotal ? "text-green-600" : "text-gray-400"}`}>
          {total}% of {targetTotal}%
        </span>
      </div>
      {!datesValid && (
        <p className="text-[10px] text-red-600">
          Each subtask&apos;s dates must fall within {boundStart || boundEnd ? "its parent's start and due dates" : "a valid range"}, and its due date can&apos;t be before its start date.
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onSave(rows.map((r) => ({ ...r, title: r.title.trim() })))}
          disabled={!canSave || saving}
          className="flex-1 bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} disabled={saving} className="text-xs text-gray-500 hover:text-gray-700 px-2">
          Cancel
        </button>
      </div>
    </div>
  );
}

function SubtaskNode({
  node,
  depth,
  users,
  canManage,
  canToggle,
  editingParentId,
  setEditingParentId,
  savingGroup,
  onToggleLeaf,
  onSaveGroup,
  optimisticLeaves,
}: {
  node: TMSubtask;
  depth: number;
  users: User[];
  canManage: boolean;
  canToggle: boolean;
  editingParentId: string | null | undefined;
  setEditingParentId: (id: string | null | undefined) => void;
  savingGroup: boolean;
  onToggleLeaf: (id: string, done: boolean) => void;
  onSaveGroup: (parentId: string | null, items: DraftItem[]) => void;
  optimisticLeaves: Record<string, boolean>;
}) {
  const isLeaf = !node.children || node.children.length === 0;
  const percent = computeNodeCompletion(node);
  const isEditingChildren = editingParentId === node.id;
  const statusStyle = node.status ? STATUS_STYLES[node.status] : null;
  // The bolder/bigger treatment below is keyed on DEPTH, not on whether this
  // particular node happens to have children — a top-level subtask like
  // "buy a cat" with no breakdown of its own is still one of the task's
  // "main" subtasks and needs to read as one, not blend in with the smaller
  // sub-subtask rows nested two levels down. isLeaf (used above for the
  // checkbox/chevron) is about whether a row is directly tickable; isMainRow
  // (used below for every column's styling) is about which level it's on.
  const isMainRow = depth === 1;

  // Children start collapsed — a task with a few levels of nesting got
  // clumsy showing every sub-subtask at once. Each parent row gets its own
  // chevron to reveal just its own children; opening the "+"/pencil editor
  // for a node auto-expands it too, so newly added or edited children are
  // visible right after saving instead of hidden behind a second click.
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      {/* Same column set as the main task table (Task / Owner / Start / Due /
          Status) so a subtask reads as "the same row shape, one level down"
          rather than a different kind of list — but a row never indents
          itself. Nesting instead comes from the parent wrapping ITS
          children in an indented, left-bordered block (below) — that way a
          sub-subtask's whole row, "%" column included, sits visibly offset
          from the top-level list instead of sharing its column positions,
          which was reading as if the percentages belonged to the same
          list. */}
      <div className={`grid ${SUBTASK_GRID_COLS} gap-2 items-center py-1`}>
        <div className="flex items-center gap-1.5 min-w-0">
          {isLeaf ? (
            <span className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <button onClick={() => setExpanded((v) => !v)} title={expanded ? "Hide sub-subtasks" : "Show sub-subtasks"} className="text-gray-400 hover:text-red-600 shrink-0">
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          )}
          {isLeaf ? (
            <input
              type="checkbox"
              checked={optimisticLeaves[node.id] ?? node.is_done}
              disabled={!canToggle}
              onChange={(e) => onToggleLeaf(node.id, e.target.checked)}
              className="accent-red-600 w-3.5 h-3.5 cursor-pointer disabled:cursor-default shrink-0"
            />
          ) : (
            // A subtask that itself has subtasks isn't ticked by hand — its
            // completion is always derived from its children (see
            // computeNodeCompletion) — so this checkbox is read-only,
            // reflecting whether that rollup has reached 100%. The percentage
            // itself is shown as a progress bar instead of a number here.
            <input
              type="checkbox"
              checked={percent === 100}
              disabled
              readOnly
              title={`${percent}% complete`}
              className="accent-red-600 w-3.5 h-3.5 shrink-0 cursor-default opacity-70"
            />
          )}
          {/* A top-level ("main") subtask renders bolder and a touch bigger
              than anything nested under it, so it's visually obvious which
              rows are the task's direct subtasks and which are sub-subtasks
              one or more levels down, rather than everything reading as one
              flat list at the same weight. */}
          <span
            className={`min-w-0 truncate flex-1 ${isMainRow ? "text-sm font-semibold" : "text-xs"} ${isLeaf && node.is_done ? "text-gray-400 line-through" : "text-gray-700"}`}
            title={node.title}
          >
            {node.title}
          </span>
          {!isLeaf && (
            <div className="w-10 h-1.5 rounded-full bg-gray-200 overflow-hidden shrink-0" title={`${percent}% complete`}>
              <div className="h-full bg-red-600 rounded-full" style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>
        {/* Every column, not just the title, picks up the bolder/bigger
            "main subtask" treatment for a top-level row — otherwise Owner /
            Start / Due / % all still looked identical between a top-level
            row and the rows nested under it, which was the actual source of
            confusion, not just the title. */}
        <span className={`truncate ${isMainRow ? "text-xs font-semibold text-gray-700" : "text-[11px] text-gray-500"}`} title={node.owner_name ?? "Unassigned"}>
          {node.owner_name ?? "Unassigned"}
        </span>
        <span className={`truncate ${isMainRow ? "text-xs font-semibold text-gray-700" : "text-[11px] text-gray-500"}`}>
          {node.start_date ? fmtDateShort(node.start_date) : "—"}
        </span>
        <span className={`truncate ${isMainRow ? "text-xs font-semibold text-gray-700" : "text-[11px] text-gray-500"}`}>
          {node.due_date ? fmtDateShort(node.due_date) : "—"}
        </span>
        <div className="min-w-0">
          {statusStyle && (
            <span
              className={`inline-block font-semibold rounded-full border truncate max-w-full ${isMainRow ? "text-[10px] px-2 py-0.5" : "text-[9px] px-1.5 py-0.5"} ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
            >
              {node.status}
            </span>
          )}
        </div>
        <span className={`text-right shrink-0 ${isMainRow ? "text-xs font-semibold text-gray-600" : "text-[10px] text-gray-400"}`}>{node.weight_percent}%</span>
        <div className="flex justify-end">
          {canManage && isLeaf && depth < 4 && (
            <button
              onClick={() => {
                if (!isEditingChildren) setExpanded(true);
                setEditingParentId(isEditingChildren ? undefined : node.id);
              }}
              title="Break this subtask down further"
              className="text-gray-300 hover:text-red-600 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {canManage && !isLeaf && (
            <button
              onClick={() => {
                if (!isEditingChildren) setExpanded(true);
                setEditingParentId(isEditingChildren ? undefined : node.id);
              }}
              title="Edit these subtasks"
              className="text-gray-300 hover:text-red-600 shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {isEditingChildren && (
        // Indented and set off with a left border so this reads as "editing
        // what's nested under this row", not as another row in the main
        // list — same treatment as the read-only children block below.
        <div className="ml-5 pl-3 border-l-2 border-red-100 mt-1">
          <GroupEditor
            initialItems={(node.children ?? []).map((c) => ({
              id: c.id,
              title: c.title,
              weight_percent: c.weight_percent,
              owner_id: c.owner_id ?? null,
              start_date: c.start_date ?? "",
              due_date: c.due_date ?? "",
            }))}
            users={users}
            boundStart={node.start_date ?? null}
            boundEnd={node.due_date ?? null}
            targetTotal={node.weight_percent}
            saving={savingGroup}
            onCancel={() => setEditingParentId(undefined)}
            onSave={(items) => onSaveGroup(node.id, items)}
          />
        </div>
      )}

      {!isLeaf && !isEditingChildren && expanded && (
        // The whole nested block — every column, not just the title —
        // shifts right and sits behind a left border, so it reads as
        // belonging to THIS row rather than sharing the top-level list's
        // column positions (the "%" here is this subtask's own, not a
        // sibling of the rows above it). Nesting one level deeper stacks
        // another one of these inside it, so the indent compounds naturally.
        <div className="ml-5 pl-3 border-l-2 border-gray-200">
          {(node.children ?? []).map((child) => (
            <SubtaskNode
              key={child.id}
              node={child}
              depth={depth + 1}
              users={users}
              canManage={canManage}
              canToggle={canToggle}
              editingParentId={editingParentId}
              setEditingParentId={setEditingParentId}
              savingGroup={savingGroup}
              onToggleLeaf={onToggleLeaf}
              onSaveGroup={onSaveGroup}
              optimisticLeaves={optimisticLeaves}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Expandable panel shown under a task when its "Subtasks" toggle is open.
 * Read-only tree + leaf checkboxes for anyone who can already touch this
 * task's progress (owner or Senior Management); adding/renaming/reweighting
 * subtasks — and now setting each one's owner, start date, and due date — is
 * Senior Management only, same tier as editing the task itself. Every tick
 * or structural save reuses the task's normal progress endpoint under the
 * hood (see the API routes), so auto-complete and recurring-task cycling
 * behave exactly as they do for the manual slider. Each subtask's displayed
 * status (the colored badge) is computed server-side from its own dates +
 * ticked state (leaves) or aggregated from its children (any node with
 * children) — a separate thing entirely from the weight_percent-based %
 * shown next to it.
 */
export default function SubtaskPanel({
  task,
  users,
  canManage,
  canToggle,
  onChanged,
}: {
  task: TMTask;
  users: User[];
  canManage: boolean;
  canToggle: boolean;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["tm-subtasks", task.id];
  const { data, isLoading } = useQuery<{ subtasks: TMSubtask[] }>({
    queryKey,
    queryFn: async () => (await api.get(`/task-manager/tasks/${task.id}/subtasks`)).data,
  });
  const tree = data?.subtasks ?? [];

  // Which group is being edited right now, identified by its parent id
  // (null = the task's own top-level group). undefined = nothing open.
  const [editingParentId, setEditingParentId] = useState<string | null | undefined>(undefined);
  const [savingGroup, setSavingGroup] = useState(false);
  // True while any leaf tick is in flight — see toggleLeaf below.
  const [leafSaving, setLeafSaving] = useState(false);
  // Every leaf toggle recomputes the WHOLE task's rollup from a fresh DB read
  // and writes it to tm_tasks.progress_percent. Two ticks fired back to back
  // (e.g. checking off two sub-subtasks in quick succession) can otherwise
  // race: if the first request's read-recompute-write finishes AFTER the
  // second one's, it can overwrite progress_percent with a number that
  // doesn't yet include the second tick — the main task's progress bar then
  // looks stuck even though every subtask shows complete. Chaining requests
  // through this ref forces them to run one at a time, so each one's rollup
  // is always computed after the previous tick has actually landed.
  const leafQueueRef = useRef<Promise<void>>(Promise.resolve());

  const afterMutation = (result?: { recurred?: boolean; next_due_date?: string | null; task?: TMTask | null; subtasks?: TMSubtask[] }) => {
    // Both subtask routes already hand back the freshly rebuilt tree in the
    // same response (see the PUT/PATCH routes) — write it straight into the
    // cache instead of invalidating and waiting on a second round trip to
    // fetch the same data again. That second round trip was the main reason
    // a tick felt slow to visibly register.
    if (result?.subtasks) {
      queryClient.setQueryData(queryKey, { subtasks: result.subtasks });
    } else {
      queryClient.invalidateQueries({ queryKey });
    }
    // Belt-and-suspenders, same idea one level up: the subtask routes also
    // hand back the task's freshly recomputed progress_percent/display_status
    // directly (see updateTaskProgress), so patch every cached task-list
    // query with it right away too. A partial tick (e.g. 1 of 4 sub-subtasks
    // under a 30%-weight subtask, moving the main task from 30% to 38%) is
    // easy to miss if that refetch is even briefly delayed.
    if (result?.task) {
      const updated = result.task;
      queryClient.setQueriesData<{ tasks: TMTask[] }>({ queryKey: ["tm-tasks"] }, (old) =>
        old ? { tasks: old.tasks.map((t) => (t.id === updated.id ? updated : t)) } : old,
      );
    }
    onChanged();
    if (result?.recurred && result.next_due_date) {
      toast.success(`Recurring task — next due date set to ${fmtDate(result.next_due_date)}`);
    }
  };

  // Ticked/unticked instantly on click (see optimisticLeaves below), rather
  // than waiting for the request to round-trip before the box visibly
  // flips — the request still runs the same as before underneath.
  const [optimisticLeaves, setOptimisticLeaves] = useState<Record<string, boolean>>({});

  const toggleLeaf = (subtaskId: string, nextDone: boolean) => {
    setOptimisticLeaves((prev) => ({ ...prev, [subtaskId]: nextDone }));
    leafQueueRef.current = leafQueueRef.current.then(async () => {
      setLeafSaving(true);
      try {
        const res = await api.patch(`/task-manager/tasks/${task.id}/subtasks/${subtaskId}`, { is_done: nextDone });
        afterMutation(res.data);
      } catch (err: any) {
        toast.error(err?.response?.data?.error ?? "Failed to update subtask");
      } finally {
        setLeafSaving(false);
        // Drop the local override now that the cache reflects reality again
        // — the fresh server data on success (matching what was already
        // shown), or the untouched prior data on failure, which is how a
        // rejected tick visibly reverts.
        setOptimisticLeaves((prev) => {
          if (!(subtaskId in prev)) return prev;
          const { [subtaskId]: _drop, ...rest } = prev;
          return rest;
        });
      }
    });
  };

  const saveGroup = async (parentId: string | null, items: DraftItem[]) => {
    setSavingGroup(true);
    try {
      // "" (unset date, kept as an empty string for the controlled <input
      // type="date">) becomes null on the wire — the API treats a missing
      // date as "no constraint on this side", same as the task's own dates.
      const payloadItems = items.map((r) => ({
        id: r.id,
        title: r.title,
        weight_percent: r.weight_percent,
        owner_id: r.owner_id,
        start_date: r.start_date || null,
        due_date: r.due_date || null,
      }));
      const res = await api.put(`/task-manager/tasks/${task.id}/subtasks`, { parent_id: parentId, items: payloadItems });
      afterMutation(res.data);
      setEditingParentId(undefined);
      toast.success("Subtasks saved");
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to save subtasks");
    } finally {
      setSavingGroup(false);
    }
  };

  const deleteAll = async () => {
    if (!confirm("Remove all subtasks from this task? Progress will switch back to manual updates.")) return;
    await saveGroup(null, []);
  };

  if (isLoading) return <p className="text-xs text-gray-400 italic px-1 py-2">Loading subtasks…</p>;

  return (
    <div className="bg-gray-50/60 rounded-lg border border-gray-100 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Subtasks</p>
        {canManage && tree.length > 0 && editingParentId !== null && (
          <div className="flex items-center gap-3">
            <button onClick={() => setEditingParentId(null)} className="text-[11px] font-semibold text-red-600 hover:text-red-700 flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <button onClick={deleteAll} className="text-[11px] text-gray-400 hover:text-red-600 flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Remove all
            </button>
          </div>
        )}
      </div>

      {editingParentId === null ? (
        <GroupEditor
          initialItems={tree.map((n) => ({
            id: n.id,
            title: n.title,
            weight_percent: n.weight_percent,
            owner_id: n.owner_id ?? null,
            start_date: n.start_date ?? "",
            due_date: n.due_date ?? "",
          }))}
          users={users}
          boundStart={task.start_date ?? null}
          boundEnd={task.due_date ?? null}
          targetTotal={100}
          saving={savingGroup}
          onCancel={() => setEditingParentId(undefined)}
          onSave={(items) => saveGroup(null, items)}
        />
      ) : tree.length === 0 ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-400">No subtasks yet — progress above is updated manually.</p>
          {canManage && (
            <button
              onClick={() => setEditingParentId(null)}
              className="text-[11px] font-semibold text-red-600 hover:text-red-700 flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3 h-3" /> Add Subtasks
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-0.5">
          {/* Same column headings as the main task table, so a subtask
              reads as the same kind of row one level down. */}
          <div className={`grid ${SUBTASK_GRID_COLS} gap-2 pb-1 border-b border-gray-200`}>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Task</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Owner</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Start</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Due</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Status</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide text-right">%</span>
            <span />
          </div>
          {tree.map((node) => (
            <SubtaskNode
              key={node.id}
              node={node}
              depth={1}
              users={users}
              canManage={canManage}
              canToggle={canToggle}
              editingParentId={editingParentId}
              setEditingParentId={setEditingParentId}
              savingGroup={savingGroup}
              onToggleLeaf={toggleLeaf}
              onSaveGroup={saveGroup}
              optimisticLeaves={optimisticLeaves}
            />
          ))}
        </div>
      )}
    </div>
  );
}
