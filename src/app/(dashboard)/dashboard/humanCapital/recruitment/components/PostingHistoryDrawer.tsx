"use client";

import { X, History } from "lucide-react";
import type { JobPosting, PostingHistoryEntry } from "@/lib/careers/jobPostings";

const EVENT_LABEL: Record<PostingHistoryEntry["event"], string> = {
  opened: "Opened",
  republished: "Republished",
  closed: "Closed",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Accra",
  });
}

// Same right-side slide-in drawer pattern used for history logs elsewhere in
// the app (e.g. Task Manager's AuditLogDrawer) — kept visually consistent
// throughout. Reads posting.history directly rather than a separate fetch,
// since the postings list already has it.
export default function PostingHistoryDrawer({
  posting,
  onClose,
}: {
  posting: JobPosting;
  onClose: () => void;
}) {
  const entries = posting.history ?? [];

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
              <p className="text-xs text-gray-500 mt-0.5">{posting.title}</p>
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
          {entries.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing logged yet.</p>
          ) : (
            entries.map((entry, i) => (
              <div key={i} className="border-l-2 border-red-200 pl-4 pb-1">
                <p className="text-sm font-semibold text-gray-900">
                  {EVENT_LABEL[entry.event] ?? entry.event}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {entry.by.name ?? entry.by.email ?? "Unknown"} &middot;{" "}
                  {formatWhen(entry.at)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
