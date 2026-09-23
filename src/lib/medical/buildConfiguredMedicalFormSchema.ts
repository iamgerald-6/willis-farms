import type { PipSection } from "@/lib/appraisal/pipFormSchema";
import type { MedicalFormSchema } from "./medicalFormSchema";
import { getInvestigationDefs } from "./medicalFormSchema";
import {
  CLINICAL_SYSTEM_ROWS,
  MEDICAL_HISTORY_ITEMS,
  resolveMedicalJobCategory,
} from "./medicalFormDefaults";
import type { InvestigationDef } from "./medicalInvestigationDefs";
import {
  type MedicalExamComponentId,
  type MedicalFormConfig,
  medicalJobCategoryLetter,
  normalizeIncludedComponents,
} from "./medicalExamRequirementsMatrix";

const HISTORY_ROW_BY_COMPONENT: Partial<Record<MedicalExamComponentId, string>> = {
  tetanus: "Tetanus vaccination in the last 10 years",
  epilepsy: "Epilepsy, fits, blackouts, or fainting episodes",
  zoonotic_screening: "Prior work with livestock; any zoonotic illness (e.g. brucellosis)",
};

const SYSTEM_ROW_BY_COMPONENT: Partial<Record<MedicalExamComponentId, string>> = {
  respiratory: "Respiratory",
  musculoskeletal: "Musculoskeletal (incl. lifting capacity)",
  skin: "Skin",
};

const VITAL_FIELD_KEYS_BY_COMPONENT: Partial<Record<MedicalExamComponentId, string[]>> = {
  vision: ["visual_acuity_right", "visual_acuity_left"],
  hearing: ["hearing_left", "hearing_right"],
};

const PART4_INVESTIGATION_IDS = [
  "blood_group",
  "rh_factor",
  "fbc",
  "bue_creatinine",
  "lft",
  "hepatitis_b",
  "hepatitis_c",
  "lipid_profile",
  "urine_re",
  "hb_electrophoresis",
  "chest_xray",
  "eye_screening",
] as const;

const ZOONOTIC_INVESTIGATION_ID = "zoonotic_screen";

function includedSet(components: MedicalExamComponentId[]): Set<MedicalExamComponentId> {
  return new Set(components);
}

function filterHistoryItems(included: Set<MedicalExamComponentId>): string[] {
  return MEDICAL_HISTORY_ITEMS.filter((item) => {
    for (const [componentId, label] of Object.entries(HISTORY_ROW_BY_COMPONENT) as [
      MedicalExamComponentId,
      string,
    ][]) {
      if (item === label && !included.has(componentId)) return false;
    }
    return true;
  });
}

function filterSystemRows(included: Set<MedicalExamComponentId>): string[] {
  return CLINICAL_SYSTEM_ROWS.filter((row) => {
    for (const [componentId, label] of Object.entries(SYSTEM_ROW_BY_COMPONENT) as [
      MedicalExamComponentId,
      string,
    ][]) {
      if (row === label && !included.has(componentId)) return false;
    }
    return true;
  });
}

function filterInvestigationDefs(
  defs: InvestigationDef[],
  included: Set<MedicalExamComponentId>,
): InvestigationDef[] {
  const includePart4 = included.has("part4_standard_panel");
  const includeZoonotic = included.has("zoonotic_screening");

  return defs.filter((def) => {
    if (def.id === ZOONOTIC_INVESTIGATION_ID) return includeZoonotic;
    if ((PART4_INVESTIGATION_IDS as readonly string[]).includes(def.id)) return includePart4;
    return true;
  });
}

function filterVitalFieldKeys(included: Set<MedicalExamComponentId>): Set<string> {
  const hidden = new Set<string>();
  for (const [componentId, keys] of Object.entries(VITAL_FIELD_KEYS_BY_COMPONENT) as [
    MedicalExamComponentId,
    string[],
  ][]) {
    if (!included.has(componentId)) {
      for (const key of keys) hidden.add(key);
    }
  }
  return hidden;
}

type TableSectionWithRows = PipSection & { tableRowLabels?: string[] };

/** Build a hospital-facing schema containing only HR-approved components. */
export function buildConfiguredMedicalFormSchema(
  baseSchema: MedicalFormSchema,
  includedComponents: MedicalExamComponentId[],
): MedicalFormSchema {
  const included = includedSet(includedComponents);
  const hiddenVitalKeys = filterVitalFieldKeys(included);
  const historyItems = filterHistoryItems(included);
  const systemRows = filterSystemRows(included);

  const sections = baseSchema.sections.map((section) => {
    if (section.kind === "fields" && section.key === "clinical_vitals") {
      return {
        ...section,
        fields: section.fields.filter((field) => !hiddenVitalKeys.has(field.key)),
      };
    }

    if (section.kind === "table" && section.key === "medical_history") {
      return {
        ...section,
        minRows: historyItems.length,
        tableRowLabels: historyItems,
      } as TableSectionWithRows;
    }

    if (section.kind === "table" && section.key === "clinical_systems") {
      return {
        ...section,
        minRows: systemRows.length,
        tableRowLabels: systemRows,
      } as TableSectionWithRows;
    }

    if (section.kind === "fields" && section.key === "investigations") {
      const defs = filterInvestigationDefs(getInvestigationDefs(baseSchema), included);
      return {
        ...section,
        fields: [],
        investigationDefs: defs,
      } as unknown as PipSection;
    }

    return section;
  });

  return { ...baseSchema, sections };
}

export function buildMedicalFormConfig(params: {
  jobCategory: string;
  includedComponents: MedicalExamComponentId[];
  configuredBy?: string;
}): MedicalFormConfig | null {
  const letter = medicalJobCategoryLetter(params.jobCategory);
  if (!letter) return null;

  const resolvedCategory = resolveMedicalJobCategory(params.jobCategory) ?? params.jobCategory;

  return {
    job_category: resolvedCategory,
    job_category_letter: letter,
    included_components: normalizeIncludedComponents(letter, params.includedComponents),
    configured_at: new Date().toISOString(),
    configured_by: params.configuredBy,
  };
}
