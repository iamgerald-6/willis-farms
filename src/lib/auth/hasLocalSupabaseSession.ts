/**
 * Fast, synchronous peek at localStorage for a Supabase session token.
 *
 * Supabase (with the default localStorage-based session storage) persists
 * the session under a `sb-<project-ref>-auth-token` key. Reading this is
 * synchronous and instant, unlike `supabase.auth.getSession()` which is
 * async. We use this to decide, before first paint, whether a page needs to
 * hold off rendering (likely-logged-in visitor who should bounce to the
 * dashboard) or can render immediately (no local token => definitely a
 * guest, nothing to check).
 *
 * This is only a fast pre-check — the caller must still confirm with
 * `supabase.auth.getSession()` since the token could be stale/expired.
 */
export function hasLocalSupabaseSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const { localStorage } = window;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.*-auth-token$/.test(key) && localStorage.getItem(key)) {
        return true;
      }
    }
  } catch {
    // localStorage can throw in some privacy modes — treat as "no session".
  }
  return false;
}
