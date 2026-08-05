"use client";

import { useQuery } from "@tanstack/react-query";
import { X, History } from "lucide-react";
import api from "@/lib/api";
import { TMAuditLogEntry, TMTask } from "@/types/taskManager";

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  edited: "Edited",
  archived: "Archived",
  deleted: "Deleted",
  restored: "Restored",
  completed: "Marked complete",
};

const FIELD_LABEL: Record<string, string> = {
  title: "Task",
  owner_id: "Owner",
  due_date: "Due date",
  description: "Description",
  lifecycle_status: "Status",

  project_id: "Project",
  task_type: "Tab",
};

const TASK_TYPE_LABEL: Record<string, string> = {
  obligation: "Obligation Register",
  monitoring: "Monitoring Schedule",
  general: "General",
};

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "due_date") {
    const d = new Date(String(value));
    return isNaN(d.getTime())
      ? String(value)
      : d.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
  }
  if (field === "task_type")
    return TASK_TYPE_LABEL[String(value)] ?? String(value);
  return String(value);
}

export default function AuditLogDrawer({
  task,
  onClose,
}: {
  task: TMTask;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<{ entries: TMAuditLogEntry[] }>({
    queryKey: ["task-audit", task.id],
    queryFn: async () =>
      (await api.get(`/task-manager/tasks/${task.id}/audit`)).data,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full shadow-xl flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">History</h3>
              <p className="text-xs text-gray-500 mt-0.5">{task.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
          {!isLoading && (data?.entries.length ?? 0) === 0 && (
            <p className="text-sm text-gray-400">No changes logged yet.</p>
          )}
          {data?.entries.map((entry) => (
            <div key={entry.id} className="border-l-2 border-red-200 pl-4 pb-1">
              <p className="text-sm font-semibold text-gray-900">
                {ACTION_LABEL[entry.action] ?? entry.action}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {entry.performed_by_name} &middot;{" "}
                {new Date(entry.performed_at).toLocaleString("en-GB")}
              </p>
              {entry.changed_fields && entry.changed_fields.length > 0 && (
                <div className="mt-2 space-y-1">
                  {entry.changed_fields.map((field) => (
                    <p key={field} className="text-xs text-gray-600">
                      <span className="font-medium">
                        {FIELD_LABEL[field] ?? field}:
                      </span>{" "}
                      <span className="line-through text-gray-400">
                        {formatValue(field, entry.previous_values?.[field])}
                      </span>{" "}
                      →{" "}
                      <span className="text-gray-800">
                        {formatValue(field, entry.new_values?.[field])}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
