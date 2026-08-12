import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// detectSessionInUrl is off: invite and password-reset links are consumed by a
// separate in-memory client (lib/auth/authLinkClient) so opening one can never
// replace the session of the person already signed in on this browser.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: false,
  },
});
