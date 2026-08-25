import type { SupabaseClient } from "@supabase/supabase-js";
import { updateUserWithColumnFallback } from "@/lib/supabaseUserUpdate";

/** Disable platform access — same behaviour as User Management. */
export async function disableUserAccount(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await updateUserWithColumnFallback(supabaseAdmin, userId, {
    is_disabled: true,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  const existingMeta =
    (authUser?.user?.user_metadata as Record<string, unknown>) ?? {};

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
    userId,
    {
      user_metadata: { ...existingMeta, is_disabled: true },
      ban_duration: "876000h",
    },
  );

  if (authError) {
    return { ok: false, error: authError.message };
  }

  return { ok: true };
}
