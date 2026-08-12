import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * Invite and password-reset links must never touch the session of whoever is
 * already signed in on this browser. This client keeps the link's session in
 * memory only: nothing is written to localStorage, nothing is read from it,
 * and signing it out cannot revoke another account's session.
 */
let client: SupabaseClient | null = null;

export function getAuthLinkClient(): SupabaseClient {
  if (client) return client;
  client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "willsfarms-auth-link",
      },
    },
  );
  return client;
}

export type AuthLinkKind = "invite" | "recovery" | "unknown";

export type AuthLinkParams =
  | { kind: AuthLinkKind; mode: "tokens"; accessToken: string; refreshToken: string }
  | { kind: AuthLinkKind; mode: "token_hash"; tokenHash: string };

export type AuthLinkReadResult =
  | { status: "ok"; params: AuthLinkParams }
  | { status: "expired"; kind: AuthLinkKind }
  | { status: "missing" };

function normalizeKind(value: string | null): AuthLinkKind {
  if (value === "recovery") return "recovery";
  if (value === "invite" || value === "signup" || value === "magiclink") return "invite";
  return "unknown";
}

/** Read the one-time credentials Supabase appended to the redirect URL. */
export function readAuthLinkFromUrl(): AuthLinkReadResult {
  if (typeof window === "undefined") return { status: "missing" };

  const hash = new URLSearchParams(
    window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash,
  );
  const query = new URLSearchParams(window.location.search);

  const kind = normalizeKind(hash.get("type") ?? query.get("type"));

  if (hash.get("error") || query.get("error")) {
    return { status: "expired", kind };
  }

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    return {
      status: "ok",
      params: { kind, mode: "tokens", accessToken, refreshToken },
    };
  }

  const tokenHash = hash.get("token_hash") ?? query.get("token_hash");
  if (tokenHash) {
    return { status: "ok", params: { kind, mode: "token_hash", tokenHash } };
  }

  return { status: "missing" };
}

/** Remove the one-time credentials from the address bar once consumed. */
export function stripAuthLinkFromUrl(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", window.location.pathname);
}

export type AuthLinkSession = {
  user: User;
  accessToken: string;
};

export async function openAuthLinkSession(
  params: AuthLinkParams,
): Promise<{ session: AuthLinkSession } | { error: string }> {
  const supabase = getAuthLinkClient();

  if (params.mode === "token_hash") {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: params.tokenHash,
      type: params.kind === "recovery" ? "recovery" : "invite",
    });
    if (error || !data.session?.user) {
      return { error: error?.message ?? "This link is no longer valid." };
    }
    return {
      session: { user: data.session.user, accessToken: data.session.access_token },
    };
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: params.accessToken,
    refresh_token: params.refreshToken,
  });

  if (error || !data.session?.user) {
    return { error: error?.message ?? "This link is no longer valid." };
  }

  return {
    session: { user: data.session.user, accessToken: data.session.access_token },
  };
}

/** Ends the link session only — never the signed-in user's session. */
export async function closeAuthLinkSession(): Promise<void> {
  try {
    await getAuthLinkClient().auth.signOut({ scope: "local" });
  } catch {
    // In-memory session; nothing to clean up if this fails.
  }
}

/** Calls an app API route as the link's owner, not as the browser's session. */
export async function authLinkFetch(
  path: string,
  accessToken: string,
  init?: { method?: string },
): Promise<Response> {
  return fetch(path, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}
