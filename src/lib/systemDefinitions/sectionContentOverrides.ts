import type { SectionDef } from "@/lib/appraisal/scoring";
import {
  sectionSetForQuarter,
  type Quarter,
  type SectionSet,
} from "@/lib/appraisal/sections";
import { isAppraisalFormKeyShape } from "@/lib/systemDefinitions/appraisalScopeConfig";

export type SectionContentPatch = {
  title?: string;
  items?: string[];
  /** When true, this Git section is hidden from the live form. */
  hidden?: boolean;
  /** Default weight for custom sections added via overrides. */
  weight?: number;
};

/** Per-form-key overrides for rating section titles and item labels. */
export type SectionContentOverrides = Partial<
  Record<
    string,
    Partial<Record<SectionSet, Partial<Record<string, SectionContentPatch>>>>
  >
>;

function normalizeSectionContentSet(
  setRaw: unknown,
): Partial<Record<string, SectionContentPatch>> | undefined {
  if (!setRaw || typeof setRaw !== "object") return undefined;
  const setOut: Partial<Record<string, SectionContentPatch>> = {};

  for (const [key, val] of Object.entries(setRaw)) {
    if (!val || typeof val !== "object") continue;
    const patch = val as Record<string, unknown>;
    if (patch.hidden === true) {
      setOut[key] = { hidden: true };
      continue;
    }
    const title =
      patch.title != null ? String(patch.title).trim() : undefined;
    const itemsRaw = patch.items;
    const items = Array.isArray(itemsRaw)
      ? itemsRaw.map((item) => String(item ?? "").trim()).filter(Boolean)
      : undefined;
    const weight =
      typeof patch.weight === "number" && Number.isFinite(patch.weight)
        ? patch.weight
        : undefined;

    if (!title && !items?.length) continue;
    setOut[key] = {
      ...(title ? { title } : {}),
      ...(items?.length ? { items } : {}),
      ...(weight != null ? { weight } : {}),
    };
  }

  return Object.keys(setOut).length ? setOut : undefined;
}

export function normalizeSectionContentOverrides(
  raw: unknown,
): SectionContentOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: SectionContentOverrides = {};

  for (const [formKey, bandRaw] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!isAppraisalFormKeyShape(formKey) || !bandRaw || typeof bandRaw !== "object") {
      continue;
    }

    for (const set of ["quarterly", "annual"] as SectionSet[]) {
      const setOut = normalizeSectionContentSet(
        (bandRaw as Record<string, unknown>)[set],
      );
      if (!setOut) continue;
      if (!out[formKey]) out[formKey] = {};
      out[formKey]![set] = setOut;
    }
  }

  return out;
}

export function mergeSectionContentPatches(
  gitSections: SectionDef[],
  patches?: Partial<Record<string, SectionContentPatch>>,
): SectionDef[] {
  if (!patches) return gitSections.map((s) => ({ ...s, items: [...s.items] }));

  const gitKeys = new Set(gitSections.map((s) => s.key));
  const merged: SectionDef[] = [];

  for (const section of gitSections) {
    const patch = patches[section.key];
    if (patch?.hidden) continue;
    merged.push({
      ...section,
      title: patch?.title?.trim() || section.title,
      items: patch?.items?.length ? [...patch.items] : [...section.items],
      weight: patch?.weight ?? section.weight,
    });
  }

  for (const [key, patch] of Object.entries(patches)) {
    if (!patch || gitKeys.has(key) || patch.hidden) continue;
    if (!patch.title?.trim() && !patch.items?.length) continue;
    merged.push({
      key,
      title: patch.title?.trim() || "New section",
      items: patch.items?.length ? [...patch.items] : [""],
      weight: patch.weight ?? 0.1,
    });
  }

  return merged;
}

export function applySectionContentOverrides(
  sections: SectionDef[],
  formKey: string,
  quarter: Quarter,
  overrides?: SectionContentOverrides,
): SectionDef[] {
  if (!overrides) return sections;

  const sectionSet = sectionSetForQuarter(quarter);
  const patches = overrides[formKey]?.[sectionSet];
  if (!patches) return sections;

  return mergeSectionContentPatches(sections, patches);
}
