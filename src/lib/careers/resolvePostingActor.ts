import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { PostingHistoryActor } from "@/lib/careers/jobPostings";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/**
 * Resolves an account id into a readable name for the job-postings history
 * log. Every other "who did this" field in this app (status_history,
 * report edit logs, etc.) just stores the raw account id and is never
 * resolved to a name anywhere — which makes those logs unreadable on their
 * own. The name (and email, as a fallback) is looked up and stored directly
 * on the history entry at the time of the event, so the log stays readable
 * even if the account is later renamed or removed.
 */
export async function resolvePostingActor(
  supabaseAdmin: SupabaseAdmin,
  userId?: string | null,
): Promise<PostingHistoryActor> {
  if (!userId) return { user_id: null, name: null, email: null };

  const { data } = await supabaseAdmin
    .from("users")
    .select("first_name, last_name, email")
    .eq("user_id", userId)
    .maybeSingle();

  const name = [data?.first_name, data?.last_name]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();

  return {
    user_id: userId,
    name: name || null,
    email: data?.email ?? null,
  };
}
