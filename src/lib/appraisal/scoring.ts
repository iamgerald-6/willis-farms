/**
 * Shared scoring logic for the Appraisal System.
 *
 * Each review item is rated on a 1–5 scale:
 *   1  Unsatisfactory
 *   2  Below Expectation
 *   3  Meets Expectation
 *   4  Above Expectation
 *   5  Excellent
 *
 * Standardized computation (1–5 input → 0–100% final score):
 *   1. Section average = mean of that section's item ratings (1–5 scale).
 *   2. Weighted raw score = Σ(section weight × section average) / Σ(weights
 *      with at least one rating) — still on a 1–5 scale.
 *   3. Final score (%) = (weighted raw score ÷ 5) × 100.
 *
 * Rating bands (apply to section averages, quarter scores, and the final
 * averaged score — all expressed as the 0–100% computed above):
 *   90–100  Outstanding
 *   80–89   Exceeds Expectations
 *   70–79   Meets Expectations
 *   60–69   Needs Improvement
 *   <60     Unsatisfactory
 */

export type RatingValue = number; // 1–5

export const ITEM_RATING_MIN = 1;
export const ITEM_RATING_MAX = 5;

export interface RatingItem {
  rating: RatingValue | null;
  comment: string;
}
export interface SectionRatings {
  [itemLabel: string]: RatingItem;
}
export interface Ratings {
  [sectionKey: string]: SectionRatings;
}

export interface SectionDef {
  key: string;
  title: string;
  weight: number;
  items: string[];
}

export const PROMOTION_ELIGIBLE_THRESHOLD = 70;

export const RATING_BANDS = [
  { min: 90, label: "Outstanding", color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  { min: 80, label: "Exceeds Expectations", color: "bg-green-500", text: "text-green-700", bg: "bg-green-50" },
  { min: 70, label: "Meets Expectations", color: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50" },
  { min: 60, label: "Needs Improvement", color: "bg-orange-400", text: "text-orange-700", bg: "bg-orange-50" },
  { min: -Infinity, label: "Unsatisfactory", color: "bg-red-500", text: "text-red-700", bg: "bg-red-50" },
] as const;

export function bandFor(score: number | null | undefined) {
  if (score === null || score === undefined) return null;
  return RATING_BANDS.find((b) => score >= b.min) ?? RATING_BANDS[RATING_BANDS.length - 1];
}

export function bandLabel(score: number | null | undefined): string {
  return bandFor(score)?.label ?? "—";
}

/** Per-item (1–5) rating meta — labels/colors for the raw input scale. */
export const ITEM_RATING_META: Record<
  number,
  { label: string; color: string; text: string; bg: string }
> = {
  1: { label: "Unsatisfactory", color: "bg-red-500", text: "text-red-700", bg: "bg-red-50" },
  2: { label: "Below Expectation", color: "bg-orange-400", text: "text-orange-700", bg: "bg-orange-50" },
  3: { label: "Meets Expectation", color: "bg-amber-400", text: "text-amber-700", bg: "bg-amber-50" },
  4: { label: "Above Expectation", color: "bg-green-500", text: "text-green-700", bg: "bg-green-50" },
  5: { label: "Excellent", color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
};

export function itemRatingMeta(rating: number | null | undefined) {
  if (rating === null || rating === undefined) return null;
  return ITEM_RATING_META[Math.round(rating)] ?? null;
}

export function clampItemRating(n: number): number {
  return Math.max(ITEM_RATING_MIN, Math.min(ITEM_RATING_MAX, Math.round(n)));
}

/**
 * Weighted average of section averages (1–5 input), converted to a 0–100%
 * final score. See the standardized computation described above.
 */
export function computeWeightedScore(
  ratings: Ratings,
  sections: SectionDef[],
): {
  weightedScore: number | null;
  sectionAverages: Record<string, number | null>;
  completionPct: number;
} {
  let weightedRaw = 0; // 1–5 scale
  let totalWeight = 0;
  let totalItems = 0;
  let ratedItems = 0;
  const sectionAverages: Record<string, number | null> = {};

  for (const section of sections) {
    const sectionRatings = ratings[section.key] ?? {};
    const vals = section.items
      .map((item) => sectionRatings[item]?.rating)
      .filter((r): r is number => r !== null && r !== undefined);
    totalItems += section.items.length;
    ratedItems += vals.length;
    if (vals.length > 0) {
      const avgRaw = vals.reduce((a, b) => a + b, 0) / vals.length; // 1–5
      sectionAverages[section.key] = (avgRaw / ITEM_RATING_MAX) * 100; // % for display/banding
      weightedRaw += section.weight * avgRaw;
      totalWeight += section.weight;
    } else {
      sectionAverages[section.key] = null;
    }
  }

  const weightedScore =
    totalWeight > 0
      ? Math.round(((weightedRaw / totalWeight) / ITEM_RATING_MAX) * 100 * 100) / 100
      : null;

  return {
    weightedScore,
    sectionAverages,
    completionPct: totalItems > 0 ? Math.round((ratedItems / totalItems) * 100) : 0,
  };
}

/** Final Score = (Q1 + Q2 + Q3 + Q4) / 4, all equally weighted, 0–100 scale. */
export function computeFinalScore(
  quarterScores: Array<number | null | undefined>,
): number | null {
  const vals = quarterScores.filter((v): v is number => v !== null && v !== undefined);
  if (vals.length === 0) return null;
  // Missing quarters count as 0 once all 4 are expected to exist — the
  // caller is responsible for only calling this once Q4 is locked, at
  // which point all 4 quarters should have a final_quarter_score (locked
  // quarters fall back to the best available partial score, see
  // src/lib/appraisal/deadlines.ts).
  const sum = [0, 0, 0, 0].map((_, i) => quarterScores[i] ?? 0).reduce((a, b) => a + b, 0);
  return Math.round((sum / 4) * 100) / 100;
}

export function isPromotionEligible(finalScore: number | null | undefined): boolean {
  return typeof finalScore === "number" && finalScore >= PROMOTION_ELIGIBLE_THRESHOLD;
}
