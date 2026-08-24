import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicationStatus, StatusHistoryEntry } from "@/lib/careers/types";

/**
 * Appends a new status entry to a history array — every job_applications
 * write that changes `status` should route through this (directly if the
 * row's current status_history is already in scope, e.g. from a `select("*")`,
 * or via fetchAndAppendStatusHistory below if it isn't). A no-op if the
 * status hasn't actually changed, so idempotent re-saves don't pad the log.
 */
export function appendStatusHistory(
  history: StatusHistoryEntry[] | null | undefined,
  status: ApplicationStatus,
  changedBy?: string | null,
): StatusHistoryEntry[] {
  const list = Array.isArray(history) ? history : [];
  if (list.length > 0 && list[list.length - 1].status === status) {
    return list;
  }
  return [...list, { status, changed_at: new Date().toISOString(), changed_by: changedBy ?? null }];
}

/**
 * For call sites that don't already have the application's current
 * status_history loaded — fetches it, appends the new status, and returns
 * the array ready to include in an .update()/.insert() payload.
 */
export async function fetchAndAppendStatusHistory(
  supabaseAdmin: SupabaseClient,
  applicationId: string,
  status: ApplicationStatus,
  changedBy?: string | null,
): Promise<StatusHistoryEntry[]> {
  const { data } = await supabaseAdmin
    .from("job_applications")
    .select("status_history")
    .eq("id", applicationId)
    .maybeSingle();

  return appendStatusHistory(
    (data?.status_history as StatusHistoryEntry[] | null | undefined) ?? [],
    status,
    changedBy,
  );
}
