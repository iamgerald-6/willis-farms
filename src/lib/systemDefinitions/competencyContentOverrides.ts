import type { SkillLogSectionDef } from "@/lib/moduleRegistry/taxonomy/skillLogLogTypes";
import { SKILL_LOG_TYPES } from "@/lib/moduleRegistry/taxonomy/skillLogLogTypes";

export type CompetencySectionPatch = {
  title?: string;
  skills?: string[];
};

/** Per log-type overrides for competency section titles and skill lines. */
export type CompetencyContentOverrides = Partial<
  Record<string, Partial<Record<string, CompetencySectionPatch>>>
>;

export function sectionKeyForIndex(index: number): string {
  return `sec-${index}`;
}

export function normalizeCompetencyContentOverrides(
  raw: unknown,
): CompetencyContentOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: CompetencyContentOverrides = {};

  for (const [logType, sectionsRaw] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!sectionsRaw || typeof sectionsRaw !== "object") continue;
    for (const [sectionKey, patchRaw] of Object.entries(
      sectionsRaw as Record<string, unknown>,
    )) {
      if (!patchRaw || typeof patchRaw !== "object") continue;
      const patch = patchRaw as Record<string, unknown>;
      const title =
        patch.title != null ? String(patch.title).trim() : undefined;
      const skillsRaw = patch.skills;
      const skills = Array.isArray(skillsRaw)
        ? skillsRaw
            .map((item) => String(item ?? "").trim())
            .filter(Boolean)
        : undefined;

      if (!title && !skills?.length) continue;
      if (!out[logType]) out[logType] = {};
      out[logType]![sectionKey] = {
        ...(title ? { title } : {}),
        ...(skills?.length ? { skills } : {}),
      };
    }
  }

  return out;
}

export function mergeCompetencyContentPatches(
  gitSections: SkillLogSectionDef[],
  patches?: Partial<Record<string, CompetencySectionPatch>>,
): SkillLogSectionDef[] {
  if (!patches) {
    return gitSections.map((s) => ({ ...s, skills: [...s.skills] }));
  }

  return gitSections.map((section, index) => {
    const key = sectionKeyForIndex(index);
    const patch = patches[key];
    if (!patch) return { ...section, skills: [...section.skills] };
    return {
      title: patch.title?.trim() || section.title,
      skills: patch.skills?.length ? [...patch.skills] : [...section.skills],
    };
  });
}

export function resolveSkillLogSectionsForType(
  logType: string,
  overrides?: CompetencyContentOverrides,
): SkillLogSectionDef[] {
  const git = SKILL_LOG_TYPES[logType] ?? [];
  const patches = overrides?.[logType];
  return mergeCompetencyContentPatches(git, patches);
}

export function gitSkillLogTypesWithSections(): string[] {
  return Object.keys(SKILL_LOG_TYPES);
}

export function buildSkillLogCompetencyRowsFromConfig(
  logType: string,
  overrides?: CompetencyContentOverrides,
): Array<{
  skill: string;
  observed: string | null;
  performed_under_supervision: string | null;
  performed_consistently: string | null;
  rating: number | null;
  comments: string;
}> {
  return resolveSkillLogSectionsForType(logType, overrides).flatMap((section) =>
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
