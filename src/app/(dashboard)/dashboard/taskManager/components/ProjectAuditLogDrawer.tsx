"use client";

import { useQuery } from "@tanstack/react-query";
import { X, History } from "lucide-react";
import api from "@/lib/api";
import { ModalListSkeleton } from "@/components/skeletons/PageSkeletons";
import { TMProjectAuditLogEntry, TMProject } from "@/types/taskManager";

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  renamed: "Renamed",
  archived: "Archived",
  restored: "Restored",
};

const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  description: "Description",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function ProjectAuditLogDrawer({
  project,
  onClose,
}: {
  project: TMProject;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<{ entries: TMProjectAuditLogEntry[] }>({
    queryKey: ["project-audit", project.id],
    queryFn: async () =>
      (await api.get(`/task-manager/projects/${project.id}/audit`)).data,
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
              <p className="text-xs text-gray-500 mt-0.5">{project.name}</p>
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
          {isLoading && <ModalListSkeleton rows={4} />}
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
                        {formatValue(entry.previous_values?.[field])}
                      </span>{" "}
                      →{" "}
                      <span className="text-gray-800">
                        {formatValue(entry.new_values?.[field])}
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
