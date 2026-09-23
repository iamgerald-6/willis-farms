/**
 * Investigation field definitions — Part 4 of the occupational medical form.
 *
 * Admin-configurable: the list actually used on a given hospital form comes
 * from that form's template schema (see medicalFormSchema.ts
 * `getInvestigationDefs`), which HR edits from System Definitions via
 * MedicalInvestigationDefsEditor. MEDICAL_INVESTIGATION_DEFS below is only
 * the starting point used by "Reset to reference layout" and as a fallback
 * for legacy/empty schemas — it is not hardcoded into the rendered form.
 */

export const NORMAL_ABNORMAL = ["Normal", "Abnormal"] as const;

/** @deprecated Legacy panel submissions may still store per-parameter flags. */
export const PANEL_FLAG = ["Normal", "Low", "High"] as const;

export const INVESTIGATION_RESULT_SUMMARY_PLACEHOLDER = "Result summary";

export const HB_ELECTROPHORESIS_OPTIONS = ["AA", "AS", "AC", "SS", "CC", "SC"] as const;

export const HB_ELECTROPHORESIS_ID = "hb_electrophoresis";

function coerceHbElectrophoresisDef(def: InvestigationDef): InvestigationDef {
  if (def.id !== HB_ELECTROPHORESIS_ID) return def;
  return {
    id: HB_ELECTROPHORESIS_ID,
    label: def.label.trim() || "Hb electrophoresis (sickle cell status)",
    kind: "select",
    options: [...HB_ELECTROPHORESIS_OPTIONS],
  };
}

export type InvestigationDefKind =
  | "select"
  | "text"
  | "findings_flag"
  | "result_flag"
  | "panel";

/** @deprecated Legacy panel definitions — normalized to result_flag on read. */
export type PanelParameterDef = {
  key: string;
  label: string;
  defaultUnit?: string;
  defaultReferenceRange?: string;
};

export type InvestigationDef =
  | { id: string; label: string; kind: "select"; options: string[]; allowComment?: boolean }
  | { id: string; label: string; kind: "text"; placeholder?: string; allowComment?: boolean }
  | { id: string; label: string; kind: "findings_flag" }
  | { id: string; label: string; kind: "result_flag"; placeholder?: string }
  | { id: string; label: string; kind: "panel"; parameters: PanelParameterDef[] };

const MAX_INVESTIGATIONS = 40;

function slugify(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function uniqueKey(base: string, seen: Set<string>): string {
  let key = base;
  let i = 2;
  while (seen.has(key)) {
    key = `${base}_${i}`;
    i += 1;
  }
  seen.add(key);
  return key;
}

function normalizeInvestigationDef(raw: unknown, index: number, seenIds: Set<string>): InvestigationDef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === "string" ? r.label.trim() : "";
  if (!label) return null;
  const id = uniqueKey(slugify(typeof r.id === "string" ? r.id : label, `investigation_${index}`), seenIds);

  let kind: InvestigationDefKind =
    r.kind === "select" ||
    r.kind === "text" ||
    r.kind === "findings_flag" ||
    r.kind === "result_flag" ||
    r.kind === "panel"
      ? r.kind
      : "text";

  // Legacy panel definitions → flat result + flag on the hospital form.
  if (kind === "panel") {
    kind = "result_flag";
  }

  if (kind === "select") {
    const options = Array.isArray(r.options)
      ? Array.from(
          new Set(
            r.options.filter((o): o is string => typeof o === "string" && !!o.trim()).map((o) => o.trim()),
          ),
        )
      : [];
    if (options.length === 0) return null;
    return {
      id,
      label,
      kind,
      options,
      allowComment: r.allowComment === true,
    };
  }

  if (kind === "result_flag") {
    const placeholder =
      typeof r.placeholder === "string" && r.placeholder.trim()
        ? r.placeholder.trim()
        : INVESTIGATION_RESULT_SUMMARY_PLACEHOLDER;
    return { id, label, kind, placeholder };
  }

  if (kind === "text") {
    const placeholder =
      typeof r.placeholder === "string" && r.placeholder.trim() ? r.placeholder.trim() : undefined;
    return { id, label, kind, ...(placeholder ? { placeholder } : {}), allowComment: r.allowComment === true };
  }

  return { id, label, kind: "findings_flag" };
}

export function normalizeInvestigationDefs(raw: unknown): InvestigationDef[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  return raw
    .slice(0, MAX_INVESTIGATIONS)
    .map((d, i) => normalizeInvestigationDef(d, i, seenIds))
    .filter((d): d is InvestigationDef => !!d)
    .map(coerceHbElectrophoresisDef);
}

export const MEDICAL_INVESTIGATION_DEFS: InvestigationDef[] = [
  { id: "blood_group", label: "Blood group", kind: "select", options: ["A", "B", "AB", "O"] },
  { id: "rh_factor", label: "Rh factor", kind: "select", options: ["Positive", "Negative"] },
  { id: "fbc", label: "Full blood count (FBC)", kind: "result_flag" },
  { id: "bue_creatinine", label: "BUE / Creatinine (kidney function)", kind: "result_flag" },
  { id: "lft", label: "Liver function test (LFT)", kind: "result_flag" },
  { id: "hepatitis_b", label: "Hepatitis B (HBsAg)", kind: "select", options: ["Positive", "Negative"] },
  { id: "hepatitis_c", label: "Hepatitis C", kind: "select", options: ["Positive", "Negative"] },
  { id: "lipid_profile", label: "Lipid profile", kind: "result_flag" },
  { id: "urine_re", label: "Urine R/E", kind: "result_flag" },
  {
    id: HB_ELECTROPHORESIS_ID,
    label: "Hb electrophoresis (sickle cell status)",
    kind: "select",
    options: [...HB_ELECTROPHORESIS_OPTIONS],
  },
  { id: "chest_xray", label: "Chest X-ray", kind: "findings_flag" },
  { id: "eye_screening", label: "Eye screening", kind: "findings_flag" },
  { id: "zoonotic_screen", label: "Zoonotic screen (per company protocol)", kind: "findings_flag" },
];

export function extractInvestigationDefsFromSection(
  section: { investigationDefs?: unknown } | null | undefined,
): InvestigationDef[] {
  const defs = normalizeInvestigationDefs(section?.investigationDefs);
  return defs.length > 0 ? defs : MEDICAL_INVESTIGATION_DEFS;
}

let blankIdCounter = 0;
function blankId(prefix: string): string {
  blankIdCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${blankIdCounter}`;
}

export function createBlankInvestigationDef(kind: InvestigationDefKind): InvestigationDef {
  if (kind === "select") {
    return { id: blankId("test"), label: "New investigation", kind, options: ["Positive", "Negative"] };
  }
  if (kind === "result_flag") {
    return {
      id: blankId("test"),
      label: "New investigation",
      kind,
      placeholder: INVESTIGATION_RESULT_SUMMARY_PLACEHOLDER,
    };
  }
  if (kind === "findings_flag") {
    return { id: blankId("test"), label: "New investigation", kind };
  }
  if (kind === "panel") {
    return { id: blankId("test"), label: "New investigation", kind: "result_flag" };
  }
  return { id: blankId("test"), label: "New investigation", kind: "text" };
}

/** @deprecated Legacy panel parameter editor only. */
export function createBlankPanelParameter(): PanelParameterDef {
  return { key: blankId("param"), label: "New parameter" };
}

/** @deprecated Legacy panel submissions. */
export type PanelParameterValue = {
  value?: string;
  unit?: string;
  reference_range?: string;
  flag?: string;
};

export type InvestigationEntry = {
  value?: string;
  comment?: string;
  findings?: string;
  flag?: string;
  /** @deprecated Legacy panel / upload-prefill data. */
  reference_range?: string;
  expanded?: boolean;
  parameters?: Record<string, PanelParameterValue>;
  prefilled?: boolean;
};

export type OtherInvestigationEntry = {
  id: string;
  name: string;
  result?: string;
  flag?: string;
  /** @deprecated Legacy submissions. */
  unit?: string;
  reference_range?: string;
};

export type MedicalAttachment = {
  secure_url: string;
  public_id?: string | null;
  original_name?: string;
  uploaded_at?: string;
};

/** @deprecated Use MedicalAttachment on responses.attachments. */
export type LabReportAttachment = MedicalAttachment;

export type InvestigationsData = {
  tests: Record<string, InvestigationEntry>;
  /** @deprecated Migrated to responses.attachments — kept for legacy reads. */
  lab_reports?: MedicalAttachment[];
  other?: OtherInvestigationEntry[];
};

export function emptyInvestigationsData(): InvestigationsData {
  return { tests: {}, other: [] };
}

/** Plain-text result summary for a configured investigation row. */
export function investigationResultSummary(
  def: InvestigationDef,
  entry: InvestigationEntry,
): string {
  if (def.kind === "findings_flag") return entry.findings?.trim() ?? "";
  const value = entry.value?.trim() ?? "";
  const comment = entry.comment?.trim() ?? "";
  if (value && comment) return `${value} — ${comment}`;
  return value || comment;
}

export function investigationRowHasData(
  def: InvestigationDef,
  entry: InvestigationEntry,
): boolean {
  return !!(investigationResultSummary(def, entry) || entry.flag?.trim());
}
