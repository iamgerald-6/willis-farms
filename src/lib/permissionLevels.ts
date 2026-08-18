import { isSuperAdmin } from "@/lib/accessControl";
import {
  actionsToLevels,
  canPerformModuleAction,
  getEffectivePermissionActions,
} from "@/lib/permissionActions";
import type { GroupPresetsMap } from "@/lib/groupPermissionPresets";
import {
  canManageAccessControl,
  isFullRoleAccess,
  PAGE_PERMISSION_KEYS,
  STANDARD_EMPLOYEE_PAGES,
  type AccessProfile,
  type AccessTier,
  type PagePermissionKey,
} from "@/lib/pagePermissions";

export type PermissionLevel = "view" | "add" | "edit";

export type PagePermissionLevels = Partial<
  Record<PagePermissionKey, PermissionLevel>
>;

const LEVEL_RANK: Record<PermissionLevel, number> = {
  view: 1,
  add: 2,
  edit: 3,
};

export type PermissionModuleConfig = {
  supportsAdd: boolean;
  viewHelp: string;
  addHelp?: string;
  editHelp: string;
};

/** Per-module tooltip copy for Manage User permission matrix */
export const PERMISSION_MODULE_CONFIG: Partial<
  Record<PagePermissionKey, PermissionModuleConfig>
> = {
  users: {
    supportsAdd: true,
    viewHelp:
      "See the user list only. Cannot add users or open Manage User.",
    addHelp:
      "Add new users only. Cannot open Manage User, change names, disable accounts, or set permissions.",
    editHelp:
      "Full User Management: add users, manage accounts, change names, disable accounts, and set page permissions.",
  },
  "hc:appraisal": {
    supportsAdd: true,
    viewHelp:
      "Open appraisals and read the current period. Cannot start or change appraisals.",
    addHelp:
      "Start and submit appraisals for the current period. Cannot archive records.",
    editHelp:
      "Full appraisal access including archive / restore. Required for Admins before they can archive — Managers have this by role.",
  },
};

export const GENERIC_PERMISSION_HELP: PermissionModuleConfig = {
  supportsAdd: true,
  viewHelp: "Open this page and read content. Cannot create or change anything.",
  addHelp:
    "Create new items on this page. Cannot edit or delete existing content.",
  editHelp:
    "Full access on this page: create, update, and delete where applicable.",
};

export function getPermissionModuleConfig(
  key: PagePermissionKey,
): PermissionModuleConfig {
  return PERMISSION_MODULE_CONFIG[key] ?? GENERIC_PERMISSION_HELP;
}

/**
 * Admin's default is deliberately lighter than Manager/Super Admin: they see
 * everything an employee sees, plus a read-only view of User Management, and
 * can add (but not archive/delete) Policies & SOP content. Managers and
 * Super Admins keep full "edit" everywhere via isFullRoleAccess below.
 * Explicit page_permission_levels (once an admin is customized/delegated)
 * always take precedence over these defaults.
 */
const ADMIN_DEFAULT_OVERRIDES: Partial<
  Record<PagePermissionKey, PermissionLevel>
> = {
  users: "view",
  policies: "add",
  "sop:view": "view",
  "sop:add": "add",
  // Admins can work the current appraisal flow, but cannot archive unless
  // Manage User explicitly grants Edit on Appraisal.
  "hc:appraisal": "add",
};

export function moduleSupportsAdd(key: PagePermissionKey): boolean {
  return getPermissionModuleConfig(key).supportsAdd;
}

/** Legacy array entries are treated as view-only */
export function resolvePermissionLevels(
  profile: AccessProfile | null | undefined,
): PagePermissionLevels {
  if (!profile) return {};

  const levels: PagePermissionLevels = {};

  const rawLevels = profile.page_permission_levels;
  if (rawLevels && typeof rawLevels === "object" && !Array.isArray(rawLevels)) {
    Object.assign(levels, rawLevels);
  }

  const legacy = profile.page_permissions ?? [];
  for (const key of legacy) {
    const k = key as PagePermissionKey;
    if (!levels[k]) {
      levels[k] = "view";
    }
  }

  return levels;
}

export function getPagePermissionLevel(
  profile: AccessProfile | null | undefined,
  key: PagePermissionKey,
  sessionRole?: string | null,
): PermissionLevel | null {
  const role = profile?.role ?? sessionRole;
  if (isSuperAdmin(role)) return "edit";

  const tier = (profile?.access_tier ?? "standard") as AccessTier;
  const levels = resolvePermissionLevels(profile);

  // Admin gets a lighter default than Manager/Super Admin on a few modules
  // (see ADMIN_DEFAULT_OVERRIDES). Once explicitly customized (delegated +
  // stored level for this key), the stored value wins.
  if (role === "admin" && ADMIN_DEFAULT_OVERRIDES[key]) {
    if (tier === "delegated" && levels[key]) return levels[key]!;
    return ADMIN_DEFAULT_OVERRIDES[key]!;
  }

  if (isFullRoleAccess(role)) return "edit";

  if (tier === "delegated") {
    return levels[key] ?? null;
  }

  // Standard tier, non-full-role (employee): default page set is view-only.
  if (STANDARD_EMPLOYEE_PAGES.includes(key)) return "view";
  return null;
}

export function hasPermissionAtLeast(
  current: PermissionLevel | null | undefined,
  minimum: PermissionLevel,
): boolean {
  if (!current) return false;
  return LEVEL_RANK[current] >= LEVEL_RANK[minimum];
}

export function canViewPageLevel(
  profile: AccessProfile | null | undefined,
  key: PagePermissionKey,
  sessionRole?: string | null,
): boolean {
  return hasPermissionAtLeast(
    getPagePermissionLevel(profile, key, sessionRole),
    "view",
  );
}

export function canAddOnPage(
  profile: AccessProfile | null | undefined,
  key: PagePermissionKey,
  sessionRole?: string | null,
): boolean {
  return hasPermissionAtLeast(
    getPagePermissionLevel(profile, key, sessionRole),
    "add",
  );
}

export function canEditOnPage(
  profile: AccessProfile | null | undefined,
  key: PagePermissionKey,
  sessionRole?: string | null,
): boolean {
  return hasPermissionAtLeast(
    getPagePermissionLevel(profile, key, sessionRole),
    "edit",
  );
}

export function canOpenUserManagement(
  profile: AccessProfile | null | undefined,
  sessionRole?: string | null,
): boolean {
  if (
    canManageAccessControl(
      profile?.role ?? sessionRole,
      profile?.grade_level,
    )
  ) {
    return true;
  }
  return canPerformModuleAction(profile, "users", "view", sessionRole);
}

export function canAddUser(
  profile: AccessProfile | null | undefined,
  sessionRole?: string | null,
): boolean {
  if (
    canManageAccessControl(
      profile?.role ?? sessionRole,
      profile?.grade_level,
    )
  ) {
    return true;
  }
  return canPerformModuleAction(profile, "users", "add", sessionRole);
}

export function canManageUserAccounts(
  profile: AccessProfile | null | undefined,
  sessionRole?: string | null,
): boolean {
  if (
    canManageAccessControl(
      profile?.role ?? sessionRole,
      profile?.grade_level,
    )
  ) {
    return true;
  }
  return canPerformModuleAction(profile, "users", "edit", sessionRole);
}

/** Pre-tick checkbox matrix — reflects effective access for this user today. */
export function getEffectivePermissionActionsForProfile(
  profile: AccessProfile,
  groupPresets?: GroupPresetsMap | null,
): import("@/lib/moduleRegistry/types").PagePermissionActions {
  return getEffectivePermissionActions(profile, profile.role, groupPresets);
}

/** Legacy radio levels derived from effective checkbox actions. */
export function getEffectivePermissionLevels(
  profile: AccessProfile,
): PagePermissionLevels {
  return actionsToLevels(getEffectivePermissionActionsForProfile(profile));
}

export function levelsToLegacyPageKeys(
  levels: PagePermissionLevels,
): PagePermissionKey[] {
  return Object.entries(levels)
    .filter(([, level]) => level != null)
    .map(([key]) => key as PagePermissionKey);
}

export function sanitizePermissionLevels(
  input: unknown,
): PagePermissionLevels {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const out: PagePermissionLevels = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(PAGE_PERMISSION_KEYS as readonly string[]).includes(key)) continue;
    if (value === "view" || value === "add" || value === "edit") {
      out[key as PagePermissionKey] = value;
    }
  }
  return out;
}
