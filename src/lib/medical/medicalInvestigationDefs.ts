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
/** Per-parameter flag inside a panel (Full Blood Count, LFT, etc.). */
export const PANEL_FLAG = ["Normal", "Low", "High"] as const;

export type InvestigationDefKind = "select" | "text" | "findings_flag" | "panel";

export type PanelParameterDef = {
  key: string;
  label: string;
  /** Admin-set starting unit/reference range — hospital/lab can still override per exam. */
  defaultUnit?: string;
  defaultReferenceRange?: string;
};

export type InvestigationDef =
  | { id: string; label: string; kind: "select"; options: string[] }
  | { id: string; label: string; kind: "text"; placeholder?: string; allowComment?: boolean }
  | { id: string; label: string; kind: "findings_flag" }
  | { id: string; label: string; kind: "panel"; parameters: PanelParameterDef[] };

const MAX_INVESTIGATIONS = 40;
const MAX_PANEL_PARAMETERS = 20;

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

function normalizePanelParameter(raw: unknown, index: number, seen: Set<string>): PanelParameterDef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === "string" ? r.label.trim() : "";
  if (!label) return null;
  const key = uniqueKey(slugify(typeof r.key === "string" ? r.key : label, `param_${index}`), seen);
  const defaultUnit = typeof r.defaultUnit === "string" && r.defaultUnit.trim() ? r.defaultUnit.trim() : undefined;
  const defaultReferenceRange =
    typeof r.defaultReferenceRange === "string" && r.defaultReferenceRange.trim()
      ? r.defaultReferenceRange.trim()
      : undefined;
  return {
    key,
    label,
    ...(defaultUnit ? { defaultUnit } : {}),
    ...(defaultReferenceRange ? { defaultReferenceRange } : {}),
  };
}

function normalizeInvestigationDef(raw: unknown, index: number, seenIds: Set<string>): InvestigationDef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === "string" ? r.label.trim() : "";
  if (!label) return null;
  const id = uniqueKey(slugify(typeof r.id === "string" ? r.id : label, `investigation_${index}`), seenIds);

  const kind: InvestigationDefKind =
    r.kind === "select" || r.kind === "text" || r.kind === "findings_flag" || r.kind === "panel"
      ? r.kind
      : "text";

  if (kind === "select") {
    const options = Array.isArray(r.options)
      ? Array.from(
          new Set(
            r.options.filter((o): o is string => typeof o === "string" && !!o.trim()).map((o) => o.trim()),
          ),
        )
      : [];
    if (options.length === 0) return null; // a choice test needs at least one option
    return { id, label, kind, options };
  }

  if (kind === "panel") {
    const seenParamKeys = new Set<string>();
    const parameters = (Array.isArray(r.parameters) ? r.parameters : [])
      .slice(0, MAX_PANEL_PARAMETERS)
      .map((p, i) => normalizePanelParameter(p, i, seenParamKeys))
      .filter((p): p is PanelParameterDef => !!p);
    if (parameters.length === 0) return null; // a panel needs at least one parameter
    return { id, label, kind, parameters };
  }

  if (kind === "text") {
    const placeholder =
      typeof r.placeholder === "string" && r.placeholder.trim() ? r.placeholder.trim() : undefined;
    return { id, label, kind, ...(placeholder ? { placeholder } : {}), allowComment: r.allowComment === true };
  }

  return { id, label, kind: "findings_flag" };
}

/**
 * Coerces an arbitrary JSON payload (from a template schema, hand-authored
 * or round-tripped through normalizeMedicalFormSchema) into a well-formed
 * investigation-definition list. Lenient — drops anything malformed rather
 * than throwing, same philosophy as normalizePipFormSchema.
 */
export function normalizeInvestigationDefs(raw: unknown): InvestigationDef[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  return raw
    .slice(0, MAX_INVESTIGATIONS)
    .map((d, i) => normalizeInvestigationDef(d, i, seenIds))
    .filter((d): d is InvestigationDef => !!d);
}

/**
 * Deliberately lean starting point — NOT a full lab reporting system. Admins
 * can add/remove/reorder investigations and edit panel parameters from
 * System Definitions; this is only what "Reset to reference layout" seeds
 * and what legacy/empty schemas fall back to.
 */
export const MEDICAL_INVESTIGATION_DEFS: InvestigationDef[] = [
  { id: "blood_group", label: "Blood group", kind: "select", options: ["A", "B", "AB", "O"] },
  { id: "rh_factor", label: "Rh factor", kind: "select", options: ["Positive", "Negative"] },
  {
    id: "fbc",
    label: "Full blood count (FBC)",
    kind: "panel",
    parameters: [
      { key: "hb", label: "Haemoglobin (Hb)", defaultUnit: "g/dL", defaultReferenceRange: "13.0–17.0" },
      {
        key: "wbc",
        label: "White blood cell count (WBC)",
        defaultUnit: "×10⁹/L",
        defaultReferenceRange: "4.0–11.0",
      },
      { key: "platelets", label: "Platelets", defaultUnit: "×10⁹/L", defaultReferenceRange: "150–450" },
      { key: "hct", label: "Haematocrit / PCV", defaultUnit: "%", defaultReferenceRange: "40–52" },
      { key: "rbc", label: "RBC", defaultUnit: "×10¹²/L", defaultReferenceRange: "4.5–6.0" },
      { key: "mcv", label: "MCV", defaultUnit: "fL", defaultReferenceRange: "80–100" },
    ],
  },
  {
    id: "bue_creatinine",
    label: "BUE / Creatinine (kidney function)",
    kind: "panel",
    parameters: [
      { key: "urea", label: "Urea", defaultUnit: "mmol/L", defaultReferenceRange: "2.5–7.8" },
      { key: "creatinine", label: "Creatinine", defaultUnit: "µmol/L", defaultReferenceRange: "62–115" },
      { key: "sodium", label: "Sodium", defaultUnit: "mmol/L", defaultReferenceRange: "135–145" },
      { key: "potassium", label: "Potassium", defaultUnit: "mmol/L", defaultReferenceRange: "3.5–5.1" },
    ],
  },
  {
    id: "lft",
    label: "Liver function test (LFT)",
    kind: "panel",
    parameters: [
      { key: "alt", label: "ALT", defaultUnit: "U/L", defaultReferenceRange: "7–56" },
      { key: "ast", label: "AST", defaultUnit: "U/L", defaultReferenceRange: "10–40" },
      { key: "alp", label: "ALP", defaultUnit: "U/L", defaultReferenceRange: "44–147" },
      { key: "bilirubin", label: "Total bilirubin", defaultUnit: "µmol/L", defaultReferenceRange: "3.4–20.5" },
      { key: "albumin", label: "Albumin", defaultUnit: "g/L", defaultReferenceRange: "35–50" },
    ],
  },
  { id: "hepatitis_b", label: "Hepatitis B (HBsAg)", kind: "select", options: ["Positive", "Negative"] },
  { id: "hepatitis_c", label: "Hepatitis C", kind: "select", options: ["Positive", "Negative"] },
  {
    id: "lipid_profile",
    label: "Lipid profile",
    kind: "panel",
    parameters: [
      { key: "total_cholesterol", label: "Total cholesterol", defaultUnit: "mmol/L", defaultReferenceRange: "< 5.2" },
      { key: "hdl", label: "HDL", defaultUnit: "mmol/L", defaultReferenceRange: "> 1.0" },
      { key: "ldl", label: "LDL", defaultUnit: "mmol/L", defaultReferenceRange: "< 3.4" },
      { key: "triglycerides", label: "Triglycerides", defaultUnit: "mmol/L", defaultReferenceRange: "< 1.7" },
    ],
  },
  {
    id: "urine_re",
    label: "Urine R/E",
    kind: "panel",
    parameters: [
      { key: "appearance", label: "Appearance" },
      { key: "protein", label: "Protein" },
      { key: "glucose", label: "Glucose" },
      { key: "blood", label: "Blood" },
      { key: "ph", label: "pH", defaultReferenceRange: "4.5–8.0" },
      { key: "specific_gravity", label: "Specific gravity", defaultReferenceRange: "1.005–1.030" },
      { key: "wbc", label: "WBC", defaultUnit: "/hpf", defaultReferenceRange: "0–5" },
      { key: "rbc", label: "RBC", defaultUnit: "/hpf", defaultReferenceRange: "0–2" },
      { key: "bacteria", label: "Bacteria / other findings" },
    ],
  },
  {
    id: "hb_electrophoresis",
    label: "Hb electrophoresis (sickle cell status)",
    kind: "text",
    placeholder: "e.g. AA, AS, SS, AC",
    allowComment: true,
  },
  { id: "chest_xray", label: "Chest X-ray", kind: "findings_flag" },
  { id: "eye_screening", label: "Eye screening", kind: "findings_flag" },
  { id: "zoonotic_screen", label: "Zoonotic screen (per company protocol)", kind: "findings_flag" },
];

/**
 * Reads the investigation-def list off a template section, falling back to
 * the built-in reference list if the section has none configured yet (e.g.
 * a legacy schema saved before admin management of Part 4 existed).
 */
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

/** A fresh, blank investigation of the given kind — used by the admin editor's "Add" buttons. */
export function createBlankInvestigationDef(kind: InvestigationDefKind): InvestigationDef {
  if (kind === "select") {
    return { id: blankId("test"), label: "New investigation", kind, options: ["Positive", "Negative"] };
  }
  if (kind === "panel") {
    return {
      id: blankId("test"),
      label: "New panel",
      kind,
      parameters: [{ key: blankId("param"), label: "Parameter 1" }],
    };
  }
  if (kind === "findings_flag") {
    return { id: blankId("test"), label: "New investigation", kind };
  }
  return { id: blankId("test"), label: "New investigation", kind: "text" };
}

export function createBlankPanelParameter(): PanelParameterDef {
  return { key: blankId("param"), label: "New parameter" };
}

export type PanelParameterValue = {
  value?: string;
  unit?: string;
  reference_range?: string;
  flag?: string;
};

export type InvestigationEntry = {
  value?: string;
  /** Optional free-text comment — used by tests like Hb electrophoresis. */
  comment?: string;
  findings?: string;
  flag?: string;
  reference_range?: string;
  expanded?: boolean;
  parameters?: Record<string, PanelParameterValue>;
  /** Set when prefilled from lab report — cleared when user edits. */
  prefilled?: boolean;
};

/** A free-form investigation not covered by the configured list above. */
export type OtherInvestigationEntry = {
  id: string;
  name: string;
  result?: string;
  unit?: string;
  reference_range?: string;
  flag?: string;
};

export type LabReportAttachment = {
  secure_url: string;
  public_id?: string | null;
  original_name?: string;
  uploaded_at?: string;
};

export type InvestigationsData = {
  tests: Record<string, InvestigationEntry>;
  lab_reports?: LabReportAttachment[];
  /** Anything not covered by the configured investigation list. */
  other?: OtherInvestigationEntry[];
};

export function emptyInvestigationsData(): InvestigationsData {
  return { tests: {}, lab_reports: [], other: [] };
}
