import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONSULTANT_GRADE_ID,
  type GradeLevelDef,
  type GradeLevelsConfig,
  type GradeRoleKind,
} from "@/lib/systemDefinitions/gradeLevelsConfig";

type GradeLevelRow = {
  code: string;
  label: string;
  sort_order?: number | null;
  rank?: number | null;
  role_kind?: string | null;
  is_active: boolean;
};

function rowToGradeLevelDef(row: GradeLevelRow): GradeLevelDef {
  const code = row.code.trim().toLowerCase();
  const roleKind: GradeRoleKind =
    row.role_kind === "consultant" ||
    code === CONSULTANT_GRADE_ID ||
    code.endsWith("_consultant")
      ? "consultant"
      : "ranked";
  return {
    id: row.code,
    rank: roleKind === "consultant" ? 0 : (row.rank ?? row.sort_order ?? 0),
    label: row.label,
    roleKind,
  };
}

/**
 * Load grade levels from the Organizational Structure catalog
 * (grade_levels table). No hardcoded fallback list.
 */
export async function fetchGradeLevelsConfig(
  supabase: SupabaseClient,
): Promise<GradeLevelsConfig> {
  const { data, error } = await supabase
    .from("grade_levels")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data || data.length === 0) return {};

  return { levels: (data as GradeLevelRow[]).map(rowToGradeLevelDef) };
}
