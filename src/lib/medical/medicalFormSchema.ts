/**
 * Occupational medical examination form — same structural model as PIP forms
 * (sections of fields + repeating tables). Reuses pipFormSchema normalizers.
 */
export {
  type PipField as MedicalField,
  type PipFieldType as MedicalFieldType,
  type PipFieldsSection as MedicalFieldsSection,
  type PipFormSchema as MedicalFormSchema,
  type PipSection as MedicalSection,
  type PipTableColumn as MedicalTableColumn,
  type PipTableSection as MedicalTableSection,
  createBlankPipColumn as createBlankMedicalColumn,
  createBlankPipField as createBlankMedicalField,
  createBlankPipSection as createBlankMedicalSection,
  createEmptyPipFormSchema as createEmptyMedicalFormSchema,
  isSystemField,
  pipFieldLabel as medicalFieldLabel,
  PIP_FIELD_TYPE_OPTIONS as MEDICAL_FIELD_TYPE_OPTIONS,
  countPipFormFields as countMedicalFormFields,
} from "@/lib/appraisal/pipFormSchema";

import { normalizePipFormSchema, type PipFormSchema, type PipSection } from "@/lib/appraisal/pipFormSchema";
import {
  extractInvestigationDefsFromSection,
  normalizeInvestigationDefs,
  type InvestigationDef,
  type InvestigationsData,
} from "./medicalInvestigationDefs";

/**
 * Section keys whose real content is a custom-built component (not editable
 * schema fields) — e.g. Part 4 investigations deliberately has `fields: []`.
 * The shared PIP normalizer drops any "fields" section with zero fields
 * (treating it as junk), so we round-trip these through a temporary
 * placeholder field to keep the section alive, then strip it back to `[]`.
 */
const CUSTOM_EMPTY_FIELDS_SECTION_KEYS = new Set(["investigations"]);

/**
 * Medical-form-specific schema normalizer. Wraps the shared PIP normalizer
 * but preserves known custom sections (Part 4 investigations) that are
 * intentionally defined with an empty `fields` array, and round-trips the
 * admin-configured `investigationDefs` list — a side-channel property the
 * generic PIP section shape doesn't know about — through sanitization.
 */
export function normalizeMedicalFormSchema(raw: unknown): PipFormSchema | null {
  if (!raw || typeof raw !== "object") return null;
  const rawSections = Array.isArray((raw as { sections?: unknown }).sections)
    ? ((raw as { sections: unknown[] }).sections)
    : [];

  let rawInvestigationDefs: unknown;
  const patchedSections = rawSections.map((s) => {
    if (!s || typeof s !== "object") return s;
    const sec = s as Record<string, unknown>;
    const key = typeof sec.key === "string" ? sec.key : "";
    if (key === "investigations") rawInvestigationDefs = sec.investigationDefs;
    const isProtectedEmptySection =
      CUSTOM_EMPTY_FIELDS_SECTION_KEYS.has(key) &&
      sec.kind !== "table" &&
      (!Array.isArray(sec.fields) || sec.fields.length === 0);
    if (!isProtectedEmptySection) return s;
    return {
      ...sec,
      fields: [{ key: "__managed", label: "Managed automatically", type: "text" }],
    };
  });

  const normalized = normalizePipFormSchema({ ...(raw as object), sections: patchedSections });
  if (!normalized) return null;

  const sanitizedInvestigationDefs = normalizeInvestigationDefs(rawInvestigationDefs);

  const sections: PipSection[] = normalized.sections.map((s) => {
    if (s.kind === "fields" && CUSTOM_EMPTY_FIELDS_SECTION_KEYS.has(s.key)) {
      return { ...s, fields: [], investigationDefs: sanitizedInvestigationDefs } as unknown as PipSection;
    }
    return s;
  });

  return { ...normalized, sections };
}

/** Reads the admin-configured Part 4 investigation list off a schema,
 * falling back to the built-in reference list if none is configured yet. */
export function getInvestigationDefs(schema: PipFormSchema): InvestigationDef[] {
  const section = schema.sections.find((s) => s.key === "investigations");
  return extractInvestigationDefsFromSection(
    section as unknown as { investigationDefs?: unknown } | undefined,
  );
}

/** Returns a copy of the schema with Part 4's investigation list replaced —
 * used by the System Definitions editor when HR adds/edits/removes tests. */
export function setInvestigationDefs(schema: PipFormSchema, defs: InvestigationDef[]): PipFormSchema {
  return {
    ...schema,
    sections: schema.sections.map((s) =>
      s.key === "investigations" ? ({ ...(s as object), investigationDefs: defs } as unknown as PipSection) : s,
    ),
  };
}

export type MedicalFormResponses = {
  fields?: Record<string, string | null>;
  tables?: Record<string, Array<Record<string, string | number | null>>>;
  /** Part 4 — structured investigation results (replaces legacy investigations table). */
  investigations?: InvestigationsData;
};

export type MedicalReferralData = {
  full_name?: string;
  reference_number?: string;
  employee_id?: string;
  ghana_card?: string;
  date_of_birth?: string;
  gender?: string;
  position_offered?: string;
  department_site?: string;
  examination_type?: string;
  job_category?: string;
  designated_facility?: string;
  appointment_date?: string;
  referral_date?: string;
  issued_by?: string;
  issued_by_name?: string;
};

export type MedicalExaminationStatus = "draft" | "submitted";

export interface MedicalExamination {
  id: string;
  application_id: string;
  template_version_id: string | null;
  form_schema: import("@/lib/appraisal/pipFormSchema").PipFormSchema;
  referral_data: MedicalReferralData;
  form_responses: MedicalFormResponses;
  status: MedicalExaminationStatus;
  hospital_email: string | null;
  link_sent_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MedicalFormTemplate {
  id: string;
  name: string;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
}

/** A past examination cycle's frozen snapshot — archived when HR resends a
 * new link on top of an already-sent/submitted examination (medical_examinations
 * is one row per candidate, so the previous cycle would otherwise be lost). */
export interface MedicalExaminationHistoryEntry {
  id: string;
  application_id: string;
  examination_id: string | null;
  template_version_id: string | null;
  form_schema: import("@/lib/appraisal/pipFormSchema").PipFormSchema;
  referral_data: MedicalReferralData;
  form_responses: MedicalFormResponses;
  status: MedicalExaminationStatus;
  hospital_email: string | null;
  link_sent_at: string | null;
  submitted_at: string | null;
  archived_at: string;
  created_at: string;
}

export interface MedicalFormTemplateVersion {
  id: string;
  template_id: string;
  version_number: number;
  source_file_url: string | null;
  source_file_name: string | null;
  source_cloudinary_public_id: string | null;
  form_schema: import("@/lib/appraisal/pipFormSchema").PipFormSchema;
  extracted_at: string | null;
  published_at: string | null;
  published_by: string | null;
  published_by_name: string | null;
  created_at: string;
}
