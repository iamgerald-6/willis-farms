import type { SupabaseClient } from "@supabase/supabase-js";

/** Columns added by access-control migrations — may be absent on older DBs. */
const OPTIONAL_USER_COLUMNS = [
  "page_permission_actions",
  "page_permission_levels",
  "page_permissions",
  "access_tier",
  "access_updated_at",
  "access_updated_by",
  "created_by",
  "role",
  "is_disabled",
  "email_verified",
  "email_confirm",
] as const;

export function isMissingColumnError(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes("schema cache") || msg.includes("could not find");
}

function stripMissingColumn(
  payload: Record<string, unknown>,
  errorMessage: string,
): Record<string, unknown> | null {
  if (!isMissingColumnError(errorMessage)) return null;

  const msg = errorMessage.toLowerCase();
  for (const col of OPTIONAL_USER_COLUMNS) {
    if (msg.includes(col) && col in payload) {
      const next = { ...payload };
      delete next[col];
      return next;
    }
  }

  for (const key of Object.keys(payload)) {
    if (msg.includes(key)) {
      const next = { ...payload };
      delete next[key];
      return next;
    }
  }

  return null;
}

export const ACCESS_CONTROL_MIGRATION_HINT =
  " Run the access-control SQL in docs/ACCESS_CONTROL_SUPABASE.md (§1), then: NOTIFY pgrst, 'reload schema';";

/**
 * PATCH public.users, dropping optional columns one at a time when the DB or
 * PostgREST schema cache doesn't have them yet. Lets disable-account work
 * even before every migration column exists.
 */
export async function updateUserWithColumnFallback(
  supabaseAdmin: SupabaseClient,
  userId: string,
  updates: Record<string, unknown>,
) {
  let payload = { ...updates };

  while (Object.keys(payload).length > 0) {
    const result = await supabaseAdmin
      .from("users")
      .update(payload)
      .eq("user_id", userId)
      .select()
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
    error: { message: "No updatable user columns matched the current schema." },
  };
}
