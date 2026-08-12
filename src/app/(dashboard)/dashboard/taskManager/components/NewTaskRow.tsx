"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { User } from "@/types";
import { minTaskDate } from "@/lib/taskDateLimits";
import OwnerSelect from "./OwnerSelect";
import FrequencySelect from "./FrequencySelect";
import { TASK_TABLE_GRID_COLS } from "@/lib/taskManagerConstants";

export default function NewTaskRow({
  projectId,
  users,
  variant = "register",
  onCreated,
  onCancel,
}: {
  projectId: string;
  users: User[];
  variant?: "register" | "monitoring";
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [indicator, setIndicator] = useState("");
  const [frequency, setFrequency] = useState("");
  const [methodProvider, setMethodProvider] = useState("");
  // Monitoring items are recurring by nature (that's the whole point of a
  // monitoring schedule), so this only needs to be a user choice for
  // register-variant tasks — things like an annual permit renewal that
  // should cycle forward when completed instead of just closing.
  const [isRecurring, setIsRecurring] = useState(variant === "monitoring");
  const [saving, setSaving] = useState(false);
  const minDate = minTaskDate();
  // The due date picker's floor: never more than a year back, and never
  // earlier than whatever start date is already chosen.
  const dueMinDate = startDate && startDate > minDate ? startDate : minDate;

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Task name can't be empty");
      return;
    }
    if ((startDate && startDate < minDate) || (dueDate && dueDate < minDate)) {
      toast.error("Start and due dates can't be more than a year in the past");
      return;
    }
    if (startDate && dueDate && dueDate < startDate) {
      toast.error("Due date can't be earlier than the start date");
      return;
    }
    const recurring = variant === "monitoring" ? true : isRecurring;
    setSaving(true);
    try {
      await api.post("/task-manager/tasks", {
        project_id: projectId,
        title: title.trim(),
        owner_id: ownerId,
        start_date: startDate || null,
        due_date: dueDate || null,
        task_type: variant === "monitoring" ? "monitoring" : "general",
        is_recurring: recurring,
        ...(variant === "monitoring" && {
          indicator: indicator || null,
          method_provider: methodProvider || null,
        }),
        ...(recurring && { frequency: frequency || null }),
      });
      toast.success("Task added");
      setTitle("");
      setOwnerId(null);
      setStartDate("");
      setDueDate("");
      setIndicator("");
      setFrequency("");
      setMethodProvider("");
      setIsRecurring(variant === "monitoring");
      onCreated();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to add task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-red-50/40 rounded-lg border border-dashed border-red-200 px-3 py-2.5 space-y-3">
      {/* Mobile */}
      <div className="md:hidden space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={variant === "monitoring" ? "New monitoring item…" : "New task name…"}
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
              min={dueMinDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full border-2 border-red-600 rounded-md px-2 py-1.5 text-sm focus:outline-none"
            />
          </div>
        </div>
        {variant === "monitoring" && (
          <div className="space-y-2">
            <input value={indicator} onChange={(e) => setIndicator(e.target.value)} placeholder="Indicator" className="w-full border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none" />
            <FrequencySelect value={frequency} onChange={setFrequency} className="w-full border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none bg-white" />
            <input value={methodProvider} onChange={(e) => setMethodProvider(e.target.value)} placeholder="Method / provider" className="w-full border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none" />
          </div>
        )}
        {variant === "register" && (
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
        <div className="flex items-center gap-2">
          <button onClick={handleCreate} disabled={saving} className="flex-1 flex items-center justify-center gap-1 bg-red-600 text-white text-xs font-semibold px-3 py-2 rounded-md hover:bg-red-700 disabled:opacity-60">
            <Plus className="w-3.5 h-3.5" /> {saving ? "Adding…" : "Add"}
          </button>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block space-y-2">
      <div className={`grid ${TASK_TABLE_GRID_COLS} gap-3 items-center`}>
        <div />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={variant === "monitoring" ? "New monitoring item…" : "New task name…"}
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
          min={dueMinDate}
          onChange={(e) => setDueDate(e.target.value)}
          title="Due date"
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
      {variant === "monitoring" && (
        <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr_auto] gap-3 items-center">
          <div />
          <input
            value={indicator}
            onChange={(e) => setIndicator(e.target.value)}
            placeholder="Indicator (e.g. Air Quality)"
            className="border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none"
          />
          <input
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            placeholder="Frequency (e.g. Quarterly)"
            className="border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none"
          />
          <input
            value={methodProvider}
            onChange={(e) => setMethodProvider(e.target.value)}
            placeholder="Method / provider"
            className="border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none"
          />
          <div />
        </div>
      )}
      {variant === "register" && (
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
            <input
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              placeholder="Frequency (e.g. Annual, Quarterly)"
              className="border border-red-300 rounded-md px-2 py-1.5 text-xs focus:outline-none"
            />
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
