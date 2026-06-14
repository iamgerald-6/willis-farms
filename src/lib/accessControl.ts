/**
 * Centralised access-control helpers for the HR module.
 *
 * Grade index convention (0-based, matches Supabase grade_level values):
 *   L1=0  L2=1  L3=2  L4=3  L5=4  L6=5  L7=6   unknown=-1
 *
 * SUPERVISOR threshold = L4+ (index >= 3)
 */

export const GRADE_ORDER = [
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
  "L6",
  "L7",
] as const;
export type Grade = (typeof GRADE_ORDER)[number];
export type UserRole = "employee" | "admin" | "manager" | "super_admin";

/** Returns 0-based index (L1=0 … L7=6) or -1 for unknown */
export function gradeIndex(g: string | null | undefined): number {
  if (!g) return -1;
  const clean = g.replace("_", "/").split("/")[0].trim();
  return GRADE_ORDER.indexOf(clean as Grade);
}

/** L4+ is a supervisor. Grade alone determines this — role is irrelevant. */
export function isSupervisor(grade: string | null | undefined): boolean {
  return gradeIndex(grade) >= 3; // L4 = index 3
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "super_admin";
}

/**
 * Can this viewer SEE other users' records?
 *   - super_admin → yes
 *   - admin / manager (any grade) → yes (read-only unless also L4+)
 *   - L4+ (any role) → yes
 *   - employee below L4 → no
 */
export function canViewOthers(
  role: string | null | undefined,
  grade: string | null | undefined,
): boolean {
  if (isSuperAdmin(role)) return true;
  if (role === "admin" || role === "manager") return true;
  return isSupervisor(grade);
}

/**
 * Can this viewer TAKE ACTIONS (fill / create / edit / sign-off / approve)
 * on other users' records?
 *   - super_admin → yes
 *   - L4+ (any role) → yes
 *   - everyone else → no
 */
export function canActOnOthers(
  role: string | null | undefined,
  grade: string | null | undefined,
): boolean {
  if (isSuperAdmin(role)) return true;
  return isSupervisor(grade);
}

/**
 * Can viewerGrade appraise / fill a skill log for a user whose grade is targetGrade?
 * The viewer must be L4+ AND strictly above the target.
 */
export function canRateGrade(
  viewerGrade: string | null | undefined,
  targetGrade: string | null | undefined,
): boolean {
  const viewer = gradeIndex(viewerGrade);
  const target = gradeIndex(targetGrade);
  if (viewer < 3 || target === -1) return false;
  return viewer > target;
}

/**
 * Returns grades (from GRADE_ORDER) that the viewer is allowed to appraise/fill for.
 * Empty array if the viewer is below L4.
 */
export function gradeBandsBelow(viewerGrade: string | null | undefined): Grade[] {
  const viewerIdx = gradeIndex(viewerGrade);
  if (viewerIdx < 3) return [];
  return GRADE_ORDER.filter((g) => gradeIndex(g) < viewerIdx) as Grade[];
}

/**
 * Can viewer sign off a skill log whose filler had fillerGrade?
 *   - L3 and below → never
 *   - L4 (index 3) → only if fillerGrade is L3 (index 2)
 *   - L5+ (index 4+) → yes, regardless of filler grade
 */
export function canSignOffSkillLog(
  viewerGrade: string | null | undefined,
  fillerGrade: string | null | undefined,
): boolean {
  const viewer = gradeIndex(viewerGrade);
  const filler = gradeIndex(fillerGrade);
  if (viewer < 3) return false;   // L3 and below never sign off
  if (viewer >= 4) return true;   // L5+ sign off anything
  return filler === 2;             // L4 (index 3) only signs off L3-filled (index 2)
}
