import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { RoleInterviewReportRow } from "@/lib/careers/types";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * Finds the role_interview_reports row for a specific hiring round.
 *
 * - If jobPostingId is given, looks up the row scoped to that exact round.
 *   This is the path every current caller uses (the Approvals-tab report
 *   modal, and any applicant whose own job_posting_id is known).
 * - Otherwise falls back to the legacy lookup by role_slug where
 *   job_posting_id is still null — i.e. a report generated before rounds
 *   were tracked. This keeps old "Download role hiring summary" links (for
 *   applicants who applied before job_posting_id existed) working exactly
 *   as they did before, without ever matching a newer, round-scoped row.
 *
 * Returns null if neither identifier is usable, or no row matches.
 */
export async function findRoleReportRow(
  supabaseAdmin: SupabaseAdmin,
  { jobPostingId, roleSlug }: { jobPostingId?: string | null; roleSlug?: string | null },
): Promise<{ data: RoleInterviewReportRow | null; error: { message: string } | null }> {
  if (jobPostingId) {
    const { data, error } = await supabaseAdmin
      .from("role_interview_reports")
      .select("*")
      .eq("job_posting_id", jobPostingId)
      .maybeSingle();
    return { data: data as RoleInterviewReportRow | null, error };
  }

  if (roleSlug) {
    const { data, error } = await supabaseAdmin
      .from("role_interview_reports")
      .select("*")
      .eq("role_slug", roleSlug)
      .is("job_posting_id", null)
      .maybeSingle();
    return { data: data as RoleInterviewReportRow | null, error };
  }

  return { data: null, error: null };
}
