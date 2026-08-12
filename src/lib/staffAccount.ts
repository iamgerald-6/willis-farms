import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmailVerified } from "@/lib/userAccountStatus";

export type StaffAccountRow = {
  user_id: string;
  email_verified: boolean | string | null;
  is_disabled: boolean;
};

export type StaffAuthBlockReason = "not_found" | "pending" | "disabled";

const MESSAGES: Record<StaffAuthBlockReason, string> = {
  not_found: "No staff account found for this email.",
  pending:
    "Account setup is not complete. Contact your administrator to resend your setup email.",
  disabled: "This account has been disabled. Contact an administrator.",
};

export function staffAuthBlockMessage(reason: StaffAuthBlockReason): string {
  return MESSAGES[reason];
}

/** Why a staff member cannot use login / forgot-password / dashboard. */
export function getStaffAuthBlockReason(
  account: StaffAccountRow | null | undefined,
): StaffAuthBlockReason | null {
  if (!account) return "not_found";
  if (account.is_disabled) return "disabled";
  if (!isEmailVerified(account)) return "pending";
  return null;
}

export async function lookupStaffByEmail(
  supabaseAdmin: SupabaseClient,
  email: string,
): Promise<StaffAccountRow | null> {
  // Stored emails are not guaranteed to be lower-cased, so match case-insensitively.
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("user_id, email_verified, is_disabled")
    .ilike("email", normalized)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function lookupStaffByUserId(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<StaffAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("user_id, email_verified, is_disabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
