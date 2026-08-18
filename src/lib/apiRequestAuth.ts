import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { hasFullAppraisalAccess } from "@/lib/accessControl";
import { isSeniorManagement, canViewAllTasks } from "@/lib/taskAccessControl";
import {
  canAddUser,
  canManageUserAccounts,
  canOpenUserManagement,
  type PermissionLevel,
} from "@/lib/permissionLevels";
import {
  resolveAccessProfile,
  type AccessProfile,
} from "@/lib/pagePermissions";
import { fetchGroupPresetsFromDb } from "@/lib/groupPermissionPresets";
import { canPerformModuleAction } from "@/lib/permissionActions";
import type { PermissionAction } from "@/lib/moduleRegistry/types";

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
  access_tier?: string | null;
  page_permissions?: string[] | null;
  page_permission_levels?: AccessProfile["page_permission_levels"];
  page_permission_actions?: AccessProfile["page_permission_actions"];
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
      "user_id, role, grade_level, first_name, last_name, email, company_id, tm_can_view_all_tasks, access_tier, page_permissions, page_permission_levels, page_permission_actions",
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
    access_tier: profile?.access_tier ?? null,
    page_permissions: profile?.page_permissions ?? null,
    page_permission_levels: profile?.page_permission_levels ?? null,
    page_permission_actions: profile?.page_permission_actions ?? null,
  };
}

function callerAccessProfile(user: ApiRequestUser): AccessProfile {
  return resolveAccessProfile(
    {
      role: user.role,
      grade_level: user.grade_level,
      access_tier: user.access_tier,
      page_permissions: user.page_permissions,
      page_permission_levels: user.page_permission_levels,
      page_permission_actions: user.page_permission_actions,
    },
    user.role,
  )!;
}

export async function requireUserManagementAccess(
  req: NextRequest,
  minimum: PermissionLevel = "view",
): Promise<ApiRequestUser | null> {
  const user = await getApiRequestUser(req);
  if (!user) return null;

  const profile = callerAccessProfile(user);
  const ok =
    minimum === "view"
      ? canOpenUserManagement(profile, user.role)
      : minimum === "add"
        ? canAddUser(profile, user.role)
        : canManageUserAccounts(profile, user.role);

  return ok ? user : null;
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

/** System Definitions — permission matrix (sys:definitions). Pass one action or any-of. */
export async function requireSystemDefinitionsAccess(
  req: NextRequest,
  minimum: PermissionAction | PermissionAction[] = "edit",
): Promise<ApiRequestUser | null> {
  const user = await getApiRequestUser(req);
  if (!user) return null;

  const supabaseAdmin = getAdminClient();
  const { presets } = supabaseAdmin
    ? await fetchGroupPresetsFromDb(supabaseAdmin)
    : { presets: {} };

  const profile = callerAccessProfile(user);
  const actions = Array.isArray(minimum) ? minimum : [minimum];
  const ok = actions.some((action) =>
    canPerformModuleAction(
      profile,
      "sys:definitions",
      action,
      user.role,
      presets,
    ),
  );
  if (!ok) return null;
  return user;
}

export async function requireFullAppraisalAccess(
  req: NextRequest,
): Promise<ApiRequestUser | null> {
  const user = await getApiRequestUser(req);
  if (!user || !hasFullAppraisalAccess(user.role, user.grade_level)) return null;
  return user;
}

export type SkillLogAuthContext = {
  user: ApiRequestUser;
  profile: AccessProfile;
  presets: Awaited<ReturnType<typeof fetchGroupPresetsFromDb>>["presets"];
};

/** Resolve caller profile + group presets for skill log record checks. */
export async function getSkillLogAuthContext(
  req: NextRequest,
): Promise<SkillLogAuthContext | null> {
  const user = await getApiRequestUser(req);
  if (!user) return null;

  const supabaseAdmin = getAdminClient();
  const { presets } = supabaseAdmin
    ? await fetchGroupPresetsFromDb(supabaseAdmin)
    : { presets: {} };

  return {
    user,
    profile: callerAccessProfile(user),
    presets,
  };
}

/** Skill Logs — permission matrix (hc:skillLog). Pass one action or any-of. */
export async function requireSkillLogAccess(
  req: NextRequest,
  minimum: PermissionAction | PermissionAction[] = "view",
): Promise<SkillLogAuthContext | null> {
  const ctx = await getSkillLogAuthContext(req);
  if (!ctx) return null;

  const actions = Array.isArray(minimum) ? minimum : [minimum];
  const ok = actions.some((action) =>
    canPerformModuleAction(
      ctx.profile,
      "hc:skillLog",
      action,
      ctx.user.role,
      ctx.presets,
    ),
  );
  if (!ok) return null;
  return ctx;
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
