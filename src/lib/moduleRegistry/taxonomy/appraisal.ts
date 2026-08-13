import type { TaxonomyOption } from "../types";
import {
  GRADE_OPTIONS,
  QUARTERS,
  canAppraiseOthers,
  canRate,
  gradeBandForGrade,
  gradeIndex,
  sectionSetForQuarter,
  sectionsFor,
  supervisableGradeBands,
  type Quarter,
  type SectionSet,
} from "@/lib/appraisal/sections";
import {
  appraisalSideFor,
  canSuperviseAppraisal,
  isOwnAppraisal,
  type AppraisalSide,
  type AppraisalSubject,
  type AppraisalViewer,
} from "@/lib/appraisal/roles";
import {
  PROMOTION_LABELS,
  getStatusSummary,
  periodLabel,
  reviewedBy,
  type Appraisal,
  type AppraisalStatus,
  type Justification,
  type LockedReason,
  type StatusSummary,
  type StatusTone,
} from "@/app/(dashboard)/dashboard/humanCapital/appraisal/component/appraisalTypes";

/**
 * Thin taxonomy layer over the existing `lib/appraisal/*` domain engine.
 * The rating-section content (SECTIONS_MAP) is intentionally NOT duplicated
 * here — it stays in `lib/appraisal/sections.ts` as the single source of
 * truth. This file exists so the module registry has one place to reference
 * appraisal taxonomy (grade bands, quarters, promotion-readiness options,
 * statuses) the same way other modules expose their taxonomy.
 */
export {
  GRADE_OPTIONS,
  QUARTERS,
  canAppraiseOthers,
  canRate,
  gradeBandForGrade,
  gradeIndex,
  sectionSetForQuarter,
  sectionsFor,
  supervisableGradeBands,
};
export type { Quarter, SectionSet };

export {
  appraisalSideFor,
  canSuperviseAppraisal,
  isOwnAppraisal,
};
export type { AppraisalSide, AppraisalSubject, AppraisalViewer };

export { getStatusSummary, periodLabel, reviewedBy };
export type {
  Appraisal,
  AppraisalStatus,
  Justification,
  LockedReason,
  StatusSummary,
  StatusTone,
};

export const QUARTER_FILTERS = ["", "Q1", "Q2", "Q3", "Q4"] as const;

export function getQuarterFilterLabel(q: "" | Quarter): string {
  if (q === "") return "All";
  return q === "Q4" ? "Q4 (Annual)" : q;
}

/** Promotion-readiness taxonomy — single source, replaces duplicated
 * PROMOTION_OPTIONS arrays in AppraisalPage.tsx and finalFormReview.tsx. */
export const PROMOTION_READINESS_OPTIONS: TaxonomyOption[] = [
  {
    id: "opt:appraisal:promotion-readiness:not-yet-ready",
    label: PROMOTION_LABELS.not_yet_ready,
    legacyValue: "not_yet_ready",
    sortOrder: 1,
  },
  {
    id: "opt:appraisal:promotion-readiness:developing",
    label: PROMOTION_LABELS.developing,
    legacyValue: "developing",
    sortOrder: 2,
  },
  {
    id: "opt:appraisal:promotion-readiness:nearly-ready",
    label: PROMOTION_LABELS.nearly_ready,
    legacyValue: "nearly_ready",
    sortOrder: 3,
  },
  {
    id: "opt:appraisal:promotion-readiness:ready-for-assessment",
    label: PROMOTION_LABELS.ready_for_assessment,
    legacyValue: "ready_for_assessment",
    sortOrder: 4,
  },
  {
    id: "opt:appraisal:promotion-readiness:ready-for-expanded-responsibility",
    label: PROMOTION_LABELS.ready_for_expanded_responsibility,
    legacyValue: "ready_for_expanded_responsibility",
    sortOrder: 5,
  },
];

export function getPromotionReadinessOptions(): {
  value: string;
  label: string;
}[] {
  return PROMOTION_READINESS_OPTIONS.map((o) => ({
    value: o.legacyValue ?? o.label,
    label: o.label,
  }));
}

export interface JustificationStatusDef {
  id: string;
  legacyValue: Justification["status"];
  label: string;
  badgeClass: string;
  iconKey: "shield-check" | "shield-x" | "clock";
}

export const JUSTIFICATION_STATUSES: JustificationStatusDef[] = [
  {
    id: "status:justification:approved",
    legacyValue: "approved",
    label: "Approved",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border border-emerald-200",
    iconKey: "shield-check",
  },
  {
    id: "status:justification:rejected",
    legacyValue: "rejected",
    label: "Rejected",
    badgeClass: "bg-gray-100 text-gray-600 border border-gray-200",
    iconKey: "shield-x",
  },
  {
    id: "status:justification:pending",
    legacyValue: "pending",
    label: "Pending",
    badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
    iconKey: "clock",
  },
];

export function getJustificationStatusDef(
  status: string,
): JustificationStatusDef {
  return (
    JUSTIFICATION_STATUSES.find((s) => s.legacyValue === status) ??
    JUSTIFICATION_STATUSES[2]
  );
}

export const APPRAISAL_PAGE_COPY = {
  justificationsTitle: "Deadline Justifications",
  appraisalTitle: "Appraisals",
};
