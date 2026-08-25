import type { SectionDef } from "@/lib/appraisal/scoring";
import {
  getGitSectionWeightSnapshot,
  sectionSetForQuarter,
  type Quarter,
  type SectionSet,
} from "@/lib/appraisal/sections";
import { isAppraisalFormKeyShape } from "@/lib/systemDefinitions/appraisalScopeConfig";

/** Per-form-key overrides stored in system_modules.business_logic.sectionBaseWeights */
export type SectionBaseWeights = Partial<
  Record<string, Partial<Record<SectionSet, Partial<Record<string, number>>>>>
>;

/** Weights applied to every grade band (e.g. Section A = 15% for all L1–L7). */
export type GlobalSectionWeights = Partial<
  Record<SectionSet, Partial<Record<string, number>>>
>;

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
    if (s.key === targetKey) return { ...s, weight: newWeight };
    const share = s.weight / otherSum;
    return { ...s, weight: Math.max(0, s.weight - delta * share) };
  });
}

export function normalizeSectionBaseWeights(raw: unknown): SectionBaseWeights {
  if (!raw || typeof raw !== "object") return {};
  const out: SectionBaseWeights = {};

  for (const [formKey, bandRaw] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!isAppraisalFormKeyShape(formKey) || !bandRaw || typeof bandRaw !== "object") {
      continue;
    }
    for (const set of ["quarterly", "annual"] as SectionSet[]) {
      const setRaw = (bandRaw as Record<string, unknown>)[set];
      if (!setRaw || typeof setRaw !== "object") continue;
      for (const [key, val] of Object.entries(setRaw)) {
        const n = Number(val);
        if (!Number.isFinite(n) || n <= 0 || n > 1) continue;
        if (!out[formKey]) out[formKey] = {};
        if (!out[formKey]![set]) out[formKey]![set] = {};
        out[formKey]![set]![key] = n;
      }
    }
  }
  return out;
}

export function normalizeGlobalSectionWeights(
  raw: unknown,
): GlobalSectionWeights {
  if (!raw || typeof raw !== "object") return {};
  const out: GlobalSectionWeights = {};
  for (const set of ["quarterly", "annual"] as SectionSet[]) {
    const setRaw = (raw as Record<string, unknown>)[set];
    if (!setRaw || typeof setRaw !== "object") continue;
    for (const [key, val] of Object.entries(setRaw)) {
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0 || n > 1) continue;
      if (!out[set]) out[set] = {};
      out[set]![key] = n;
    }
  }
  return out;
}

/** Resolve effective weight for one section (Git → global → band override). */
export function resolveSectionWeight(
  formKey: string,
  sectionSet: SectionSet,
  sectionKey: string,
  gitWeight: number,
  globalWeights?: GlobalSectionWeights,
  baseWeights?: SectionBaseWeights,
): number {
  return (
    baseWeights?.[formKey]?.[sectionSet]?.[sectionKey] ??
    globalWeights?.[sectionSet]?.[sectionKey] ??
    gitWeight
  );
}

/** Apply stored base + global weights onto Git section definitions. */
export function applySectionBaseWeights(
  sections: SectionDef[],
  formKey: string,
  quarter: Quarter,
  globalWeights?: GlobalSectionWeights,
  baseWeights?: SectionBaseWeights,
): SectionDef[] {
  const sectionSet = sectionSetForQuarter(quarter);
  let result = sections.map((s) => ({
    ...s,
    items: [...s.items],
    weight: resolveSectionWeight(
      formKey,
      sectionSet,
      s.key,
      s.weight,
      globalWeights,
      baseWeights,
    ),
  }));

  for (const s of sections) {
    const resolved = resolveSectionWeight(
      formKey,
      sectionSet,
      s.key,
      s.weight,
      globalWeights,
      baseWeights,
    );
    if (Math.abs(resolved - s.weight) > 0.0001) {
      result = rebalanceSectionWeights(result, s.key, resolved);
    }
  }

  return result;
}

export function getGitSectionWeightDefaults() {
  return getGitSectionWeightSnapshot();
}
