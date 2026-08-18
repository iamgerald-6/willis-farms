import type { SystemOption } from "./types";
import type { SectionWeightRule } from "./sectionWeightRules";

const APPRAISAL_MODULE_ID = "mod:appraisal";
const SECTION_AUTH_LIST = "appraisal.sectionAuthorisations";

/** Git fallback when system_options is empty or not migrated. */
export const DEFAULT_SECTION_AUTHORISATION_OPTIONS: SystemOption[] = [
  {
    id: "opt:appraisal:auth:none",
    module_id: APPRAISAL_MODULE_ID,
    option_list: SECTION_AUTH_LIST,
    label: "None yet",
    legacy_value: "None yet",
    sort_order: 0,
    is_active: true,
    rules: {},
  },
  {
    id: "opt:appraisal:auth:farrowing",
    module_id: APPRAISAL_MODULE_ID,
    option_list: SECTION_AUTH_LIST,
    label: "Farrowing",
    legacy_value: "Farrowing",
    sort_order: 1,
    is_active: true,
    rules: {},
  },
  {
    id: "opt:appraisal:auth:weaning",
    module_id: APPRAISAL_MODULE_ID,
    option_list: SECTION_AUTH_LIST,
    label: "Weaning",
    legacy_value: "Weaning",
    sort_order: 2,
    is_active: true,
    rules: {},
  },
  {
    id: "opt:appraisal:auth:ai",
    module_id: APPRAISAL_MODULE_ID,
    option_list: SECTION_AUTH_LIST,
    label: "AI",
    legacy_value: "AI",
    sort_order: 3,
    is_active: true,
    rules: {},
  },
  {
    id: "opt:appraisal:auth:gestation",
    module_id: APPRAISAL_MODULE_ID,
    option_list: SECTION_AUTH_LIST,
    label: "Gestation",
    legacy_value: "Gestation",
    sort_order: 4,
    is_active: true,
    rules: {},
  },
  {
    id: "opt:appraisal:auth:nursery",
    module_id: APPRAISAL_MODULE_ID,
    option_list: SECTION_AUTH_LIST,
    label: "Nursery",
    legacy_value: "Nursery",
    sort_order: 5,
    is_active: true,
    rules: {},
  },
  {
    id: "opt:appraisal:auth:grower",
    module_id: APPRAISAL_MODULE_ID,
    option_list: SECTION_AUTH_LIST,
    label: "Grower-Finisher",
    legacy_value: "Grower-Finisher",
    sort_order: 6,
    is_active: true,
    rules: {},
  },
];

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
export const APPRAISAL_SECTION_AUTH_LIST = SECTION_AUTH_LIST;
