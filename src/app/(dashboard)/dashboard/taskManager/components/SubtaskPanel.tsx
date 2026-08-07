"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { TMSubtask, TMTask } from "@/types/taskManager";

type DraftItem = { id?: string; title: string; weight_percent: number };

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Mirrors src/lib/subtaskProgress.ts's computeNodeCompletion — kept as a
 * small client-side copy rather than a shared import so this component
 * doesn't need a server-only module, and to show the live number
 * immediately from whatever the last fetch returned without waiting on a
 * round trip.
 */
function computeNodePercent(node: TMSubtask): number {
  if (!node.children || node.children.length === 0) return node.is_done ? 100 : 0;
  const weighted = node.children.reduce((sum, c) => sum + (c.weight_percent / 100) * computeNodePercent(c), 0);
  return Math.round(weighted);
}

/**
 * Inline editor for one sibling group (all subtasks sharing a parent).
 * Hard-blocked from saving until the percentages add up to exactly 100 —
 * Sheila's explicit choice over just warning. Editing an existing group
 * pre-fills its current rows (ids included, so the save is an update, not a
 * delete-and-recreate); starting a brand new group opens with two blank rows.
 */
function GroupEditor({
  initialItems,
  saving,
  onCancel,
  onSave,
}: {
  initialItems: DraftItem[];
  saving: boolean;
  onCancel: () => void;
  onSave: (items: DraftItem[]) => void;
}) {
  const [rows, setRows] = useState<DraftItem[]>(
    initialItems.length > 0 ? initialItems : [{ title: "", weight_percent: 0 }, { title: "", weight_percent: 0 }],
  );

  const total = rows.reduce((sum, r) => sum + (Number(r.weight_percent) || 0), 0);
  const canSave = rows.length > 0 && rows.every((r) => r.title.trim()) && total === 100;

  const updateRow = (i: number, patch: Partial<DraftItem>) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { title: "", weight_percent: 0 }]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <div className="bg-white rounded-md border border-red-200 p-2 space-y-1.5 mt-1">
      {rows.map((row, i) => (
        <div key={row.id ?? `new-${i}`} className="flex items-center gap-1.5">
          <input
            value={row.title}
            onChange={(e) => updateRow(i, { title: e.target.value })}
            placeholder="Subtask name"
            className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-red-400"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={row.weight_percent}
            onChange={(e) => updateRow(i, { weight_percent: Number(e.target.value) })}
            className="w-14 shrink-0 border border-gray-200 rounded px-1.5 py-1 text-xs text-right focus:outline-none focus:border-red-400"
          />
          <span className="text-[10px] text-gray-400 shrink-0">%</span>
          <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-600 px-0.5 shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-0.5">
        <button onClick={addRow} className="text-[11px] font-semibold text-red-600 hover:text-red-700 flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add row
        </button>
        <span className={`text-[11px] font-semibold ${total === 100 ? "text-green-600" : "text-gray-400"}`}>{total}% of 100%</span>
      </div>
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
  canManage,
  canToggle,
  editingParentId,
  setEditingParentId,
  savingGroup,
  onToggleLeaf,
  onSaveGroup,
}: {
  node: TMSubtask;
  depth: number;
  canManage: boolean;
  canToggle: boolean;
  editingParentId: string | null | undefined;
  setEditingParentId: (id: string | null | undefined) => void;
  savingGroup: boolean;
  onToggleLeaf: (id: string, done: boolean) => void;
  onSaveGroup: (parentId: string | null, items: DraftItem[]) => void;
}) {
  const isLeaf = !node.children || node.children.length === 0;
  const percent = computeNodePercent(node);
  const isEditingChildren = editingParentId === node.id;

  return (
    <div style={{ marginLeft: (depth - 1) * 16 }}>
      <div className="flex items-center gap-2 py-1">
        {isLeaf ? (
          <input
            type="checkbox"
            checked={node.is_done}
            disabled={!canToggle}
            onChange={(e) => onToggleLeaf(node.id, e.target.checked)}
            className="accent-red-600 w-3.5 h-3.5 cursor-pointer disabled:cursor-default shrink-0"
          />
        ) : (
          <span className="text-[10px] font-semibold text-red-600 w-8 shrink-0 text-right">{percent}%</span>
        )}
        <span className={`text-xs flex-1 min-w-0 truncate ${isLeaf && node.is_done ? "text-gray-400 line-through" : "text-gray-700"}`}>{node.title}</span>
        <span className="text-[10px] text-gray-400 shrink-0">{node.weight_percent}%</span>
        {canManage && isLeaf && depth < 4 && (
          <button
            onClick={() => setEditingParentId(isEditingChildren ? undefined : node.id)}
            title="Break this subtask down further"
            className="text-gray-300 hover:text-red-600 shrink-0"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
        {canManage && !isLeaf && (
          <button
            onClick={() => setEditingParentId(isEditingChildren ? undefined : node.id)}
            title="Edit these subtasks"
            className="text-gray-300 hover:text-red-600 shrink-0"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>

      {isEditingChildren && (
        <div style={{ marginLeft: 16 }}>
          <GroupEditor
            initialItems={(node.children ?? []).map((c) => ({ id: c.id, title: c.title, weight_percent: c.weight_percent }))}
            saving={savingGroup}
            onCancel={() => setEditingParentId(undefined)}
            onSave={(items) => onSaveGroup(node.id, items)}
          />
        </div>
      )}

      {!isLeaf && !isEditingChildren && (
        <div>
          {(node.children ?? []).map((child) => (
            <SubtaskNode
              key={child.id}
              node={child}
              depth={depth + 1}
              canManage={canManage}
              canToggle={canToggle}
              editingParentId={editingParentId}
              setEditingParentId={setEditingParentId}
              savingGroup={savingGroup}
              onToggleLeaf={onToggleLeaf}
              onSaveGroup={onSaveGroup}
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
 * subtasks is Senior Management only, same tier as editing the task itself.
 * Every tick or structural save reuses the task's normal progress endpoint
 * under the hood (see the API routes), so auto-complete and recurring-task
 * cycling behave exactly as they do for the manual slider.
 */
export default function SubtaskPanel({
  task,
  canManage,
  canToggle,
  onChanged,
}: {
  task: TMTask;
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

  const afterMutation = (result?: { recurred?: boolean; next_due_date?: string | null }) => {
    queryClient.invalidateQueries({ queryKey });
    onChanged();
    if (result?.recurred && result.next_due_date) {
      toast.success(`Recurring task — next due date set to ${fmtDate(result.next_due_date)}`);
    }
  };

  const toggleLeaf = async (subtaskId: string, nextDone: boolean) => {
    try {
      const res = await api.patch(`/task-manager/tasks/${task.id}/subtasks/${subtaskId}`, { is_done: nextDone });
      afterMutation(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to update subtask");
    }
  };

  const saveGroup = async (parentId: string | null, items: DraftItem[]) => {
    setSavingGroup(true);
    try {
      const res = await api.put(`/task-manager/tasks/${task.id}/subtasks`, { parent_id: parentId, items });
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
          initialItems={tree.map((n) => ({ id: n.id, title: n.title, weight_percent: n.weight_percent }))}
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
          {tree.map((node) => (
            <SubtaskNode
              key={node.id}
              node={node}
              depth={1}
              canManage={canManage}
              canToggle={canToggle}
              editingParentId={editingParentId}
              setEditingParentId={setEditingParentId}
              savingGroup={savingGroup}
              onToggleLeaf={toggleLeaf}
              onSaveGroup={saveGroup}
            />
          ))}
        </div>
      )}
    </div>
  );
}
