import { createClient } from "@supabase/supabase-js";

export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost" | "archived";

/**
 * Server-side Supabase admin client (uses Service Role key).
 * IMPORTANT: Never expose the service role key to the client. Keep it server-only.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * Optional: client-safe Supabase client (anon key) for future use.
 * Not used by default in this codebase to keep the solution simple and secure.
 */
export function getSupabaseAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: { persistSession: true },
  });
}
