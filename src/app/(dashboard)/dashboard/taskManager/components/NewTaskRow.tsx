"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { User } from "@/types";
import OwnerSelect from "./OwnerSelect";

export default function NewTaskRow({
  projectId,
  users,
  onCreated,
  onCancel,
}: {
  projectId: string;
  users: User[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Task name can't be empty");
      return;
    }
    setSaving(true);
    try {
      await api.post("/task-manager/tasks", {
        project_id: projectId,
        title: title.trim(),
        owner_id: ownerId,
        due_date: dueDate || null,
      });
      toast.success("Task added");
      setTitle("");
      setOwnerId(null);
      setDueDate("");
      onCreated();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to add task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_1fr_auto] gap-3 items-center px-3 py-2.5 bg-red-50/40 rounded-lg border border-dashed border-red-200">
      <div />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New task name…"
        className="border-2 border-red-600 rounded-md px-2 py-1.5 text-sm font-medium focus:outline-none"
        autoFocus
      />
      <OwnerSelect users={users} value={ownerId} onChange={setOwnerId} />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="border-2 border-red-600 rounded-md px-2 py-1.5 text-sm focus:outline-none"
      />
      <span className="text-[11px] text-gray-400 italic">Not Started</span>
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={handleCreate}
          disabled={saving}
          className="flex items-center gap-1 bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-60"
        >
          <Plus className="w-3.5 h-3.5" /> {saving ? "Adding…" : "Add"}
        </button>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
