import {
  normalizeGradeSalaryTiers,
  type GradeSalaryTiers,
} from "./salaryRanges";

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
  /** Low / mid / high salary bands (GHS) for HR Section O. */
  salaryTiers?: GradeSalaryTiers;
  /** Internal HR age band for shortlisting — not shown to applicants. */
  ageMin?: number;
  ageMax?: number;
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

/** L4+ may supervise / appraise others. */
export const MIN_SUPERVISOR_RANK = 4;
/** L5+ gets full appraisal access (non-manager roles). */
export const MIN_FULL_APPRAISAL_RANK = 5;
/** Access-control junior band: ranks 1–3. */
export const JUNIOR_BAND_MAX_RANK = 3;

export const SPECIALIST_INTERVIEW_GUIDE_KEYS = ["data_analyst", "veterinarian"] as const;

/** Built-in consultant grade — no L-rank; used for part-time HR and similar roles. */
export const DEFAULT_CONSULTANT_GRADES: GradeLevelDef[] = [
  {
    id: CONSULTANT_GRADE_ID,
    rank: 0,
    label: "Consultant",
    builtIn: true,
    roleKind: "consultant",
    ageMin: 25,
    ageMax: 55,
  },
];

export const DEFAULT_GRADE_LEVELS: GradeLevelDef[] = [
  { id: "L1", rank: 1, label: "Junior (1)", builtIn: true, roleKind: "ranked", ageMin: 22, ageMax: 33 },
  { id: "L2", rank: 2, label: "Technician (2)", builtIn: true, roleKind: "ranked", ageMin: 22, ageMax: 33 },
  { id: "L3", rank: 3, label: "Senior (3)", builtIn: true, roleKind: "ranked", ageMin: 25, ageMax: 40 },
  { id: "L4", rank: 4, label: "Supervisor (4)", builtIn: true, roleKind: "ranked", ageMin: 25, ageMax: 40 },
  { id: "L5", rank: 5, label: "Asst. Manager (5)", builtIn: true, roleKind: "ranked", ageMin: 25, ageMax: 40 },
  { id: "L6", rank: 6, label: "Farm Manager (6)", builtIn: true, roleKind: "ranked", ageMin: 33, ageMax: 55 },
  { id: "L7", rank: 7, label: "Operations (7)", builtIn: true, roleKind: "ranked", ageMin: 33, ageMax: 55 },
];

function parseAgeLimit(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 16 || n > 80) return undefined;
  return Math.round(n);
}

/** Default age band by grade rank when not explicitly configured. */
export function defaultAgeRangeForRank(rank: number): { ageMin: number; ageMax: number } {
  if (rank <= 0) return { ageMin: 25, ageMax: 55 };
  if (rank <= 2) return { ageMin: 22, ageMax: 33 };
  if (rank <= 5) return { ageMin: 25, ageMax: 40 };
  return { ageMin: 33, ageMax: 55 };
}

export function mergeAgeIntoLevels(
  levels: GradeLevelDef[],
  ageByGrade: Record<string, { min?: string; max?: string } | undefined>,
): GradeLevelDef[] {
  return levels.map((level) => {
    const raw = ageByGrade[level.id];
    const parsedMin = parseAgeLimit(raw?.min);
    const parsedMax = parseAgeLimit(raw?.max);
    const fallback = defaultAgeRangeForRank(level.rank);
    const ageMin = parsedMin ?? level.ageMin ?? fallback.ageMin;
    const ageMax = parsedMax ?? level.ageMax ?? fallback.ageMax;
    if (ageMin > ageMax) {
      return { ...level, ageMin: fallback.ageMin, ageMax: fallback.ageMax };
    }
    return { ...level, ageMin, ageMax };
  });
}

export function normalizeGradeLevelsConfig(raw: unknown): GradeLevelsConfig {
  if (!raw || typeof raw !== "object") return {};
  const levelsRaw = (raw as Record<string, unknown>).levels;
  if (!Array.isArray(levelsRaw)) return {};

  const levels: GradeLevelDef[] = [];
  const usedIds = new Set<string>();

  for (const item of levelsRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const idRaw = String(row.id ?? "").trim();
    const id = /^L\d+$/i.test(idRaw) ? idRaw.toUpperCase() : idRaw.toLowerCase();
    const label = String(row.label ?? "").trim();
    const roleKindRaw = String(row.roleKind ?? row.role_kind ?? "").trim().toLowerCase();
    const isConsultant =
      roleKindRaw === "consultant" || isConsultantGradeId(id);
    const rank = Number(row.rank);

    if (!label) continue;
    if (isConsultant) {
      if (!/^[a-z][a-z0-9_]*$/.test(id) || usedIds.has(id)) continue;
      usedIds.add(id);
      const salaryTiers = normalizeGradeSalaryTiers(row.salaryTiers ?? row.salary_tiers);
      const ageMin = parseAgeLimit(row.ageMin ?? row.age_min);
      const ageMax = parseAgeLimit(row.ageMax ?? row.age_max);
      levels.push({
        id,
        rank: 0,
        label,
        roleKind: "consultant",
        roleKey: row.roleKey != null ? String(row.roleKey).trim() : undefined,
        builtIn: row.builtIn === true,
        ...(salaryTiers ? { salaryTiers } : {}),
        ...(ageMin != null ? { ageMin } : {}),
        ...(ageMax != null ? { ageMax } : {}),
      });
      continue;
    }

    if (!/^L\d+$/.test(id) || !Number.isFinite(rank) || rank < 1) continue;
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    const salaryTiers = normalizeGradeSalaryTiers(row.salaryTiers ?? row.salary_tiers);
    const ageMin = parseAgeLimit(row.ageMin ?? row.age_min);
    const ageMax = parseAgeLimit(row.ageMax ?? row.age_max);
    levels.push({
      id,
      rank: Math.round(rank),
      label,
      roleKind: "ranked",
      roleKey: row.roleKey != null ? String(row.roleKey).trim() : undefined,
      builtIn: row.builtIn === true,
      ...(salaryTiers ? { salaryTiers } : {}),
      ...(ageMin != null ? { ageMin } : {}),
      ...(ageMax != null ? { ageMax } : {}),
    });
  }

  return levels.length ? { levels } : {};
}

export function resolveGradeLevels(config?: GradeLevelsConfig): GradeLevelDef[] {
  const configured = config?.levels?.length ? config.levels : [];
  const byId = new Map<string, GradeLevelDef>();

  for (const builtIn of DEFAULT_GRADE_LEVELS) {
    byId.set(builtIn.id, { ...builtIn });
  }
  for (const level of configured.filter((l) => l.roleKind !== "consultant" && !isConsultantGradeId(l.id))) {
    byId.set(level.id, { ...byId.get(level.id), ...level, id: level.id, roleKind: "ranked" });
  }

  return [...byId.values()].sort((a, b) => a.rank - b.rank);
}

/** Ranked L1–L7+ plus consultant grades (no numeric rank). */
export function resolveAllGradeLevels(config?: GradeLevelsConfig): GradeLevelDef[] {
  const ranked = resolveGradeLevels(config);
  const byId = new Map<string, GradeLevelDef>();

  for (const builtIn of DEFAULT_CONSULTANT_GRADES) {
    byId.set(builtIn.id, { ...builtIn });
  }
  const configured = config?.levels?.length ? config.levels : [];
  for (const level of configured) {
    if (level.roleKind === "consultant" || isConsultantGradeId(level.id)) {
      byId.set(level.id, { ...byId.get(level.id), ...level, id: level.id, roleKind: "consultant", rank: 0 });
    }
  }

  const consultants = [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
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

export function resolveAgeRangeForGrade(
  gradeId: string | null | undefined,
  config?: GradeLevelsConfig,
): { ageMin: number; ageMax: number; gradeId: string } | null {
  const id = gradeId?.trim().toUpperCase();
  if (!id || !/^L\d+$/.test(id)) return null;
  const level = resolveGradeLevels(config).find((l) => l.id === id);
  if (!level) return null;
  const fallback = defaultAgeRangeForRank(level.rank);
  return {
    gradeId: id,
    ageMin: level.ageMin ?? fallback.ageMin,
    ageMax: level.ageMax ?? fallback.ageMax,
  };
}

/** Age band for a job posting guide key (L1–L7 or specialist roles). */
export function resolveAgeRangeForGuideKey(
  guideKey: string | null | undefined,
  config?: GradeLevelsConfig,
): { ageMin: number; ageMax: number; gradeId: string } | null {
  const id = guideKey?.trim();
  if (!id) return null;
  const upper = id.toUpperCase();
  if (/^L\d+$/.test(upper)) {
    return resolveAgeRangeForGrade(upper, config);
  }
  if (id === "data_analyst" || id === "veterinarian") {
    return { gradeId: id, ageMin: 25, ageMax: 40 };
  }
  if (isConsultantGradeId(id)) {
    return { gradeId: id, ageMin: 25, ageMax: 55 };
  }
  return null;
}

export function resolveGradeLevelOptions(
  config?: GradeLevelsConfig,
): { value: string; label: string }[] {
  return resolveAllGradeLevels(config).map((level) => ({
    value: level.id,
    label: level.roleKind === "consultant" ? level.label : `${level.id} – ${level.label}`,
  }));
}

export function resolveInterviewGuideKeys(config?: GradeLevelsConfig): string[] {
  const grades = resolveAllGradeLevels(config).map((l) => l.id);
  const specialists = SPECIALIST_INTERVIEW_GUIDE_KEYS.filter((k) => !grades.includes(k));
  return [...grades, ...specialists];
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
  if (fromConfig) return fromConfig.rank;

  const match = normalized.match(/^L(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function maxGradeRank(config?: GradeLevelsConfig): number {
  const levels = resolveGradeLevels(config);
  return levels.reduce((max, l) => Math.max(max, l.rank), 7);
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

export function isSupervisorRank(
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  const rank = gradeLevelToRank(grade, config);
  return rank != null && rank >= MIN_SUPERVISOR_RANK;
}

export function isFullAppraisalRank(
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  const rank = gradeLevelToRank(grade, config);
  return rank != null && rank >= MIN_FULL_APPRAISAL_RANK;
}

export function gradesUpToRank(maxRank: number, config?: GradeLevelsConfig): string[] {
  return resolveGradeLevels(config)
    .filter((l) => l.rank <= maxRank)
    .map((l) => l.id);
}

export function gradesFromRank(minRank: number, config?: GradeLevelsConfig): string[] {
  return resolveGradeLevels(config)
    .filter((l) => l.rank >= minRank)
    .map((l) => l.id);
}

export function formatGradeListLabel(gradeIds: string[]): string {
  if (gradeIds.length === 0) return "";
  if (gradeIds.length === 1) return gradeIds[0];
  return gradeIds.join(" / ");
}

export function formatGradeRangeLabel(gradeIds: string[]): string {
  if (gradeIds.length === 0) return "";
  if (gradeIds.length === 1) return gradeIds[0];
  return `${gradeIds[0]}–${gradeIds[gradeIds.length - 1]}`;
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
    L1: byRank(1, 1).length ? byRank(1, 1) : ["L1"],
    L2_L3: byRank(2, 3).length ? byRank(2, 3) : ["L2", "L3"],
    L4: byRank(4, 4).length ? byRank(4, 4) : ["L4"],
    L5_L6_L7: byRank(5, maxGradeRank(config)).length
      ? byRank(5, maxGradeRank(config))
      : ["L5", "L6", "L7"],
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
    L1: `${covers.L1[0]} — ${subtitle(covers.L1)}`,
    L2_L3: `${formatGradeListLabel(covers.L2_L3)} — ${subtitle(covers.L2_L3)}`,
    L4: `${covers.L4[0]} — ${subtitle(covers.L4)}`,
    L5_L6_L7: `${formatGradeListLabel(covers.L5_L6_L7)} — Management`,
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

export type AccessControlGradeGroup = "grade_l1_l3" | "grade_l4_l7";

export function gradeBandGroupForGrade(
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): AccessControlGradeGroup | null {
  const rank = gradeLevelToRank(grade, config);
  if (rank == null) return null;
  return rank >= MIN_SUPERVISOR_RANK ? "grade_l4_l7" : "grade_l1_l3";
}

export function resolveAccessControlBandLabels(
  config?: GradeLevelsConfig,
): Record<AccessControlGradeGroup, string> {
  const junior = gradesUpToRank(JUNIOR_BAND_MAX_RANK, config);
  const senior = gradesFromRank(MIN_SUPERVISOR_RANK, config);
  return {
    grade_l1_l3: junior.length ? formatGradeRangeLabel(junior) : "L1–L3",
    grade_l4_l7: senior.length ? formatGradeRangeLabel(senior) : "L4–L7",
  };
}

export function resolveGroupPresetLabels(
  config?: GradeLevelsConfig,
): Record<AccessControlGradeGroup, string> {
  const bands = resolveAccessControlBandLabels(config);
  return {
    grade_l1_l3: `All ${bands.grade_l1_l3}`,
    grade_l4_l7: `All ${bands.grade_l4_l7}`,
  };
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

export function gradesBelowViewer(
  viewerGrade: string | null | undefined,
  config?: GradeLevelsConfig,
): string[] {
  const viewerRank = gradeLevelToRank(viewerGrade, config);
  if (viewerRank == null || viewerRank < MIN_SUPERVISOR_RANK) return [];
  return resolveGradeLevels(config)
    .filter((l) => l.rank < viewerRank)
    .map((l) => l.id);
}

export function canRateGradeLevel(
  raterGrade: string | null | undefined,
  targetGrade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  const raterRank = gradeLevelToRank(raterGrade, config);
  const targetRank = gradeLevelToRank(targetGrade, config);
  if (raterRank == null || targetRank == null) return false;
  if (raterRank < MIN_SUPERVISOR_RANK) return false;
  return raterRank > targetRank;
}

export function canSignOffSkillLogGrade(
  viewerGrade: string | null | undefined,
  fillerGrade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  const viewerRank = gradeLevelToRank(viewerGrade, config);
  const fillerRank = gradeLevelToRank(fillerGrade, config);
  if (viewerRank == null || fillerRank == null) return false;
  if (viewerRank < MIN_SUPERVISOR_RANK) return false;
  if (viewerRank >= MIN_FULL_APPRAISAL_RANK) return true;
  return viewerRank === MIN_SUPERVISOR_RANK && fillerRank === MIN_SUPERVISOR_RANK - 1;
}

