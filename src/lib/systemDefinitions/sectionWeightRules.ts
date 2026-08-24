import type { SectionDef } from "@/lib/appraisal/scoring";
import { gradeIndex } from "@/lib/appraisal/sections";

import {
  normalizeGlobalSectionWeights,
  normalizeSectionBaseWeights,
  type GlobalSectionWeights,
  type SectionBaseWeights,
} from "./sectionBaseWeights";
import {
  normalizeSectionContentOverrides,
  type SectionContentOverrides,
} from "./sectionContentOverrides";
import {
  normalizeCompetencyContentOverrides,
  type CompetencyContentOverrides,
} from "./competencyContentOverrides";
import {
  normalizeRefereeReferenceConfig,
  type RefereeReferenceConfig,
} from "./refereeReferenceConfig";
import {
  normalizeApplicationFormConfig,
  type ApplicationFormConfig,
} from "./applicationFormConfig";
import {
  normalizeGradeLevelsConfig,
  type GradeLevelsConfig,
} from "./gradeLevelsConfig";
import {
  normalizeAnnualLeaveCapDays,
} from "@/lib/leave/leavePolicy";
import {
  normalizeAppraisalScopeConfig,
  type AppraisalScopeConfig,
} from "./appraisalScopeConfig";

export interface SectionWeightRule {
  id: string;
  label: string;
  description?: string;
  /** Lowest employee grade index that triggers this rule (3 = L4). */
  minGradeIndex: number;
  /** Section key within the rating grid, e.g. "A". */
  sectionKey: string;
  weight: number;
  enabled: boolean;
}

export interface ModuleBusinessLogic {
  sectionWeightRules?: SectionWeightRule[];
  sectionBaseWeights?: SectionBaseWeights;
  globalSectionWeights?: GlobalSectionWeights;
  sectionContentOverrides?: SectionContentOverrides;
  /** Skill log — competency section titles/skills per log type. */
  competencyContentOverrides?: CompetencyContentOverrides;
  /** Recruitment — public referee reference form assessment lines. */
  refereeReferenceConfig?: RefereeReferenceConfig;
  /** Recruitment — job application wizard layout (steps, referee count). */
  applicationFormConfig?: ApplicationFormConfig;
  /** Recruitment — configurable grade levels (L1–L7+) linked to job posting roles. */
  gradeLevelsConfig?: GradeLevelsConfig;
  /** Appraisal — grouped bands vs individual grade-level forms. */
  appraisalScopeConfig?: AppraisalScopeConfig;
  /** Leave module — annual working-day allowance per employee per calendar year. */
  annualLeaveCapDays?: number;
}

function rebalanceSectionWeights(
  sections: SectionDef[],
  targetKey: string,
  newWeight: number,
): SectionDef[] {
  const target = sections.find((s) => s.key === targetKey);
  if (!target) return sections;

  const oldWeight = target.weight;
  const delta = newWeight - oldWeight;
  if (Math.abs(delta) < 0.0001) return sections;

  const others = sections.filter((s) => s.key !== targetKey);
  const otherSum = others.reduce((sum, s) => sum + s.weight, 0);
  if (otherSum <= 0) return sections;

  return sections.map((s) => {
    if (s.key === targetKey) {
      return { ...s, weight: newWeight };
    }
    const share = s.weight / otherSum;
    return { ...s, weight: Math.max(0, s.weight - delta * share) };
  });
}

/** Apply editable weight rules for the employee being appraised. */
export function applySectionWeightRules(
  sections: SectionDef[],
  employeeGrade: string | null | undefined,
  rules: SectionWeightRule[] | undefined,
): SectionDef[] {
  if (!rules?.length) return sections;

  const empIdx = gradeIndex(employeeGrade);
  let result = sections.map((s) => ({ ...s, items: [...s.items] }));

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (empIdx < rule.minGradeIndex) continue;
    if (!result.some((s) => s.key === rule.sectionKey)) continue;
    result = rebalanceSectionWeights(result, rule.sectionKey, rule.weight);
  }

  return result;
}

export function normalizeSectionWeightRules(raw: unknown): SectionWeightRule[] {
  if (!raw || !Array.isArray(raw)) return [];
  const rules: SectionWeightRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = String(r.id ?? "").trim();
    const label = String(r.label ?? "").trim();
    const sectionKey = String(r.sectionKey ?? "").trim();
    if (!id || !label || !sectionKey) continue;
    rules.push({
      id,
      label,
      description: r.description != null ? String(r.description) : undefined,
      minGradeIndex: Number(r.minGradeIndex ?? 3),
      sectionKey,
      weight: Number(r.weight ?? 0.25),
      enabled: r.enabled !== false,
    });
  }
  return rules;
}

export function parseModuleBusinessLogic(raw: unknown): ModuleBusinessLogic {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  return {
    sectionWeightRules: normalizeSectionWeightRules(obj.sectionWeightRules),
    sectionBaseWeights: normalizeSectionBaseWeights(obj.sectionBaseWeights),
    globalSectionWeights: normalizeGlobalSectionWeights(
      obj.globalSectionWeights,
    ),
    sectionContentOverrides: normalizeSectionContentOverrides(
      obj.sectionContentOverrides,
    ),
    competencyContentOverrides: normalizeCompetencyContentOverrides(
      obj.competencyContentOverrides,
    ),
    refereeReferenceConfig: normalizeRefereeReferenceConfig(
      obj.refereeReferenceConfig,
    ),
    applicationFormConfig: normalizeApplicationFormConfig(
      obj.applicationFormConfig,
    ),
    gradeLevelsConfig: normalizeGradeLevelsConfig(obj.gradeLevelsConfig),
    appraisalScopeConfig: normalizeAppraisalScopeConfig(
      obj.appraisalScopeConfig,
    ),
    annualLeaveCapDays:
      obj.annualLeaveCapDays != null
        ? normalizeAnnualLeaveCapDays(obj.annualLeaveCapDays)
        : undefined,
  };
}
