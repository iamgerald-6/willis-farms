import {
  REFEREE_ASSESSMENT_ATTRIBUTES,
  type RefereeAssessmentKey,
} from "@/lib/careers/refereeReferenceTypes";

export type RefereeAssessmentAttributeDef = {
  key: string;
  label: string;
};

export type RefereeReferenceConfig = {
  assessmentAttributes?: RefereeAssessmentAttributeDef[];
};

function slugifyKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

export function normalizeRefereeReferenceConfig(
  raw: unknown,
): RefereeReferenceConfig {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const attrsRaw = obj.assessmentAttributes;
  if (!Array.isArray(attrsRaw)) return {};

  const assessmentAttributes: RefereeAssessmentAttributeDef[] = [];
  const usedKeys = new Set<string>();

  for (const item of attrsRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = String(row.label ?? "").trim();
    let key = String(row.key ?? "").trim();
    if (!label) continue;
    if (!key) key = slugifyKey(label) || `attr_${assessmentAttributes.length + 1}`;
    while (usedKeys.has(key)) {
      key = `${key}_${assessmentAttributes.length + 1}`;
    }
    usedKeys.add(key);
    assessmentAttributes.push({ key, label });
  }

  return assessmentAttributes.length ? { assessmentAttributes } : {};
}

export function defaultRefereeAssessmentAttributes(): RefereeAssessmentAttributeDef[] {
  return REFEREE_ASSESSMENT_ATTRIBUTES.map((a) => ({
    key: a.key,
    label: a.label,
  }));
}

export function resolveRefereeAssessmentAttributes(
  config?: RefereeReferenceConfig,
): RefereeAssessmentAttributeDef[] {
  const custom = config?.assessmentAttributes?.filter(
    (a) => a.key.trim() && a.label.trim(),
  );
  if (custom?.length) return custom;
  return defaultRefereeAssessmentAttributes();
}

export function assessmentKeyIsKnown(
  key: string,
  attributes: RefereeAssessmentAttributeDef[],
): key is RefereeAssessmentKey {
  return attributes.some((a) => a.key === key);
}
