import { getModuleRegistrySync } from "@/lib/moduleRegistry";
import type { SystemConfigAuditEntry } from "./systemConfigAuditLog";

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deactivated: "Deactivated",
  reactivated: "Reactivated",
};

export const AUDIT_FIELD_LABEL: Record<string, string> = {
  annualLeaveCapDays: "Annual leave cap (days)",
  sectionWeightRules: "Section weight rules",
  sectionBaseWeights: "Section base weights",
  globalSectionWeights: "Global section weights",
  sectionContentOverrides: "Rating section content",
  competencyContentOverrides: "Competency sections",
  refereeReferenceConfig: "Referee reference config",
  applicationFormConfig: "Application form config",
  gradeLevelsConfig: "Grade levels",
  appraisalScopeConfig: "Appraisal scope config",
  form_definition: "Form layout",
  label: "Label",
  legacy_value: "Value code",
  sort_order: "Sort order",
  is_active: "Active",
  rules: "Rules",
};

export function auditFieldLabel(field: string): string {
  return AUDIT_FIELD_LABEL[field] ?? field;
}

function moduleLabel(moduleId: string): string {
  return getModuleRegistrySync().find((m) => m.id === moduleId)?.label ?? moduleId;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "string") return String(value);
  return JSON.stringify(value);
}

function formatChangedFieldsSummary(entry: SystemConfigAuditEntry): string {
  if (!entry.changed_fields?.length) return "—";
  return entry.changed_fields
    .map((field) => {
      const label = auditFieldLabel(field);
      const before = formatAuditValue(entry.previous_values?.[field]);
      const after = formatAuditValue(entry.new_values?.[field]);
      return `${label}: ${before} → ${after}`;
    })
    .join(" | ");
}

/** UTF-8 CSV with BOM so Excel opens accents and symbols correctly. */
export function auditEntriesToCsv(entries: SystemConfigAuditEntry[]): string {
  const headers = [
    "Date & time",
    "Section",
    "Entity",
    "Scope",
    "Action",
    "Changed fields",
    "Change summary",
    "Changed by",
  ];

  const rows = entries.map((entry) => [
    new Date(entry.performed_at).toLocaleString("en-GB"),
    moduleLabel(entry.module_id),
    entry.entity_label ?? entry.module_id,
    entry.config_scope,
    AUDIT_ACTION_LABEL[entry.action] ?? entry.action,
    (entry.changed_fields ?? []).map(auditFieldLabel).join("; ") || "—",
    formatChangedFieldsSummary(entry),
    entry.performed_by_name,
  ]);

  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map((cell) => csvCell(String(cell))).join(",")),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

export function auditReportFilename(moduleId?: string | null): string {
  const date = new Date().toISOString().slice(0, 10);
  if (moduleId) {
    const slug = moduleLabel(moduleId)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `system-definitions-audit-${slug}-${date}.csv`;
  }
  return `system-definitions-audit-${date}.csv`;
}
