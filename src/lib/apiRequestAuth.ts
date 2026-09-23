import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { hasFullAppraisalAccess, isSupervisor } from "@/lib/accessControl";
import { isSeniorManagement, canViewAllTasks } from "@/lib/taskAccessControl";
import {
  canAddUser,
  canManageUserAccounts,
  canOpenUserManagement,
  type PermissionLevel,
} from "@/lib/permissionLevels";
import {
  resolveAccessProfile,
  isFullRoleAccess,
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
  isSupervisoryRoleLabel,
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
  /** Employee's own site (users.site_id) — null if unplaced or auth-only. */
  site_id: number | null;
  /** True when site_id's site is marked headquarters (sites.is_headquarters)
   * — the one case where a person sees every site's data regardless of
   * role. See src/lib/siteAccess.ts, the shared consumer of this flag. */
  is_headquarters_site: boolean;
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
    site_id?: number | null;
    is_headquarters_site?: boolean;
  } | null = null;
  try {
    // grade_level is no longer a stored column — derived live via the
    // grade_level_id FK join to the Organizational Structure "Grade levels"
    // catalog, so it can never drift out of sync with the catalog. See
    // docs/organizational-structure/drop-users-grade-level-column.sql.
    // site_id's headquarters status is resolved the same way, via a join to
    // sites(is_headquarters) rather than a separately-maintained flag on
    // the user — see docs/multi-site/add-headquarters-and-site-access-foundation.sql.
    const { data } = await supabaseAdmin
      .from("users")
      .select(
        "user_id, role, user_role_id, grade_level_id, grade_levels(code), first_name, last_name, email, company_id, tm_can_view_all_tasks, access_tier, page_permissions, page_permission_levels, page_permission_actions, site_id, sites(is_headquarters)",
      )
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (data) {
      const { grade_levels, sites, ...rest } = data as typeof data & {
        grade_levels?: { code: string | null } | null;
        sites?: { is_headquarters: boolean | null } | null;
      };
      // Supabase's untyped client sometimes infers a to-one join like this
      // as an array rather than a single object (no generated types in
      // this project to tell it otherwise) — the exact same quirk
      // siteIdFromJoin() normalizes for site_id joins elsewhere. Reading
      // `sites?.is_headquarters` directly on an array silently evaluates
      // to undefined, which made every headquarters-placed caller resolve
      // as a non-headquarters SITE-scoped caller instead of ALL_SITES.
      const siteRow = Array.isArray(sites) ? sites[0] : sites;
      profile = {
        ...rest,
        grade_level: grade_levels?.code ?? null,
        is_headquarters_site: siteRow?.is_headquarters ?? false,
      };
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
    site_id: profile?.site_id ?? null,
    is_headquarters_site: profile?.is_headquarters_site ?? false,
  };
}

/**
 * Some actions are restricted to headquarters PLACEMENT specifically, not
 * just "has the right role/permission" — Sheila's explicit call: User
 * Management, System Definitions, Recruitment (including the Appraisal
 * grade-template and Skill Log template admin screens, both routed through
 * System Definitions/Recruitment's own checks), uploading Policies/SOPs,
 * and uploading a new User Manual version should only be usable by someone
 * placed at the headquarters site — same "WHERE you're placed, not your
 * role" rule as everywhere else in the multi-site work (see
 * src/lib/siteAccess.ts), just applied to specific management ACTIONS
 * rather than to which records a query returns. An Executive Role/Super
 * Admin/HR user at a non-headquarters site fails this the same as anyone
 * else — there is no role that bypasses it.
 */
function isHeadquartersCaller(user: ApiRequestUser): boolean {
  return user.is_headquarters_site === true;
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

  const supabaseAdmin = getAdminClient();
  const { presets } = supabaseAdmin
    ? await fetchGroupPresetsFromDb(supabaseAdmin)
    : { presets: {} };

  const profile = callerAccessProfile(user);
  const ok =
    minimum === "view"
      ? canOpenUserManagement(profile, user.role, presets)
      : minimum === "add"
        ? canAddUser(profile, user.role, presets)
        : canManageUserAccounts(profile, user.role, presets);
  if (!ok) return null;

  // User Management is headquarters-only in full — see isHeadquartersCaller.
  // A site's own Senior Management/Super Admin can no longer manage users
  // at their own site either; only headquarters can touch any user
  // anywhere now.
  if (!isHeadquartersCaller(user)) return null;

  return user;
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
 * Senior Management (Super Admin / Executive Role / Human Resource) PLUS
 * headquarters placement — Sheila's explicit call for the three admin-
 * level Task Manager surfaces (Monthly Report, Automation, Manage
 * Projects): a Senior Management account at a non-headquarters site should
 * not see or use these at all, not just be scoped to their own site's data.
 * Deliberately a separate helper from requireSeniorManagement rather than
 * adding the headquarters check there directly — plenty of other Task
 * Manager actions (archiving/restoring/deleting an individual task or
 * project, the documents extraction flow, notify-assignees, the per-user tm
 * permissions matrix) still use the site-scoped requireSeniorManagement and
 * were not part of this request.
 */
export async function requireSeniorManagementAtHeadquarters(
  req: NextRequest,
): Promise<ApiRequestUser | null> {
  const user = await getApiRequestUser(req);
  if (!user || !isSeniorManagement(user.role)) return null;
  if (!isHeadquartersCaller(user)) return null;
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

  // System Definitions (including the Skill Log template admin screens,
  // which route through this same check) is headquarters-only — see
  // isHeadquartersCaller.
  if (!isHeadquartersCaller(user)) return null;

  return user;
}

/** Appraisal grade templates (the "Manage appraisals" question-set builder,
 * matched per Site/Business unit/Department/Section/Position/Grade level) —
 * permission matrix ("hc:recruitment"), not System Definitions. This moved
 * out from under sys:definitions on Sheila's explicit call: it's a
 * Recruitment/org-placement concern, not a System Definitions one, and
 * gating it on sys:definitions was silently locking Human Resource out
 * (excluded from sys:definitions by default — see
 * HUMAN_RESOURCE_EXCLUDED_PAGE_KEYS) even though HR already sees the
 * "Manage appraisals" tab via hasFullAppraisalAccess. HR/Executive/Super
 * Admin already have hc:recruitment by default (or bypass entirely via
 * isFullRoleAccess), so this fixes HR without changing anyone else's
 * access. Pass one action or any-of. */
/**
 * General-purpose "does this caller have Recruitment access" check — the
 * one every Recruitment API route (postings, applications, interviews,
 * onboarding, employees) should call. Added as part of Phase 3's
 * Recruitment pass: the audit found NONE of these routes had any server-
 * side authorization at all — only a frontend page-level check
 * (hc:recruitment) that a direct API call bypasses entirely. This closes
 * that gap; site filtering (src/lib/siteAccess.ts) is applied separately,
 * after this auth check passes.
 */
export async function requireRecruitmentAccess(
  req: NextRequest,
  minimum: PermissionAction | PermissionAction[] = "view",
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
      "hc:recruitment",
      action,
      user.role,
      presets,
    ),
  );
  if (!ok) return null;

  // Recruitment overall is headquarters-only (including the Appraisal
  // grade-template admin screens, which route through
  // requireAppraisalGradeTemplateAccess -> this same check) — see
  // isHeadquartersCaller. Site-level staff lose Recruitment access
  // entirely, not just job-posting creation.
  if (!isHeadquartersCaller(user)) return null;

  return user;
}

/**
 * General-purpose "does this caller have Promotion access" check — mirrors
 * requireRecruitmentAccess but against the "hc:promotion" permission key.
 * Added as part of Phase 3's promotions pass: post_promotions previously
 * trusted a client-supplied `submitted_by_user_id` with no verification the
 * caller actually WAS that person, and get_pending/get_promotions had no
 * auth check at all.
 */
export async function requirePromotionAccess(
  req: NextRequest,
  minimum: PermissionAction | PermissionAction[] = "view",
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
    canPerformModuleAction(profile, "hc:promotion", action, user.role, presets),
  );
  if (!ok) return null;
  return user;
}

/**
 * General-purpose "does this caller have Policies management access"
 * check — mirrors requireRecruitmentAccess/requirePromotionAccess against
 * the "policies" permission key (the same key the Policies page's frontend
 * already checks via canPerformModuleAction for its own "isAdmin"/manage
 * gate). Added because PATCH/DELETE /api/policies/[id] previously had no
 * auth check at all — anyone could edit or permanently delete any manual.
 * Default minimum matches the frontend's own gate exactly: the Policies
 * page bundles upload/edit/delete into a single "add" action check rather
 * than separate view/edit/delete grants, so this does the same instead of
 * introducing a distinction the rest of the app doesn't have.
 */
export async function requirePolicyManageAccess(
  req: NextRequest,
  minimum: PermissionAction | PermissionAction[] = "add",
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
    canPerformModuleAction(profile, "policies", action, user.role, presets),
  );
  if (!ok) return null;

  // Uploading/editing/deleting Policies manuals is headquarters-only — see
  // isHeadquartersCaller. Reading Policies stays available to everyone
  // (subject to the site tag check in get_policies), only managing them
  // is restricted here.
  if (!isHeadquartersCaller(user)) return null;

  return user;
}

/** Grade templates' own access check is identical to Recruitment's — kept
 * as a distinctly-named wrapper only because it's called from appraisal
 * grade template routes and the name documents *why* those routes check
 * hc:recruitment (see the comment above this wrapper for the history). */
export async function requireAppraisalGradeTemplateAccess(
  req: NextRequest,
  minimum: PermissionAction | PermissionAction[] = "view",
): Promise<ApiRequestUser | null> {
  return requireRecruitmentAccess(req, minimum);
}

/**
 * Skill Log template management (Manage skill logs tab) — mirrors
 * requireAppraisalGradeTemplateAccess's fix: these routes used to check
 * "sys:definitions", which Human Resource is deliberately excluded from
 * (see HUMAN_RESOURCE_EXCLUDED_PAGE_KEYS), even though the frontend already
 * shows "Manage skill logs" to HR via hasFullSkillLogAccess (Senior
 * Management) + headquarters — same silent-403-reads-as-empty-list bug
 * class as the appraisal grade templates and task-manager documents fixes.
 * Checks "hc:skillLog" instead, and is headquarters-only (template scope
 * applies org-wide, same as appraisal grade templates).
 */
export async function requireSkillLogTemplateAccess(
  req: NextRequest,
  // Standard Role and Supervisory Role both already get "view"/"add"/"edit"
  // on hc:skillLog for filling out logs themselves — that's not enough to
  // gate template management, which is Senior Management only (same tier
  // as the frontend's canManageTemplates = hasFullSkillLogAccess check).
  // "approve" on hc:skillLog is only ever granted to Executive/Human
  // Resource/Super Admin (see humanResourceRolePermissionActions and
  // defaultFullAccessActions), so it's the right minimum for every method
  // here, not just sign-off.
  minimum: PermissionAction | PermissionAction[] = "approve",
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
    canPerformModuleAction(profile, "hc:skillLog", action, user.role, presets),
  );
  if (!ok) return null;

  if (!isHeadquartersCaller(user)) return null;

  return user;
}

/** User Manual upload — permission matrix ("user-manual", "add"). System
 * Administrator/Super Admin get it via their built-in role preset, Executive
 * Role via the unconditional isFullRoleAccess bypass; anyone else needs an
 * individual delegated override granted from Manage User (Access Control). */
export async function requireUserManualUploadAccess(
  req: NextRequest,
): Promise<ApiRequestUser | null> {
  const user = await getApiRequestUser(req);
  if (!user) return null;

  const supabaseAdmin = getAdminClient();
  const { presets } = supabaseAdmin
    ? await fetchGroupPresetsFromDb(supabaseAdmin)
    : { presets: {} };

  const profile = callerAccessProfile(user);
  const ok = canPerformModuleAction(
    profile,
    "user-manual",
    "add",
    user.role,
    presets,
  );
  if (!ok) return null;

  // Uploading a new User Manual version is headquarters-only — see
  // isHeadquartersCaller.
  if (!isHeadquartersCaller(user)) return null;

  return user;
}

/** SOP Management (upload/edit/archive/delete/restore SOPs) — mirrors the
 * canManage check in dashboard/sop/page.tsx: Executive Role/HR/Super Admin
 * via isSupervisor()/isFullRoleAccess(), or an individual delegated
 * "sop:add" override. Supervisory Role is deliberately excluded even though
 * isSupervisor() would otherwise include it — Sheila's explicit call that
 * Supervisory shouldn't have SOP Management access at all. Used to actually
 * enforce this server-side, since these routes previously had no role check
 * beyond "is this a logged-in user". */
export async function requireSopManageAccess(
  req: NextRequest,
): Promise<ApiRequestUser | null> {
  const user = await getApiRequestUser(req);
  if (!user) return null;

  let ok = isFullRoleAccess(user.role) || (isSupervisor(user.role) && !isSupervisoryRoleLabel(user.role));
  if (!ok) {
    const supabaseAdmin = getAdminClient();
    const { presets } = supabaseAdmin
      ? await fetchGroupPresetsFromDb(supabaseAdmin)
      : { presets: {} };
    const profile = callerAccessProfile(user);
    ok = canPerformModuleAction(profile, "sop:add", "add", user.role, presets);
  }
  if (!ok) return null;

  // SOP Management (upload/edit/archive/delete/restore) is
  // headquarters-only — see isHeadquartersCaller. Reading SOPs stays
  // available to everyone, only managing them is restricted here.
  if (!isHeadquartersCaller(user)) return null;

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
