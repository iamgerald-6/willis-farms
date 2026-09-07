import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Site/Business unit/Department/Section/Position/Grade level to copy onto a
 * new employee record from the job posting they were hired against (see
 * users-org-placement.sql). Every posting has these set (Grade level and
 * the org-structure chain are required on Create job posting) — a null
 * here just means this particular posting predates that requirement, or
 * there's no linked posting at all.
 */
export type EmployeeOrgPlacement = {
  site_id: string | null;
  business_unit_id: string | null;
  department_id: string | null;
  section_id: string | null;
  position_id: string | null;
  grade_level_id: string | null;
};

const EMPTY_PLACEMENT: EmployeeOrgPlacement = {
  site_id: null,
  business_unit_id: null,
  department_id: null,
  section_id: null,
  position_id: null,
  grade_level_id: null,
};

export async function resolveEmployeeOrgPlacementFromPosting(
  supabase: SupabaseClient,
  jobPostingId: string | null | undefined,
): Promise<EmployeeOrgPlacement> {
  if (!jobPostingId) return EMPTY_PLACEMENT;

  const { data } = await supabase
    .from("job_postings")
    .select(
      "site_id, business_unit_id, department_id, section_id, position_id, grade_level_id",
    )
    .eq("id", jobPostingId)
    .maybeSingle();

  if (!data) return EMPTY_PLACEMENT;

  return {
    site_id: data.site_id ?? null,
    business_unit_id: data.business_unit_id ?? null,
    department_id: data.department_id ?? null,
    section_id: data.section_id ?? null,
    position_id: data.position_id ?? null,
    grade_level_id: data.grade_level_id ?? null,
  };
}
