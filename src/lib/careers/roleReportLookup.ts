import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { RoleInterviewReportRow } from "@/lib/careers/types";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * Finds the role_interview_reports row for a specific hiring round, scoped
 * to its job_posting_id. The old role_slug-only lookup (for reports
 * generated before rounds were tracked) has been removed — every report is
 * now looked up strictly by job_posting_id.
 *
 * Returns null if jobPostingId is missing, or no row matches.
 */
export async function findRoleReportRow(
  supabaseAdmin: SupabaseAdmin,
  { jobPostingId }: { jobPostingId?: string | null },
): Promise<{ data: RoleInterviewReportRow | null; error: { message: string } | null }> {
  if (!jobPostingId) return { data: null, error: null };

  const { data, error } = await supabaseAdmin
    .from("role_interview_reports")
    .select("*")
    .eq("job_posting_id", jobPostingId)
    .maybeSingle();
  return { data: data as RoleInterviewReportRow | null, error };
}
