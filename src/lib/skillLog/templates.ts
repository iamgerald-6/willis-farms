import type { SupabaseClient } from "@supabase/supabase-js";
import { SKILL_LOG_TYPES } from "@/lib/moduleRegistry/taxonomy/skillLogLogTypes";
import { DEFAULT_SKILL_LOG_TIER_AUTH } from "@/lib/systemDefinitions/skillLogDefaults";

export type SkillLogTemplateSection = {
  key: string;
  title: string;
  skills: string[];
};

/** One competency form keyed by skill name (e.g. GP Breeding & Farrowing). */
export type SkillLogTemplateVariant = {
  name: string;
  sections: SkillLogTemplateSection[];
};

export type SkillLogTemplate = {
  id: string;
  site_id: string;
  business_unit_id: string;
  department_id: string;
  section_id: string;
  position_id: string;
  grade_level_id: string;
  /** @deprecated Legacy single form — use skill_variants when present. */
  sections: SkillLogTemplateSection[];
  skill_variants: SkillLogTemplateVariant[];
  tier_auth_options: string[];
  created_at: string;
  updated_at: string;
};

export type SkillLogTemplatePlacement = {
  site_id: string | null | undefined;
  business_unit_id: string | null | undefined;
  department_id: string | null | undefined;
  section_id: string | null | undefined;
  position_id: string | null | undefined;
  grade_level_id: string | null | undefined;
};

export const DEFAULT_SKILL_VARIANT_NAME = "General";

export function defaultSkillLogTypeNames(): string[] {
  return Object.keys(SKILL_LOG_TYPES);
}

export function sectionsFromDefaultSkillLogType(
  logType: string,
): SkillLogTemplateSection[] {
  return (SKILL_LOG_TYPES[logType] ?? []).map((section, index) => ({
    key: `sec-${index}`,
    title: section.title,
    skills: [...section.skills],
  }));
}

export function hasCompleteSkillLogPlacement(
  p: SkillLogTemplatePlacement,
): p is Required<Record<keyof SkillLogTemplatePlacement, string>> {
  return (
    !!p.site_id &&
    !!p.business_unit_id &&
    !!p.department_id &&
    !!p.section_id &&
    !!p.position_id &&
    !!p.grade_level_id
  );
}

export function normalizeSkillLogTierAuthOptions(raw: unknown): string[] {
  const fromRaw = Array.isArray(raw)
    ? raw.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  if (fromRaw.length > 0) return fromRaw;
  return [...DEFAULT_SKILL_LOG_TIER_AUTH];
}

export function normalizeSkillLogTemplateSections(
  raw: unknown,
): SkillLogTemplateSection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const title = String(row.title ?? "").trim();
      const skills = Array.isArray(row.skills)
        ? row.skills.map((s) => String(s ?? "").trim()).filter(Boolean)
        : [];
      if (!title && skills.length === 0) return null;
      return {
        key: String(row.key ?? `sec-${index}`),
        title: title || "Section",
        skills,
      };
    })
    .filter((s): s is SkillLogTemplateSection => s != null);
}

export function normalizeSkillLogTemplateVariants(
  raw: unknown,
  legacySections?: SkillLogTemplateSection[],
): SkillLogTemplateVariant[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") return null;
        const row = entry as Record<string, unknown>;
        const name = String(row.name ?? "").trim();
        const sections = normalizeSkillLogTemplateSections(row.sections);
        if (!name && sections.length === 0) return null;
        return {
          name: name || `Skill ${index + 1}`,
          sections,
        };
      })
      .filter((v): v is SkillLogTemplateVariant => v != null);
  }

  if (legacySections && legacySections.length > 0) {
    return [{ name: DEFAULT_SKILL_VARIANT_NAME, sections: legacySections }];
  }

  return [];
}

/** Resolve skill variants — legacy `sections` becomes a single default variant. */
export function resolveSkillLogTemplateVariants(
  template: Pick<SkillLogTemplate, "sections" | "skill_variants">,
): SkillLogTemplateVariant[] {
  const normalized = normalizeSkillLogTemplateVariants(
    template.skill_variants,
    normalizeSkillLogTemplateSections(template.sections),
  );
  return normalized.filter((v) => v.sections.some((s) => s.skills.length > 0));
}

export function sectionsForSkillVariant(
  variants: SkillLogTemplateVariant[],
  skillName: string | null | undefined,
): SkillLogTemplateSection[] {
  if (!variants.length) return [];
  const trimmed = skillName?.trim();
  if (trimmed) {
    const match = variants.find((v) => v.name === trimmed);
    if (match) return match.sections.filter((s) => s.skills.length > 0);
  }
  return variants[0]?.sections.filter((s) => s.skills.length > 0) ?? [];
}

export function skillVariantNames(
  variants: SkillLogTemplateVariant[],
): string[] {
  return variants.map((v) => v.name).filter(Boolean);
}

export function normalizeSkillLogTemplateRow(
  row: SkillLogTemplate,
): SkillLogTemplate {
  const sections = normalizeSkillLogTemplateSections(row.sections);
  const skill_variants = normalizeSkillLogTemplateVariants(
    row.skill_variants,
    sections,
  );
  return {
    ...row,
    sections:
      skill_variants[0]?.sections.length > 0
        ? skill_variants[0].sections
        : sections,
    skill_variants,
    tier_auth_options: normalizeSkillLogTierAuthOptions(row.tier_auth_options),
  };
}

export async function findSkillLogTemplateForPlacement(
  supabase: SupabaseClient,
  placement: SkillLogTemplatePlacement,
): Promise<SkillLogTemplate | null> {
  if (!hasCompleteSkillLogPlacement(placement)) return null;

  const { data } = await supabase
    .from("skill_log_templates")
    .select("*")
    .eq("site_id", placement.site_id)
    .eq("business_unit_id", placement.business_unit_id)
    .eq("department_id", placement.department_id)
    .eq("section_id", placement.section_id)
    .eq("position_id", placement.position_id)
    .eq("grade_level_id", placement.grade_level_id)
    .maybeSingle();

  if (!data) return null;
  return normalizeSkillLogTemplateRow(data as SkillLogTemplate);
}
