import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { hasFullAppraisalAccess } from "@/lib/accessControl";
import { isSeniorManagement, canViewAllTasks } from "@/lib/taskAccessControl";

/**
 * Shared API auth: verify Supabase JWT, resolve role from public.users with
 * auth user_metadata fallback (supports super_admin accounts that exist only
 * in Supabase Auth — not in public.users).
 */

export interface ApiRequestUser {
  id: string;
  email: string | null;
  role: string | null;
  grade_level: string | null;
  company_id: string | null;
  name: string;
  /** True when no public.users row exists (auth-metadata profile only). */
  authOnly: boolean;
  tm_can_view_all_tasks: boolean | null;
  canViewAllTasks: boolean;
}

let _admin: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient | null {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

function metadataRole(authUser: { user_metadata?: Record<string, unknown> }): string | null {
  const role = authUser.user_metadata?.role;
  return typeof role === "string" && role.trim() ? role.trim() : null;
}

export function jsonUnauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function jsonForbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** Verify Bearer token and resolve caller profile (DB + metadata fallback). */
export async function getApiRequestUser(
  req: NextRequest,
): Promise<ApiRequestUser | null> {
  const supabaseAdmin = getAdminClient();
  if (!supabaseAdmin) return null;

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user) return null;

  const authUser = authData.user;

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select(
      "user_id, role, grade_level, first_name, last_name, email, company_id, tm_can_view_all_tasks",
    )
    .eq("user_id", authUser.id)
    .maybeSingle();

  const role = profile?.role ?? metadataRole(authUser);
  const email = profile?.email ?? authUser.email ?? null;
  const name = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || (email ?? "Unknown")
    : (email ?? "Unknown");

  return {
    id: authUser.id,
    email,
    role,
    grade_level: profile?.grade_level ?? null,
    company_id: profile?.company_id ?? null,
    name,
    authOnly: !profile,
    tm_can_view_all_tasks: profile?.tm_can_view_all_tasks ?? null,
    canViewAllTasks: canViewAllTasks(role, profile?.tm_can_view_all_tasks),
  };
}

export async function requireAuth(req: NextRequest): Promise<ApiRequestUser | null> {
  return getApiRequestUser(req);
}

export async function requireSeniorManagement(
  req: NextRequest,
): Promise<ApiRequestUser | null> {
  const user = await getApiRequestUser(req);
  if (!user || !isSeniorManagement(user.role)) return null;
  return user;
}

export async function requireFullAppraisalAccess(
  req: NextRequest,
): Promise<ApiRequestUser | null> {
  const user = await getApiRequestUser(req);
  if (!user || !hasFullAppraisalAccess(user.role, user.grade_level)) return null;
  return user;
}

export function canAccessAppraisalRecord(
  user: ApiRequestUser,
  record: {
    company_id?: string | null;
    employee_user_id?: string | null;
    supervisor_id?: string | null;
  },
): boolean {
  if (hasFullAppraisalAccess(user.role, user.grade_level)) return true;
  if (user.id && record.employee_user_id === user.id) return true;
  if (user.id && record.supervisor_id === user.id) return true;
  if (user.company_id && record.company_id === user.company_id) return true;
  return false;
}

/** Admin client for routes that import from taskManagerAuth. */
export function getSupabaseAdminFromAuth(): SupabaseClient | null {
  return getAdminClient();
}
