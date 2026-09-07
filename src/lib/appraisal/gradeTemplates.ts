import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionDef } from "@/lib/appraisal/scoring";

/** One appraisal question set for an exact org combination — see
 * docs/appraisal/appraisal-grade-templates.sql. Replaces the old global
 * L1-L7 grade-band SECTIONS_MAP for brand-new appraisals; an employee's own
 * stored org placement (users.site_id .. grade_level_id) is matched against
 * this table's 6 columns to find their template. */
export type AppraisalGradeTemplate = {
  id: string;
  site_id: string;
  business_unit_id: string;
  department_id: string;
  section_id: string;
  position_id: string;
  grade_level_id: string;
  quarterly_sections: SectionDef[];
  annual_sections: SectionDef[];
  extra_rules: ExtraWeightRule[];
  created_at: string;
  updated_at: string;
};

/** A simplified, always-on version of the old grade-band SectionWeightRule
 * — no minGradeIndex condition needed since the grade is already fixed by
 * the template itself. Enabling a rule sets that section's weight and
 * proportionally redistributes the delta across the template's other
 * sections, same rebalancing behaviour as before. */
export type ExtraWeightRule = {
  id: string;
  label: string;
  description?: string;
  sectionKey: string;
  weight: number;
  enabled: boolean;
};

export type GradeTemplateOrgPlacement = {
  site_id: string | null | undefined;
  business_unit_id: string | null | undefined;
  department_id: string | null | undefined;
  section_id: string | null | undefined;
  position_id: string | null | undefined;
  grade_level_id: string | null | undefined;
};

/** All 6 placement fields must be set to look up a template — matches the
 * "full combination" scoping decision (no partial/nullable matching). */
export function hasCompleteOrgPlacement(
  p: GradeTemplateOrgPlacement,
): p is Required<Record<keyof GradeTemplateOrgPlacement, string>> {
  return (
    !!p.site_id &&
    !!p.business_unit_id &&
    !!p.department_id &&
    !!p.section_id &&
    !!p.position_id &&
    !!p.grade_level_id
  );
}

export async function findGradeTemplateForPlacement(
  supabase: SupabaseClient,
  placement: GradeTemplateOrgPlacement,
): Promise<AppraisalGradeTemplate | null> {
  if (!hasCompleteOrgPlacement(placement)) return null;

  const { data } = await supabase
    .from("appraisal_grade_templates")
    .select("*")
    .eq("site_id", placement.site_id)
    .eq("business_unit_id", placement.business_unit_id)
    .eq("department_id", placement.department_id)
    .eq("section_id", placement.section_id)
    .eq("position_id", placement.position_id)
    .eq("grade_level_id", placement.grade_level_id)
    .maybeSingle();

  return (data as AppraisalGradeTemplate | null) ?? null;
}

/** Redistributes weight the same way the old applySectionWeightRules did:
 * set the target section's weight, then spread the delta proportionally
 * across the rest so the total stays ~1.0. */
function rebalanceSectionWeights(
  sections: SectionDef[],
  targetKey: string,
  targetWeight: number,
): SectionDef[] {
  const target = sections.find((s) => s.key === targetKey);
  if (!target) return sections;

  const others = sections.filter((s) => s.key !== targetKey);
  const othersTotal = others.reduce((sum, s) => sum + s.weight, 0);
  const delta = target.weight - targetWeight;

  return sections.map((s) => {
    if (s.key === targetKey) return { ...s, weight: targetWeight };
    if (othersTotal <= 0) return s;
    const share = s.weight / othersTotal;
    return { ...s, weight: Math.max(0, s.weight + delta * share) };
  });
}

/**
 * Repairs sections saved with the old sec-<timestamp> keys (from before
 * section keys were made sequential letters) and/or a broken weight split
 * (e.g. a newly added section stuck at 0% next to an old one at 100%) —
 * applied at read time everywhere sections are displayed or resolved, so
 * already-saved templates render correctly without needing a DB migration.
 * Cosmetic key renumbering always happens; weights are only rebalanced
 * evenly when they look broken (any zero, or the total isn't ~100%).
 */
export function normalizeTemplateSections(sections: SectionDef[]): SectionDef[] {
  if (sections.length === 0) return sections;

  const hasZeroWeight = sections.some((s) => !s.weight || s.weight <= 0);
  const total = sections.reduce((sum, s) => sum + (s.weight || 0), 0);
  const needsRebalance = hasZeroWeight || Math.abs(total - 1) > 0.02;
  const evenWeight = 1 / sections.length;

  return sections.map((s, i) => ({
    ...s,
    key: i < 26 ? String.fromCharCode(65 + i) : `S${i + 1}`,
    weight: needsRebalance ? evenWeight : s.weight,
  }));
}

export function applyExtraWeightRules(
  sections: SectionDef[],
  rules: ExtraWeightRule[],
): SectionDef[] {
  return rules
    .filter((r) => r.enabled)
    .reduce((acc, rule) => rebalanceSectionWeights(acc, rule.sectionKey, rule.weight), sections);
}

/** The exact sections an employee sees, sections-set + extra rules applied.
 * Returns null if no template is configured for their exact combination. */
export function resolveTemplateSections(
  template: AppraisalGradeTemplate | null,
  sectionSet: "quarterly" | "annual",
): SectionDef[] | null {
  if (!template) return null;
  const base = normalizeTemplateSections(
    sectionSet === "quarterly" ? template.quarterly_sections : template.annual_sections,
  );
  return applyExtraWeightRules(base, template.extra_rules);
}
