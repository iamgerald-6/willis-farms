"use client";

import { useQuery } from "@tanstack/react-query";
import { X, History } from "lucide-react";
import api from "@/lib/api";
import { Content, SopAuditLogEntry } from "@/types";

const ACTION_LABEL: Record<SopAuditLogEntry["action"], string> = {
  added: "Added",
  edited: "Edited",
  archived: "Archived",
  restored: "Restored",
  deleted: "Deleted",
};

export default function SOPAuditLogDrawer({
  content,
  onClose,
}: {
  content: Content;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useQuery<{
    entries: SopAuditLogEntry[];
  }>({
    queryKey: ["sop-audit", content.id],
    queryFn: async () => (await api.get(`/sop/${content.id}/audit`)).data,
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
              <p className="text-xs text-gray-500 mt-0.5">{content.title}</p>
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
          {isLoading && (
            <div className="space-y-3 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg" />
              ))}
            </div>
          )}
          {isError && (
            <p className="text-sm text-red-500">
              Couldn&apos;t load history:{" "}
              {(error as any)?.response?.data?.error ??
                (error as any)?.message ??
                "Unknown error"}
            </p>
          )}
          {!isLoading && !isError && (data?.entries.length ?? 0) === 0 && (
            <p className="text-sm text-gray-400">No history logged yet.</p>
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
