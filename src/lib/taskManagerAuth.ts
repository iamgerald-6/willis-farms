import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isSeniorManagement } from "@/lib/taskAccessControl";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export interface RequestUser {
  id: string;
  email: string | null;
  role: string | null;
  name: string;
}

/**
 * Verifies the caller's Supabase access token (sent as
 * `Authorization: Bearer <token>`) and looks up their role/name from the
 * `users` table.
 *
 * This is stricter than most existing API routes in this app, which mostly
 * trust whatever the client sends. It's worth the extra step here because
 * every task edit/archive/delete has to be logged with a real, verified
 * name — not one supplied by the client — and only Senior Management is
 * allowed to write at all.
 */
export async function getRequestUser(req: NextRequest): Promise<RequestUser | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) return null;

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("user_id, role, first_name, last_name, email")
    .eq("user_id", authData.user.id)
    .single();

  return {
    id: authData.user.id,
    email: profile?.email ?? authData.user.email ?? null,
    role: profile?.role ?? null,
    name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : (authData.user.email ?? "Unknown"),
  };
}

/**
 * Use at the top of any write route (create/edit/archive/delete/restore,
 * project create, extraction save, report send). Returns the verified user
 * if they're Senior Management, otherwise null — callers should respond
 * 401/403 when this is null.
 */
export async function requireSeniorManagement(req: NextRequest): Promise<RequestUser | null> {
  const user = await getRequestUser(req);
  if (!user || !isSeniorManagement(user.role)) return null;
  return user;
}

export { supabaseAdmin };
