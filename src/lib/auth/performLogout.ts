import { supabase } from "@/lib/supabaseClient";
import { ignoreNavigationAbort } from "@/lib/navigation/safeNavigation";

type RouterLike = { replace: (path: string) => void };

/**
 * Fast sign-out: clear the local session immediately, redirect, then best-effort
 * revoke refresh tokens on Supabase without blocking the UI.
 *
 * `supabase.auth.signOut()` with no scope waits on a global revoke request
 * (often 1–3s+). That blocked logout and could make /login briefly think the
 * user was still signed in and bounce them back to the dashboard.
 */
export async function performLogout(
  router?: RouterLike,
  redirectTo = "/login",
): Promise<void> {
  const globalRevoke = supabase.auth.signOut({ scope: "global" });
  await supabase.auth.signOut({ scope: "local" });

  if (router) {
    void ignoreNavigationAbort(router.replace(redirectTo));
  }

  void globalRevoke.catch(() => {
    // Local session is already cleared; server revoke is best-effort only.
  });
}
