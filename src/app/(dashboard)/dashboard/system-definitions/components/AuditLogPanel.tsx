"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, History, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { getModuleRegistrySync } from "@/lib/moduleRegistry";
import type { SystemConfigAuditEntry } from "@/lib/systemDefinitions";
import {
  AUDIT_ACTION_LABEL,
  auditFieldLabel,
  auditReportFilename,
} from "@/lib/systemDefinitions/auditLogExport";
import { ModalListSkeleton } from "@/components/skeletons/PageSkeletons";

const ACTION_COLOR: Record<string, string> = {
  created: "bg-blue-50 text-blue-700 border border-blue-200",
  updated: "bg-amber-50 text-amber-700 border border-amber-200",
  deactivated: "bg-gray-100 text-gray-600 border border-gray-200",
  reactivated: "bg-green-50 text-green-700 border border-green-200",
};

function fieldLabel(field: string): string {
  return auditFieldLabel(field);
}

function ValueDisplay({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-gray-400">—</span>;
  }
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (typeof value === "number" || typeof value === "string") {
    return <>{String(value)}</>;
  }
  // Objects/arrays (e.g. sectionWeightRules, gradeLevelsConfig) — too large
  // to diff inline, show a collapsible raw view instead.
  return (
    <details className="inline">
      <summary className="cursor-pointer text-blue-600 hover:text-blue-700 inline">
        View details
      </summary>
      <pre className="mt-1.5 p-2 bg-gray-50 border border-gray-200 rounded-lg text-[11px] text-gray-700 overflow-x-auto max-w-lg whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function AuditEntryRow({ entry }: { entry: SystemConfigAuditEntry }) {
  return (
    <div className="border-l-2 border-red-200 pl-4 py-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${ACTION_COLOR[entry.action] ?? "bg-gray-100 text-gray-600 border border-gray-200"}`}
        >
          {AUDIT_ACTION_LABEL[entry.action] ?? entry.action}
        </span>
        <p className="text-sm font-semibold text-gray-900">
          {entry.entity_label ?? entry.module_id}
        </p>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {entry.performed_by_name} &middot;{" "}
        {new Date(entry.performed_at).toLocaleString("en-GB")}
      </p>
      {entry.changed_fields && entry.changed_fields.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {entry.changed_fields.map((field) => (
            <div key={field} className="text-xs text-gray-600">
              <span className="font-medium">{fieldLabel(field)}:</span>{" "}
              <span className="line-through text-gray-400">
                <ValueDisplay value={entry.previous_values?.[field]} />
              </span>{" "}
              →{" "}
              <span className="text-gray-800">
                <ValueDisplay value={entry.new_values?.[field]} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AuditLogPanel() {
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const modules = useMemo(() => getModuleRegistrySync(), []);

  const { data, isLoading, isFetching } = useQuery<{
    entries: SystemConfigAuditEntry[];
    error?: string;
  }>({
    queryKey: ["system-config-audit-log", moduleFilter],
    queryFn: async () => {
      const res = await api.get("/system-definitions/audit-log", {
        params: moduleFilter ? { module_id: moduleFilter } : undefined,
      });
      return res.data;
    },
  });

  const entries = data?.entries ?? [];
  const setupError = data?.error;

  const handleDownloadReport = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await api.get("/system-definitions/audit-log", {
        params: {
          format: "csv",
          ...(moduleFilter ? { module_id: moduleFilter } : {}),
        },
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = auditReportFilename(moduleFilter || null);
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not download the audit report.";
      setDownloadError(message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <History className="w-5 h-5 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900">Audit log</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Every save made in System Definitions — old value, new value,
              who changed it, and when. Download a report to share with auditors
              without giving them platform access.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 min-w-0">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Filter by section
            </label>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="w-full sm:w-72 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              <option value="">All sections</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleDownloadReport()}
            disabled={downloading || !!setupError}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {downloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Preparing…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download report
              </>
            )}
          </button>
        </div>
        {downloadError && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {downloadError}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {isLoading ? (
          <ModalListSkeleton rows={5} />
        ) : setupError ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {setupError}
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-6 text-center">
            No changes logged yet
            {moduleFilter ? " for this section" : ""}.
          </p>
        ) : (
          <div className="space-y-4">
            {isFetching && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Refreshing…
              </div>
            )}
            {entries.map((entry) => (
              <AuditEntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
