export type GradeRoleKind = "ranked" | "consultant";

export type GradeLevelDef = {
  id: string;
  rank: number;
  label: string;
  /** Job posting role key (legacy_value) linked to this grade, when set. */
  roleKey?: string;
  builtIn?: boolean;
  /** Ranked L1–L7+ vs consultant (no numeric level). */
  roleKind?: GradeRoleKind;
};

export const CONSULTANT_GRADE_ID = "consultant" as const;

function isConsultantGradeId(id: string): boolean {
  const normalized = id.trim().toLowerCase();
  return normalized === CONSULTANT_GRADE_ID || normalized.endsWith("_consultant");
}

export type GradeLevelsConfig = {
  levels?: GradeLevelDef[];
};

/** Stable appraisal band ids — section content in DB uses these keys. */
export const APPRAISAL_GRADE_BAND_IDS = ["L1", "L2_L3", "L4", "L5_L6_L7"] as const;
export type AppraisalGradeBandId = (typeof APPRAISAL_GRADE_BAND_IDS)[number];

export function resolveGradeLevels(config?: GradeLevelsConfig): GradeLevelDef[] {
  return (config?.levels ?? [])
    .filter((l) => l.roleKind !== "consultant" && !isConsultantGradeId(l.id))
    .map((l) => ({ ...l, roleKind: "ranked" as const }))
    .sort((a, b) => a.rank - b.rank);
}

export function resolveAllGradeLevels(config?: GradeLevelsConfig): GradeLevelDef[] {
  const ranked = resolveGradeLevels(config);
  const consultants = (config?.levels ?? [])
    .filter((l) => l.roleKind === "consultant" || isConsultantGradeId(l.id))
    .map((l) => ({ ...l, roleKind: "consultant" as const, rank: 0 }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...ranked, ...consultants];
}

export function isConsultantGrade(
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  const id = grade?.trim();
  if (!id) return false;
  const fromConfig = resolveAllGradeLevels(config).find(
    (l) => l.id.toLowerCase() === id.toLowerCase(),
  );
  if (fromConfig?.roleKind === "consultant") return true;
  return isConsultantGradeId(id);
}

export function resolveGradeLevelOptions(
  config?: GradeLevelsConfig,
): { value: string; label: string }[] {
  return resolveAllGradeLevels(config).map((level) => ({
    value: level.id,
    label: level.roleKind === "consultant" ? level.label : `${level.id} – ${level.label}`,
  }));
}

export function gradeLevelToRank(
  gradeLevel: string | null | undefined,
  config?: GradeLevelsConfig,
): number | null {
  const normalized = gradeLevel?.trim().toUpperCase();
  if (!normalized) return null;

  const fromConfig = resolveAllGradeLevels(config).find(
    (l) => l.id.toUpperCase() === normalized || l.id.toLowerCase() === normalized.toLowerCase(),
  );
  if (fromConfig?.roleKind === "consultant") return null;
  return fromConfig?.rank ?? null;
}

export function maxGradeRank(config?: GradeLevelsConfig): number {
  const levels = resolveGradeLevels(config);
  return levels.reduce((max, l) => Math.max(max, l.rank), 0);
}

export function resolveGradeOrder(config?: GradeLevelsConfig): string[] {
  return resolveGradeLevels(config).map((l) => l.id);
}

/** 0-based position in the configured grade order, or -1 if unknown. */
export function gradeIndexInOrder(
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): number {
  if (!grade?.trim()) return -1;
  const clean = grade.replace("_", "/").split("/")[0].trim().toUpperCase();
  return resolveGradeOrder(config).indexOf(clean);
}

export function normalizeGradeId(grade: string | null | undefined): string | null {
  if (!grade?.trim()) return null;
  const clean = grade.replace("_", "/").split("/")[0].trim();
  if (/^L\d+$/i.test(clean)) return clean.toUpperCase();
  return clean.toLowerCase();
}

export function isKnownGrade(
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  const id = normalizeGradeId(grade);
  if (!id) return false;
  return resolveAllGradeLevels(config).some(
    (l) => l.id.toUpperCase() === id || l.id.toLowerCase() === id.toLowerCase(),
  );
}


export function formatGradeListLabel(gradeIds: string[]): string {
  if (gradeIds.length === 0) return "";
  if (gradeIds.length === 1) return gradeIds[0];
  return gradeIds.join(" / ");
}

/** Appraisal rating band for a single employee grade (stable band id). */
export function gradeBandForGrade(
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): AppraisalGradeBandId {
  const rank = gradeLevelToRank(grade, config);
  if (rank == null || rank <= 1) return "L1";
  if (rank <= 3) return "L2_L3";
  if (rank === 4) return "L4";
  return "L5_L6_L7";
}

export function resolveAppraisalGradeBandCovers(
  config?: GradeLevelsConfig,
): Record<AppraisalGradeBandId, string[]> {
  const levels = resolveGradeLevels(config);
  const byRank = (min: number, max: number) =>
    levels.filter((l) => l.rank >= min && l.rank <= max).map((l) => l.id);

  return {
    L1: byRank(1, 1),
    L2_L3: byRank(2, 3),
    L4: byRank(4, 4),
    L5_L6_L7: byRank(5, maxGradeRank(config)),
  };
}

export function resolveAppraisalGradeBandLabels(
  config?: GradeLevelsConfig,
): Record<AppraisalGradeBandId, string> {
  const covers = resolveAppraisalGradeBandCovers(config);
  const levels = resolveGradeLevels(config);
  const subtitle = (ids: string[]) => {
    const names = ids
      .map((id) => levels.find((l) => l.id === id)?.label ?? id)
      .join(" / ");
    return names;
  };

  return {
    L1: covers.L1.length ? `${covers.L1[0]} — ${subtitle(covers.L1)}` : "L1",
    L2_L3: covers.L2_L3.length
      ? `${formatGradeListLabel(covers.L2_L3)} — ${subtitle(covers.L2_L3)}`
      : "L2_L3",
    L4: covers.L4.length ? `${covers.L4[0]} — ${subtitle(covers.L4)}` : "L4",
    L5_L6_L7: covers.L5_L6_L7.length
      ? `${formatGradeListLabel(covers.L5_L6_L7)} — Management`
      : "L5_L6_L7",
  };
}

export function resolveAppraisalGradeOptions(
  config?: GradeLevelsConfig,
): { value: AppraisalGradeBandId; label: string }[] {
  const labels = resolveAppraisalGradeBandLabels(config);
  return APPRAISAL_GRADE_BAND_IDS.map((id) => ({
    value: id,
    label: labels[id],
  }));
}

export function nextGradeInOrder(
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): string | null {
  const order = resolveGradeOrder(config);
  const id = normalizeGradeId(grade);
  if (!id) return null;
  const idx = order.indexOf(id);
  if (idx === -1 || idx >= order.length - 1) return null;
  return order[idx + 1];
}

