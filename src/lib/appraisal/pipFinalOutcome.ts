import type { PipSection, PipTableSection } from "./pipFormSchema";
import { detectPipSectionRole, PIP_GAP_ID_KEY } from "./pipGapChain";

/** Storage key for per-gap field values (outcome, signatures, etc.). */
export function pipGapFieldKey(fieldKey: string, gapId: string): string {
  return `${fieldKey}__gap__${gapId}`;
}

export function getGapFieldValue(
  fields: Record<string, string | number | null | undefined> | undefined,
  fieldKey: string,
  gapId: string,
): string {
  if (!gapId.trim()) return String(fields?.[fieldKey] ?? "");
  const scoped = fields?.[pipGapFieldKey(fieldKey, gapId)];
  if (scoped != null && String(scoped).trim() !== "") return String(scoped);
  return String(fields?.[fieldKey] ?? "");
}

export function isFinalOutcomeSection(section: PipSection): boolean {
  const role = detectPipSectionRole(section);
  return role === "outcome" || role === "signatures" || role === "hr_only";
}

export function isFinalOutcomeTableRole(role: ReturnType<typeof detectPipSectionRole>): boolean {
  return role === "outcome" || role === "signatures" || role === "hr_only";
}

/** Ensure one table row exists per gap for gap-scoped final-outcome sections. */
export function ensureFinalOutcomeRowForGap(
  section: PipTableSection,
  rows: Array<Record<string, string | number | null>>,
  gapId: string,
): Array<Record<string, string | number | null>> {
  const trimmed = gapId.trim();
  if (!trimmed) return rows;
  if (rows.some((r) => String(r[PIP_GAP_ID_KEY] ?? "") === trimmed)) return rows;
  const empty = Object.fromEntries(section.columns.map((col) => [col.key, ""])) as Record<
    string,
    string | number | null
  >;
  empty[PIP_GAP_ID_KEY] = trimmed;
  return [...rows, empty];
}
