import type { SectionDef } from "@/lib/appraisal/scoring";
import {
  APPRAISAL_GRADE_BANDS,
  type AppraisalGradeBand,
  sectionSetForQuarter,
  type Quarter,
  type SectionSet,
} from "@/lib/appraisal/sections";

export type SectionContentPatch = {
  title?: string;
  items?: string[];
};

/** Per-band overrides for rating section titles and item labels. */
export type SectionContentOverrides = Partial<
  Record<
    AppraisalGradeBand,
    Partial<Record<SectionSet, Partial<Record<string, SectionContentPatch>>>>
  >
>;

export function normalizeSectionContentOverrides(
  raw: unknown,
): SectionContentOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: SectionContentOverrides = {};

  for (const band of APPRAISAL_GRADE_BANDS) {
    const bandRaw = (raw as Record<string, unknown>)[band];
    if (!bandRaw || typeof bandRaw !== "object") continue;

    for (const set of ["quarterly", "annual"] as SectionSet[]) {
      const setRaw = (bandRaw as Record<string, unknown>)[set];
      if (!setRaw || typeof setRaw !== "object") continue;

      for (const [key, val] of Object.entries(setRaw)) {
        if (!val || typeof val !== "object") continue;
        const patch = val as Record<string, unknown>;
        const title =
          patch.title != null ? String(patch.title).trim() : undefined;
        const itemsRaw = patch.items;
        const items = Array.isArray(itemsRaw)
          ? itemsRaw
              .map((item) => String(item ?? "").trim())
              .filter(Boolean)
          : undefined;

        if (!title && !items?.length) continue;
        if (!out[band]) out[band] = {};
        if (!out[band]![set]) out[band]![set] = {};
        out[band]![set]![key] = {
          ...(title ? { title } : {}),
          ...(items?.length ? { items } : {}),
        };
      }
    }
  }

  return out;
}

export function mergeSectionContentPatches(
  gitSections: SectionDef[],
  patches?: Partial<Record<string, SectionContentPatch>>,
): SectionDef[] {
  if (!patches) return gitSections.map((s) => ({ ...s, items: [...s.items] }));

  return gitSections.map((section) => {
    const patch = patches[section.key];
    if (!patch) return { ...section, items: [...section.items] };
    return {
      ...section,
      title: patch.title?.trim() || section.title,
      items: patch.items?.length ? [...patch.items] : [...section.items],
    };
  });
}

export function applySectionContentOverrides(
  sections: SectionDef[],
  gradeBand: string,
  quarter: Quarter,
  overrides?: SectionContentOverrides,
): SectionDef[] {
  if (!overrides) return sections;

  const band = gradeBand as AppraisalGradeBand;
  const sectionSet = sectionSetForQuarter(quarter);
  const patches = overrides[band]?.[sectionSet];
  if (!patches) return sections;

  return mergeSectionContentPatches(sections, patches);
}
