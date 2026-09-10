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
  type PagePermissionKey,
} from "@/lib/pagePermissions";
import { fetchGroupPresetsFromDb } from "@/lib/groupPermissionPresets";
import { canPerformModuleAction } from "@/lib/permissionActions";
import type { PermissionAction } from "@/lib/moduleRegistry/types";
import {
  hasBroadElevatedAccessByRoleLabel,
  resolveEffectiveUserRoleLabel,
  resolveUserRoleLabelById,
} from "@/lib/userRoleAccessControl";

/** HC modules that read org-structure dropdowns without opening System Definitions. */
const HC_ORG_STRUCTURE_READ_KEYS: PagePermissionKey[] = [
  "hc:recruitment",
  "hc:appraisal",
  "hc:skillLog",
  "hc:leave",
  "hc:promotion",
  "hc:justifications",
];

/**
 * Shared API auth: verify Supabase JWT, resolve role from public.users with
 * auth user_metadata fallback (supports super_admin accounts that exist only
 * in Supabase Auth — not in public.users).
 */

export interface ApiRequestUser {
  id: string;
  email: string | null;
  /** Effective role for access-control purposes — the resolved "User role"
   * label (Standard, Executive, Supervisory, ...) when the caller has one
   * set, else the raw old role column value. See userRoleAccessControl.ts. */
  role: string | null;
  /** Raw old role column value, kept alongside `role` for anything that
   * specifically needs the legacy enum rather than the effective role. */
  legacy_role: string | null;
  user_role_id: string | null;
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

  // Both Supabase calls below hit the network. A transient DNS/connectivity
  // blip to the Supabase host (seen as "TypeError: fetch failed" /
  // "getaddrinfo ENOTFOUND") used to throw uncaught here, turning into a
  // hard 500 on every route that calls this (i.e. almost all of them) and
  // surfacing to the browser as a generic "Load failed" fetch error. Treat
  // it the same as "not authenticated" instead of crashing the request.
  let authData;
  try {
    const { data, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !data?.user) return null;
    authData = data;
  } catch (err) {
    console.error("[getApiRequestUser] auth.getUser failed", err);
    return null;
  }

  const authUser = authData.user;

  let profile: {
    role?: string | null;
    user_role_id?: string | null;
    grade_level?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    company_id?: string | null;
    tm_can_view_all_tasks?: boolean | null;
    access_tier?: string | null;
    page_permissions?: string[] | null;
    page_permission_levels?: AccessProfile["page_permission_levels"];
    page_permission_actions?: AccessProfile["page_permission_actions"];
  } | null = null;
  try {
    // grade_level is no longer a stored column — derived live via the
    // grade_level_id FK join to the Organizational Structure "Grade levels"
    // catalog, so it can never drift out of sync with the catalog. See
    // docs/organizational-structure/drop-users-grade-level-column.sql.
    const { data } = await supabaseAdmin
      .from("users")
      .select(
        "user_id, role, user_role_id, grade_level_id, grade_levels(code), first_name, last_name, email, company_id, tm_can_view_all_tasks, access_tier, page_permissions, page_permission_levels, page_permission_actions",
      )
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (data) {
      const { grade_levels, ...rest } = data as typeof data & {
        grade_levels?: { code: string | null } | null;
      };
      profile = { ...rest, grade_level: grade_levels?.code ?? null };
    }
  } catch (err) {
    console.error("[getApiRequestUser] users lookup failed", err);
  }

  // Kept only for display/reference — access decisions never use this.
  const legacyRole = profile?.role ?? metadataRole(authUser);
  // Resolved "User role" label is the sole source of truth for access
  // control — see userRoleAccessControl.ts. We never fall back to the old
  // employee/manager/admin/super_admin role column; an unassigned "User
  // role" defaults to Standard Role.
  const userRoleLabel = await resolveUserRoleLabelById(
    supabaseAdmin,
    profile?.user_role_id,
  );
  const role = resolveEffectiveUserRoleLabel(userRoleLabel);
  const email = profile?.email ?? authUser.email ?? null;
  const name = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || (email ?? "Unknown")
    : (email ?? "Unknown");

  return {
    id: authUser.id,
    email,
    role,
    legacy_role: legacyRole,
    user_role_id: profile?.user_role_id ?? null,
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
      // user.role is ALREADY the fully resolved effective role label (see
      // getApiRequestUser's resolveEffectiveUserRoleLabel call) — set it as
      // user_role_label too so resolveAccessProfile doesn't recompute a
      // fresh "no user_role_label on this object" default (Standard Role)
      // and silently discard it. Without this, every server-side
      // AccessProfile built here collapsed to Standard Role regardless of
      // the caller's actual role.
      user_role_label: user.role,
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

/**
 * Read org-structure catalogs (custom lists, mapping levels/nodes) for Human
 * Capital workflows. Does not grant System Definitions edit access or the
 * sys:definitions page — only GET data needed by recruitment, appraisal, etc.
 */
export async function requireOrganizationalStructureReadAccess(
  req: NextRequest,
): Promise<ApiRequestUser | null> {
  const user = await getApiRequestUser(req);
  if (!user) return null;

  const supabaseAdmin = getAdminClient();
  const { presets } = supabaseAdmin
    ? await fetchGroupPresetsFromDb(supabaseAdmin)
    : { presets: {} };

  const profile = callerAccessProfile(user);

  if (
    canPerformModuleAction(
      profile,
      "sys:definitions",
      "view",
      user.role,
      presets,
    )
  ) {
    return user;
  }

  if (hasBroadElevatedAccessByRoleLabel(user.role)) {
    return user;
  }

  if (
    HC_ORG_STRUCTURE_READ_KEYS.some((key) =>
      canPerformModuleAction(profile, key, "view", user.role, presets),
    )
  ) {
    return user;
  }

  return null;
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
  if (!user || !hasFullAppraisalAccess(user.role)) return null;
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

export { canAccessAppraisalRecord } from "@/lib/appraisalAccess";

/** Admin client for routes that import from taskManagerAuth. */
export function getSupabaseAdminFromAuth(): SupabaseClient | null {
  return getAdminClient();
}
