import api from "@/lib/api";
import type { StaffAuthBlockReason } from "@/lib/staffAccount";

/**
 * Calls GET /api/me and translates the response into a StaffAuthBlockReason
 * (or null when the account is fully usable) — the exact same check the
 * sign-in submit handler already ran right after a successful password
 * check (see (auth)/login/page.tsx onSubmit). Pulled out so the "I already
 * have a local Supabase session — is it actually a usable staff account?"
 * check can run in more than one place without duplicating the response
 * parsing.
 *
 * Why this matters beyond sign-in: a Supabase Auth session can outlive, or
 * simply never have corresponded to, a usable `public.users` row (row
 * deleted, disabled, or still pending setup). Before this existed, any page
 * that saw "a local session exists" and treated that alone as "go to the
 * dashboard" — without this check — could ping-pong forever against
 * RouteAccessGuard, which signs an account like that back out the moment it
 * lands on /dashboard: login redirects to dashboard (session exists) →
 * dashboard signs out and redirects to login (no matching staff row) →
 * login redirects to dashboard again (session-presence check alone doesn't
 * know that) → repeat, with the user stuck seeing the same toast on a loop
 * that never actually logs them in *or* leaves them logged out.
 */
export async function checkStaffAccountBlock(): Promise<StaffAuthBlockReason | null> {
  const res = await api.get("/me");
  if (!res.data?.staff_account_exists) return "not_found";
  const block = res.data?.auth_block as StaffAuthBlockReason | null | undefined;
  if (block === "disabled" || res.data?.is_disabled) return "disabled";
  if (block === "pending" || !res.data?.email_verified) return "pending";
  return null;
}
