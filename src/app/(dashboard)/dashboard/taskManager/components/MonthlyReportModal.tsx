"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Send, Loader2, FileBarChart, History } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { TMProject } from "@/types/taskManager";
import { User } from "@/types";
import type { OrgCustomListType, OrgCustomListItem } from "@/lib/organizationalStructureCustomLists";
import { isHumanResourceRoleLabel, isExecutiveRoleLabel } from "@/lib/userRoleAccessControl";
import SentReportsDrawer from "./SentReportsDrawer";
import StaffMultiSelect from "./StaffMultiSelect";

type MeSiteScope = {
  site_id?: number | string | null;
  is_headquarters_site?: boolean;
};

// Mirrors AutomationSettingsModal's own local convention — the <select>
// can't hold a real null, so the company-wide option is this sentinel
// string and gets translated to site_id: null at the API boundary.
const COMPANY_WIDE = "company";

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

export default function MonthlyReportModal({
  projects,
  users,
  onClose,
}: {
  projects: TMProject[];
  users: User[];
  onClose: () => void;
}) {
  const [month, setMonth] = useState(currentMonthValue());
  const [recipients, setRecipients] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedSiteKey, setSelectedSiteKey] = useState<string>(COMPANY_WIDE);
  const queryClient = useQueryClient();

  const { data: me } = useQuery<MeSiteScope>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/me")).data,
  });
  const isAllSitesCaller = me?.is_headquarters_site === true;

  // Fetched regardless of caller type now — the "Send to" recipient picker
  // needs site labels for every candidate, not just for the (HQ-only)
  // "Report for" site switcher below.
  const { data: listTypes = [] } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => (await api.get("/organizational-structure/custom-list-types")).data.data,
  });
  const sitesListType = listTypes.find((lt) => lt.table_name === "sites");
  const { data: sites = [] } = useQuery<OrgCustomListItem[]>({
    queryKey: ["org_custom_list_items", sitesListType?.id],
    queryFn: async () => (await api.get(`/organizational-structure/custom-list-types/${sitesListType!.id}/items`)).data.data,
    enabled: !!sitesListType,
  });
  const siteLabelById = new Map(sites.map((s) => [String(s.id), s.label]));
  const siteLabelByUserId: Record<string, string> = {};
  for (const u of users) {
    if (u.site_id != null) {
      const label = siteLabelById.get(String(u.site_id));
      if (label) siteLabelByUserId[u.user_id] = label;
    }
  }

  // Monthly report recipients: only Human Resource and Executive Role
  // staff — same rule as AutomationSettingsModal's "Send to" list.
  const reportRecipientCandidates = users.filter(
    (u) => isHumanResourceRoleLabel(u.user_role_label) || isExecutiveRoleLabel(u.user_role_label),
  );

  const handleSend = async () => {
    if (recipients.length === 0) {
      toast.error("Select at least one recipient");
      return;
    }
    const { start, end } = monthBounds(month);
    setSending(true);
    try {
      const res = await api.post("/task-manager/reports/send", {
        period_start: start,
        period_end: end,
        recipients,
        site_id: selectedSiteKey === COMPANY_WIDE ? null : Number(selectedSiteKey),
      });
      toast.success(res.data.sent ? "Report emailed as a PDF attachment." : "Report generated and logged (email sending isn't configured yet — see setup docs).");
      queryClient.invalidateQueries({ queryKey: ["tm-reports"] });
      setRecipients([]);
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
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHistoryOpen(true)}
              title="Sent reports"
              className="p-1.5 rounded-full border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400"
            >
              <History className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">
            Generates a PDF covering overall + project-by-project status for the selected month, and emails it to whoever you list below with a link back to this dashboard.
          </p>

          {isAllSitesCaller && (
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">Report for</label>
              <select
                value={selectedSiteKey}
                onChange={(e) => setSelectedSiteKey(e.target.value)}
                className="w-full border border-gray-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value={COMPANY_WIDE}>Company-wide (every project)</option>
                {sites.map((site) => (
                  <option key={site.id} value={String(site.id)}>
                    {site.label}
                  </option>
                ))}
              </select>
            </div>
          )}

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
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">Send to</label>
            <StaffMultiSelect
              users={reportRecipientCandidates}
              selectedEmails={recipients}
              onChange={setRecipients}
              placeholder="Select Human Resource or Executive staff…"
              siteLabelByUserId={siteLabelByUserId}
            />
            <p className="text-xs text-gray-400 mt-1">
              Only Human Resource and Executive Role staff are eligible — each shown with their site.
            </p>
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

        </div>
      </div>

      {historyOpen && <SentReportsDrawer onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
