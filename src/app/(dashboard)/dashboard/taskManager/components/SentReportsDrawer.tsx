"use client";

import { useQuery } from "@tanstack/react-query";
import { X, History } from "lucide-react";
import api from "@/lib/api";
import { ModalListSkeleton } from "@/components/skeletons/PageSkeletons";
import { TMMonthlyReport } from "@/types/taskManager";

// Same right-side drawer pattern as a task's "History" (see
// AuditLogDrawer.tsx) — a button opens this instead of a list sitting
// permanently in the send modal, so the modal stays focused on sending the
// next report.
export default function SentReportsDrawer({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useQuery<{ reports: TMMonthlyReport[] }>({
    queryKey: ["tm-reports"],
    queryFn: async () => (await api.get("/task-manager/reports")).data,
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
              <h3 className="text-sm font-bold text-gray-900">Sent Reports</h3>
              <p className="text-xs text-gray-500 mt-0.5">Monthly Task Manager reports, most recent first.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading && <ModalListSkeleton rows={4} />}
          {!isLoading && (data?.reports.length ?? 0) === 0 && <p className="text-sm text-gray-400">No reports sent yet.</p>}
          {data?.reports.map((r) => (
            <div key={r.id} className="border-l-2 border-red-200 pl-4 pb-1">
              <p className="text-sm font-semibold text-gray-900">
                {new Date(r.period_start).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {r.generated_by_name} &middot; {new Date(r.generated_at).toLocaleString("en-GB")}
              </p>
              <p className="text-xs text-gray-600 mt-2">
                Sent to {r.sent_to.length} recipient{r.sent_to.length === 1 ? "" : "s"}
              </p>
              {r.sent_to.length > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">{r.sent_to.join(", ")}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
