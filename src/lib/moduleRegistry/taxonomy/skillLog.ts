import type { TaxonomyOption } from "../types";
import {
  SKILL_LOG_TYPES,
  type SkillLogSectionDef,
} from "./skillLogLogTypes";

export type { SkillLogSectionDef } from "./skillLogLogTypes";
export { SKILL_LOG_TYPES } from "./skillLogLogTypes";

export type SkillLogStatus = "draft" | "submitted" | "signed_off";

export interface SkillLogStatusDef {
  id: string;
  legacyValue: SkillLogStatus;
  label: string;
  filterKey: string;
  filterLabel: string;
  badgeClass: string;
}

export const SKILL_LOG_STATUSES: SkillLogStatusDef[] = [
  {
    id: "status:skill-log:draft",
    legacyValue: "draft",
    label: "Draft",
    filterKey: "draft",
    filterLabel: "Draft",
    badgeClass: "bg-gray-100 text-gray-600 border-gray-200",
  },
  {
    id: "status:skill-log:submitted",
    legacyValue: "submitted",
    label: "Submitted",
    filterKey: "submitted",
    filterLabel: "Pending",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
  },
  {
    id: "status:skill-log:signed-off",
    legacyValue: "signed_off",
    label: "Signed Off",
    filterKey: "signed_off",
    filterLabel: "Signed Off",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
];

export const SKILL_LOG_GRADES = [
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
  "L6",
] as const;

export const SKILL_LOG_PAGE_COPY = {
  title: "Skills Logs",
  subtitleCanAct: "Your team's competency records",
  subtitleSeeAll: "All competency records (view only)",
  subtitleSelf: "Your competency records",
  fillButton: "Fill Skills Log",
  fillButtonShort: "New",
  searchPlaceholder: "Search by employee or log type…",
  emptyTitle: "No skills logs found",
  emptyCanAct:
    "Fill a skills log for one of your team members to get started.",
  emptySelf: "Your supervisor hasn't filled a skills log for you yet.",
  fillFirstLog: "Fill First Log",
  signOffTitle: "Sign Off Skills Log",
  signOffConfirmLabel:
    "By checking this box I confirm I have reviewed this skills log and agree to provide final sign-off.",
};

export const SKILL_LOG_FORM_COPY = {
  createTitle: "Fill Skills Log",
  editTitle: "Edit Skills Log",
  fillingAsPrefix: "Filling as ",
  editingPrefix: "Editing draft — ",
  submitHint: "Higher-manager sign-off happens after submission",
  saveDraft: "Save Draft",
  updateDraft: "Update Draft",
  submitForSignOff: "Submit for Sign-Off",
};

/** Minimum supervisor grade level (numeric) required to fill logs */
export const SKILL_LOG_MIN_FILLER_GRADE = 4;

export function parseSkillLogGradeLevel(
  grade: string | undefined | null,
): number {
  if (!grade) return 0;
  const n = parseInt(grade.replace(/\D/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
}

export function getSkillLogGradeLevels(): readonly string[] {
  return SKILL_LOG_GRADES;
}

export function getSkillLogTypeLegacyValues(): readonly string[] {
  return Object.keys(SKILL_LOG_TYPES);
}

export function getSkillLogTypeOptions(): TaxonomyOption[] {
  return getSkillLogTypeLegacyValues().map((legacyValue, index) => ({
    id: `opt:skill-log:type:${index + 1}`,
    label: legacyValue,
    legacyValue,
    sortOrder: index + 1,
  }));
}

export function getSkillLogSectionsForType(
  logType: string,
): SkillLogSectionDef[] {
  return SKILL_LOG_TYPES[logType] ?? [];
}

export function getSkillLogStatusDef(
  status: string,
): SkillLogStatusDef | undefined {
  return SKILL_LOG_STATUSES.find((s) => s.legacyValue === status);
}

export function getSkillLogStatusBadgeClass(status: string): string {
  return (
    getSkillLogStatusDef(status)?.badgeClass ??
    "bg-gray-100 text-gray-600 border-gray-200"
  );
}

export function getSkillLogStatusFilterOptions(): Array<{
  key: string;
  label: string;
}> {
  return [
    { key: "all", label: "All" },
    ...SKILL_LOG_STATUSES.map((s) => ({
      key: s.filterKey,
      label: s.filterLabel,
    })),
  ];
}

export interface SkillLogCompetencyRow {
  skill: string;
  observed: string | null;
  performed_under_supervision: string | null;
  performed_consistently: string | null;
  rating: number | null;
  comments: string;
}

export function buildSkillLogCompetencyRows(
  logType: string,
): SkillLogCompetencyRow[] {
  return getSkillLogSectionsForType(logType).flatMap((section) =>
    section.skills.map((skill) => ({
      skill,
      observed: null,
      performed_under_supervision: null,
      performed_consistently: null,
      rating: null,
      comments: "",
    })),
  );
}
