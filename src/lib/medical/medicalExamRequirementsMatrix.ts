import { MEDICAL_JOB_CATEGORY_OPTIONS, resolveMedicalJobCategory } from "./medicalFormDefaults";

/** Job category letters from the Part 1 referral matrix (A–D). */
export type MedicalJobCategoryLetter = "A" | "B" | "C" | "D";

export type MedicalRequirementLevel = "R" | "I";

/** Configurable examination components from the Word form matrix. */
export type MedicalExamComponentId =
  | "general_physical_vitals"
  | "vision"
  | "hearing"
  | "respiratory"
  | "musculoskeletal"
  | "skin"
  | "zoonotic_screening"
  | "tetanus"
  | "epilepsy"
  | "part4_standard_panel";

export type MedicalExamComponentDef = {
  id: MedicalExamComponentId;
  label: string;
  part: string;
};

/** Display order for the HR configuration table. */
export const MEDICAL_EXAM_COMPONENTS: MedicalExamComponentDef[] = [
  { id: "general_physical_vitals", label: "General physical & vitals", part: "Part 3" },
  { id: "vision", label: "Vision (measured acuity)", part: "Part 3" },
  { id: "hearing", label: "Hearing (screen; audiometry if indicated)", part: "Part 3" },
  { id: "respiratory", label: "Respiratory function (dust/ammonia exposure)", part: "Part 3" },
  { id: "musculoskeletal", label: "Musculoskeletal / lifting capacity", part: "Part 3" },
  { id: "skin", label: "Skin assessment", part: "Part 3" },
  { id: "zoonotic_screening", label: "Zoonotic disease screening (company protocol)", part: "Part 2 & 4" },
  { id: "tetanus", label: "Tetanus immunisation status", part: "Part 2" },
  { id: "epilepsy", label: "Epilepsy / blackout screening", part: "Part 2" },
  {
    id: "part4_standard_panel",
    label: "Standard laboratory panel, chest X-ray & eye screening",
    part: "Part 4",
  },
];

/** R = required, I = if clinically indicated — matches the Word form Part 1 matrix. */
export const MEDICAL_EXAM_REQUIREMENTS_MATRIX: Record<
  MedicalExamComponentId,
  Record<MedicalJobCategoryLetter, MedicalRequirementLevel>
> = {
  general_physical_vitals: { A: "R", B: "R", C: "R", D: "R" },
  vision: { A: "R", B: "R", C: "R", D: "I" },
  hearing: { A: "I", B: "R", C: "R", D: "I" },
  respiratory: { A: "R", B: "I", C: "R", D: "I" },
  musculoskeletal: { A: "R", B: "R", C: "R", D: "I" },
  skin: { A: "R", B: "I", C: "I", D: "I" },
  zoonotic_screening: { A: "R", B: "I", C: "I", D: "I" },
  tetanus: { A: "R", B: "R", C: "R", D: "I" },
  epilepsy: { A: "I", B: "R", C: "I", D: "I" },
  part4_standard_panel: { A: "R", B: "R", C: "R", D: "R" },
};

export type MedicalFormConfig = {
  job_category: string;
  job_category_letter: MedicalJobCategoryLetter;
  included_components: MedicalExamComponentId[];
  configured_at?: string;
  configured_by?: string;
};

export function medicalJobCategoryLetter(
  jobCategory: string | null | undefined,
): MedicalJobCategoryLetter | null {
  const resolved = resolveMedicalJobCategory(jobCategory);
  if (!resolved) return null;
  const index = MEDICAL_JOB_CATEGORY_OPTIONS.findIndex((o) => o.value === resolved);
  if (index < 0 || index > 3) return null;
  return (["A", "B", "C", "D"] as const)[index];
}

export function componentRequirement(
  componentId: MedicalExamComponentId,
  letter: MedicalJobCategoryLetter,
): MedicalRequirementLevel {
  return MEDICAL_EXAM_REQUIREMENTS_MATRIX[componentId][letter];
}

/** Required components plus optional clinically indicated ones HR has turned on. */
export function defaultIncludedComponents(
  letter: MedicalJobCategoryLetter,
): MedicalExamComponentId[] {
  return MEDICAL_EXAM_COMPONENTS.filter(
    (c) => componentRequirement(c.id, letter) === "R",
  ).map((c) => c.id);
}

export function normalizeIncludedComponents(
  letter: MedicalJobCategoryLetter,
  selected: MedicalExamComponentId[],
): MedicalExamComponentId[] {
  const allowed = new Set(selected);
  const result: MedicalExamComponentId[] = [];

  for (const component of MEDICAL_EXAM_COMPONENTS) {
    const level = componentRequirement(component.id, letter);
    if (level === "R" || allowed.has(component.id)) {
      result.push(component.id);
    }
  }

  return result;
}

export function isMedicalFormConfiguredForCategory(
  config: MedicalFormConfig | null | undefined,
  jobCategory: string | null | undefined,
): boolean {
  if (!config?.included_components?.length || !config.configured_at) return false;
  const letter = medicalJobCategoryLetter(jobCategory);
  if (!letter || config.job_category_letter !== letter) return false;
  const resolved = resolveMedicalJobCategory(jobCategory);
  if (resolved && config.job_category !== resolved) return false;
  return true;
}
