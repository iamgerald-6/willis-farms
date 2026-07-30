"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Send, Loader2, FileBarChart } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { TMProject, TMMonthlyReport } from "@/types/taskManager";

function monthBounds(monthValue: string): { start: string; end: string } {
  const [year, month] = monthValue.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function MonthlyReportModal({ projects, onClose }: { projects: TMProject[]; onClose: () => void }) {
  const [month, setMonth] = useState(currentMonthValue());
  const [recipients, setRecipients] = useState("");
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery<{ reports: TMMonthlyReport[] }>({
    queryKey: ["tm-reports"],
    queryFn: async () => (await api.get("/task-manager/reports")).data,
  });

  const handleSend = async () => {
    const emails = recipients
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      toast.error("Add at least one recipient email");
      return;
    }
    const { start, end } = monthBounds(month);
    setSending(true);
    try {
      const res = await api.post("/task-manager/reports/send", { period_start: start, period_end: end, recipients: emails });
      toast.success(res.data.sent ? "Report emailed as a PDF attachment." : "Report generated and logged (email sending isn't configured yet — see setup docs).");
      queryClient.invalidateQueries({ queryKey: ["tm-reports"] });
      setRecipients("");
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to send report");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileBarChart className="w-4 h-4 text-red-600" />
            <h2 className="text-base font-bold text-gray-900">Monthly Report</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">
            Generates a PDF covering overall + project-by-project status for the selected month, and emails it to whoever you list below with a link back to this dashboard.
          </p>

          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">Send to (comma-separated emails)</label>
            <input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="e.g. gm@willsfarms.com, ops@willsfarms.com"
              className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={sending}
            className="w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Generating & sending…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Generate & Send
              </>
            )}
          </button>

          {(data?.reports.length ?? 0) > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Previously sent</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {data!.reports.map((r) => (
                  <div key={r.id} className="text-xs text-gray-600 flex items-center justify-between">
                    <span>
                      {new Date(r.period_start).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                    </span>
                    <span className="text-gray-400">{r.sent_to.length} recipient{r.sent_to.length === 1 ? "" : "s"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
