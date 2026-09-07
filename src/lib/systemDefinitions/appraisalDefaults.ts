import type { SectionWeightRule } from "./sectionWeightRules";

const APPRAISAL_MODULE_ID = "mod:appraisal";

export const DEFAULT_APPRAISAL_SECTION_WEIGHT_RULES: SectionWeightRule[] = [
  {
    id: "l4-leadership-weight",
    label: "L4+ higher weight on Leadership section (Section A)",
    minGradeIndex: 3,
    sectionKey: "A",
    weight: 0.25,
    enabled: true,
  },
];

export const APPRAISAL_MODULE_ID_CONST = APPRAISAL_MODULE_ID;
