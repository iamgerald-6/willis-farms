import type { NavIconKey } from "../types";
import {
  FINAL_DECISIONS,
  GRADE_ORDER,
  PROMOTION_FORM_CONFIGS,
  RATING_LABELS,
  computeReadinessSummary,
  getFormConfig,
  getProposedGrade,
  getPromotionStep,
  type InterviewQuestion,
  type PromotionFormConfig,
  type PromotionFormData,
  type PromotionStep,
  type SkillSignoffStage,
} from "@/app/(dashboard)/dashboard/humanCapital/promotion/component/promotionFormConfigs";

/**
 * Thin taxonomy layer over `promotionFormConfigs.ts` (grade-step forms are
 * large domain content and stay there as the single source of truth) plus
 * the smaller reference data that used to be duplicated/inlined directly in
 * `promotion/page.tsx` (matrix, general conditions, decision badge colors).
 */
export {
  FINAL_DECISIONS,
  GRADE_ORDER,
  PROMOTION_FORM_CONFIGS,
  RATING_LABELS,
  computeReadinessSummary,
  getFormConfig,
  getProposedGrade,
  getPromotionStep,
};
export type {
  InterviewQuestion,
  PromotionFormConfig,
  PromotionFormData,
  PromotionStep,
  SkillSignoffStage,
};

export interface PromotionMatrixStep {
  from: string;
  to: string;
  timeGuide: string;
  readinessStandard: string;
  requiredEvidence: string[];
  decisionMakers: string[];
}

export const PROMOTION_MATRIX: PromotionMatrixStep[] = [
  {
    from: "L1",
    to: "L2",
    timeGuide: "12–18 months",
    readinessStandard: "Reliable junior technical performance",
    requiredEvidence: [
      "Skills log",
      "Attendance",
      "Conduct",
      "Practical sign-off",
      "Theory/practical pass",
      "Supervisor recommendation",
    ],
    decisionMakers: [
      "Senior Swine Technician",
      "Herd Supervisor/Manager",
      "Breeding Farm Manager",
      "HR",
    ],
  },
  {
    from: "L2",
    to: "L3",
    timeGuide: "12–24 months",
    readinessStandard:
      "Advanced routine execution, AI certification, coaching capability",
    requiredEvidence: [
      "Advanced section sign-off",
      "Lead-AI-operator certification",
      "Records quality",
      "Coaching evidence",
      "Technical assessment",
    ],
    decisionMakers: [
      "Herd Supervisor/Manager",
      "Assistant Farm Manager",
      "Breeding Farm Manager",
      "HR",
      "GM",
    ],
  },
  {
    from: "L3",
    to: "L4",
    timeGuide: "18–30 months",
    readinessStandard: "Section-control readiness",
    requiredEvidence: [
      "Floor coordination evidence",
      "Task follow-up",
      "First-line checking",
      "Staff guidance",
      "Reproductive KPI contribution",
    ],
    decisionMakers: [
      "Assistant Farm Manager – Breeding",
      "Breeding Farm Manager",
      "HR",
      "GM",
    ],
  },
  {
    from: "L4",
    to: "L5",
    timeGuide: "18–36 months",
    readinessStandard: "Multi-area supervisory capability",
    requiredEvidence: [
      "Section performance history",
      "People supervision quality",
      "Breeding KPI Library management",
      "Reporting quality",
    ],
    decisionMakers: [
      "Breeding Farm Manager",
      "Operations/Production Manager",
      "HR",
      "GM",
    ],
  },
  {
    from: "L5",
    to: "L6",
    timeGuide: "24–36 months",
    readinessStandard: "Full farm-management readiness",
    requiredEvidence: [
      "Multi-section control",
      "Planning ability",
      "People-management maturity",
      "Reporting",
      "Resource-control evidence",
    ],
    decisionMakers: ["Operations/Production Manager", "Executive Leadership"],
  },
  {
    from: "L6",
    to: "L7",
    timeGuide: "Role-based",
    readinessStandard: "Enterprise operational leadership readiness",
    requiredEvidence: [
      "Farm leadership results",
      "Enterprise coordination",
      "Strategic reporting",
      "Leadership maturity",
    ],
    decisionMakers: ["CEO", "Executive Leadership"],
  },
];

export function getPromotionMatrixStep(
  fromGrade: string,
  toGrade?: string,
): PromotionMatrixStep | undefined {
  return PROMOTION_MATRIX.find(
    (m) => m.from === fromGrade && (!toGrade || m.to === toGrade),
  );
}

export const GENERAL_PROMOTION_CONDITIONS: string[] = [
  "Satisfactory attendance",
  "Acceptable conduct and discipline record",
  "No serious unresolved disciplinary issue",
  "No major biosecurity or tier-discipline breach",
  "Satisfactory performance in current role, including reproductive KPI contribution where applicable",
  "Four Quarterly Performance Reviews of the year showing readiness",
  "Positive supervisor recommendation",
  "Evidence of role readiness",
  "Management approval",
  "Available position / business need where applicable",
];

export interface PromotionDecisionDef {
  value: string;
  label: string;
  badgeClass: string;
  iconKey: NavIconKey;
}

export const PROMOTION_DECISIONS: PromotionDecisionDef[] = [
  {
    value: "promote",
    label: "Promote",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    iconKey: "check-circle",
  },
  {
    value: "promote_with_conditions",
    label: "Promote with Conditions",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    iconKey: "check-circle",
  },
  {
    value: "defer_pending_skills",
    label: "Defer Pending Skills Completion",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    iconKey: "clock",
  },
  {
    value: "retain_with_improvement",
    label: "Retain with Improvement Plan",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
    iconKey: "alert-circle",
  },
  {
    value: "not_ready",
    label: "Not Promotion-Ready",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    iconKey: "x-circle",
  },
];

export function getPromotionDecisionDef(
  value: string,
): PromotionDecisionDef | undefined {
  return PROMOTION_DECISIONS.find((d) => d.value === value);
}

export const PROMOTION_PAGE_COPY = {
  title: "Promotion Records",
  readOnlySubtitle: "View only — you need L4+ to approve promotions",
  activeSubtitle: "Grade and Promotion Tools · Promotion Step Matrix",
  newAssessmentButton: "New Promotion Assessment",
  awaitingSectionTitle: "Awaiting Assessment",
  historySectionTitle: "Promotion History",
};
