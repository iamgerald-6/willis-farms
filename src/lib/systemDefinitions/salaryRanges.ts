import {
  resolveGradeLevels,
  type GradeLevelDef,
  type GradeLevelsConfig,
} from "./gradeLevelsConfig";

export const SALARY_TIER_IDS = ["low", "mid", "high"] as const;
export type SalaryTierId = (typeof SALARY_TIER_IDS)[number];

export const SALARY_TIER_LABELS: Record<SalaryTierId, string> = {
  low: "Low",
  mid: "Mid",
  high: "High",
};

export type SalaryTierBand = {
  min?: string;
  max?: string;
};

export type GradeSalaryTiers = Partial<Record<SalaryTierId, SalaryTierBand>>;

function normalizeTierBand(raw: unknown): SalaryTierBand | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const min = row.min != null ? String(row.min).trim() : undefined;
  const max = row.max != null ? String(row.max).trim() : undefined;
  if (!min && !max) return undefined;
  return { min: min || undefined, max: max || undefined };
}

export function normalizeGradeSalaryTiers(raw: unknown): GradeSalaryTiers | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const out: GradeSalaryTiers = {};
  for (const tier of SALARY_TIER_IDS) {
    const band = normalizeTierBand(obj[tier]);
    if (band) out[tier] = band;
  }
  return Object.keys(out).length ? out : undefined;
}

function formatGhsAmount(value: string): string {
  const cleaned = value.replace(/,/g, "").trim();
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return value.trim();
  return num.toLocaleString("en-GH");
}

export function formatSalaryTierBand(band?: SalaryTierBand | null): string {
  if (!band) return "";
  const min = band.min?.trim();
  const max = band.max?.trim();
  if (min && max) return `GHS ${formatGhsAmount(min)} – ${formatGhsAmount(max)}`;
  if (min) return `GHS ${formatGhsAmount(min)}+`;
  if (max) return `Up to GHS ${formatGhsAmount(max)}`;
  return "";
}

export function normalizeSalaryTierId(value: string | undefined | null): SalaryTierId | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "low" || normalized === "mid" || normalized === "high") {
    return normalized;
  }
  return null;
}

export function resolveSalaryTierBandForGrade(
  gradeId: string | undefined | null,
  tier: SalaryTierId | undefined | null,
  config?: GradeLevelsConfig,
): SalaryTierBand | null {
  if (!gradeId?.trim() || !tier) return null;
  const id = gradeId.trim().toUpperCase();
  const level = resolveGradeLevels(config).find((l) => l.id === id);
  return level?.salaryTiers?.[tier] ?? null;
}

export function resolveSalaryForGradeTier(
  gradeId: string | undefined | null,
  tierInput: string | undefined | null,
  config?: GradeLevelsConfig,
): {
  tier: SalaryTierId | null;
  band: SalaryTierBand | null;
  formatted: string;
  salaryGhs: string;
} {
  const tier = normalizeSalaryTierId(tierInput);
  const band = resolveSalaryTierBandForGrade(gradeId, tier, config);
  const formatted = formatSalaryTierBand(band);
  return {
    tier,
    band,
    formatted,
    salaryGhs: formatted,
  };
}

export function mergeSalaryTiersIntoLevels(
  levels: GradeLevelDef[],
  salaryByGrade: Record<string, GradeSalaryTiers | undefined>,
): GradeLevelDef[] {
  return levels.map((level) => {
    const tiers = salaryByGrade[level.id] ?? level.salaryTiers;
    if (!tiers || !Object.keys(tiers).length) {
      const { salaryTiers: _drop, ...rest } = level;
      return rest;
    }
    return { ...level, salaryTiers: tiers };
  });
}
