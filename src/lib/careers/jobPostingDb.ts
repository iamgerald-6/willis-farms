import type { SupabaseClient } from "@supabase/supabase-js";

export const JOB_POSTINGS_MIGRATION_HINT =
  " Run docs/careers/job_postings.sql in the Supabase SQL editor, then: NOTIFY pgrst, 'reload schema';";

export function isMissingColumnError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes("schema cache") ||
    msg.includes("could not find") ||
    msg.includes("pgrst204")
  );
}

function stripMissingColumn(
  payload: Record<string, unknown>,
  errorMessage: string,
): Record<string, unknown> | null {
  if (!isMissingColumnError(errorMessage)) return null;

  const msg = errorMessage.toLowerCase();
  for (const key of Object.keys(payload)) {
    if (msg.includes(key)) {
      const next = { ...payload };
      delete next[key];
      return next;
    }
  }

  return null;
}

export async function insertJobPostingWithColumnFallback(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
) {
  let payload = { ...row };

  while (Object.keys(payload).length > 0) {
    const result = await supabase
      .from("job_postings")
      .insert(payload)
      .select("*")
      .single();

    if (!result.error) return result;

    const next = stripMissingColumn(payload, result.error.message);
    if (!next || Object.keys(next).length === 0) {
      return result;
    }
    payload = next;
  }

  return {
    data: null,
    error: { message: "Could not insert job posting — schema mismatch." },
  };
}

export async function updateJobPostingWithColumnFallback(
  supabase: SupabaseClient,
  id: string,
  updates: Record<string, unknown>,
) {
  let payload = { ...updates };

  while (Object.keys(payload).length > 0) {
    const result = await supabase
      .from("job_postings")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (!result.error) return result;

    const next = stripMissingColumn(payload, result.error.message);
    if (!next || Object.keys(next).length === 0) {
      return result;
    }
    payload = next;
  }

  return {
    data: null,
    error: { message: "Could not update job posting — schema mismatch." },
  };
}
