import type { SupabaseClient } from "@supabase/supabase-js";
import type { PagePermissionActions } from "@/lib/moduleRegistry/types";
import {
  defaultFullAccessActions,
  defaultFullAccessActionsFor,
  defaultStandardEmployeeActions,
  roleGroup,
  sanitizePermissionActions,
  type UserListGroup,
} from "@/lib/permissionActions";
import {
  USER_ROLE_GROUP_KEYS,
  userRoleGroupKeyLabel,
  type UserRoleGroupKey,
} from "@/lib/userRoleAccessControl";
import type { AccessProfile } from "@/lib/pagePermissions";
import {
  UNIVERSAL_STAFF_PAGES,
  type PagePermissionKey,
} from "@/lib/pagePermissions";

/** One shared permission preset per role in the new 7-role system. Replaces
 * the old role-literal + grade-band groups ("employees"/"managers"/
 * "admins"/"grade_l1_l3"/"grade_l4_l7") now that access control is driven
 * entirely by the new role system — see userRoleAccessControl.ts. */
export type GroupPresetKey = UserRoleGroupKey;

export const GROUP_PRESET_KEYS: GroupPresetKey[] = USER_ROLE_GROUP_KEYS;

export const GROUP_PRESET_LABELS: Record<GroupPresetKey, string> = {
  standard_role: userRoleGroupKeyLabel("standard_role"),
  executive_role: userRoleGroupKeyLabel("executive_role"),
  human_resource: userRoleGroupKeyLabel("human_resource"),
  supervisory_role: userRoleGroupKeyLabel("supervisory_role"),
  system_administrator: userRoleGroupKeyLabel("system_administrator"),
  consultant: userRoleGroupKeyLabel("consultant"),
  super_admin: userRoleGroupKeyLabel("super_admin"),
};

/** No grade-band variant anymore, so this is just the fixed labels — kept
 * as a function (rather than exporting the constant directly) so call
 * sites that used to pass a grade config don't all need reshaping at once. */
export function getGroupPresetLabels(): Record<GroupPresetKey, string> {
  return GROUP_PRESET_LABELS;
}

export type GroupPresetsMap = Partial<Record<GroupPresetKey, PagePermissionActions>>;

export type GroupPresetRow = {
  group_key: GroupPresetKey;
  page_permission_actions: PagePermissionActions;
  updated_at: string | null;
  updated_by: string | null;
};

export function isGroupPresetKey(key: string): key is GroupPresetKey {
  return (GROUP_PRESET_KEYS as readonly string[]).includes(key);
}

/** Every role preset includes dashboard + notifications so route guards
 * never redirect to a page the user cannot open. */
export function withUniversalStaffPageAccess(
  actions: PagePermissionActions,
): PagePermissionActions {
  const out = { ...actions };
  for (const key of UNIVERSAL_STAFF_PAGES) {
    out[key] = { ...(out[key] ?? {}), view: true };
  }
  return out;
}

export const HUMAN_RESOURCE_EXCLUDED_PAGE_KEYS: PagePermissionKey[] = [
  "sys:definitions",
];

/** Standard Role and Consultant — identical access. */
export function standardRolePermissionActions(): PagePermissionActions {
  return {
    dashboard: { view: true },
    notifications: { view: true },
    "hc:leave": { view: true, add: true },
    "hc:appraisal": { view: true, add: true },
    "hc:skillLog": { view: true },
    "tm:tasks": { view: true, add: true },
    "tm:calendar": { view: true },
    policies: { view: true },
    "sop:view": { view: true },
  };
}

/** Supervisory Role — supervisor-scoped HC; record scope enforced in module
 * access helpers and APIs (leaveAccess, appraisalAccess, skillLogAccess). */
export function supervisoryRolePermissionActions(): PagePermissionActions {
  return {
    ...standardRolePermissionActions(),
    "hc:leave": { view: true, add: true, approve: true },
    "hc:appraisal": { view: true, add: true, edit: true },
    "hc:skillLog": { view: true, add: true, edit: true },
  };
}

/** Human Resource — all modules except System Definitions; no skill-log sign-off. */
export function humanResourceRolePermissionActions(): PagePermissionActions {
  const excluded = new Set<string>(HUMAN_RESOURCE_EXCLUDED_PAGE_KEYS);
  const out: PagePermissionActions = {};
  for (const [key, mod] of Object.entries(defaultFullAccessActions())) {
    if (excluded.has(key)) continue;
    out[key as PagePermissionKey] = { ...mod };
  }
  out["hc:skillLog"] = {
    view: true,
    add: true,
    edit: true,
    review: true,
  };
  return out;
}

export function systemAdministratorRolePermissionActions(): PagePermissionActions {
  return defaultFullAccessActionsFor(["sys:definitions", "users"]);
}

/** Canonical built-in matrix for each User role (standard-tier accounts). */
export function getBuiltInRolePermissionActions(
  roleKey: GroupPresetKey,
): PagePermissionActions {
  let actions: PagePermissionActions;
  switch (roleKey) {
    case "standard_role":
    case "consultant":
      actions = standardRolePermissionActions();
      break;
    case "supervisory_role":
      actions = supervisoryRolePermissionActions();
      break;
    case "human_resource":
      actions = humanResourceRolePermissionActions();
      break;
    case "system_administrator":
      actions = systemAdministratorRolePermissionActions();
      break;
    case "executive_role":
    case "super_admin":
      actions = defaultFullAccessActions();
      break;
    default:
      actions = standardRolePermissionActions();
  }
  return withUniversalStaffPageAccess(actions);
}

/** Built-in defaults when no DB row exists yet for a role. */
export function getDefaultGroupPreset(key: GroupPresetKey): PagePermissionActions {
  return getBuiltInRolePermissionActions(key);
}

export function mergePermissionActions(
  base: PagePermissionActions,
  overlay: PagePermissionActions,
): PagePermissionActions {
  const out: PagePermissionActions = { ...base };
  for (const [key, mod] of Object.entries(overlay)) {
    if (!mod || typeof mod !== "object") continue;
    out[key] = { ...(out[key] ?? {}), ...mod };
  }
  return out;
}

/** This role's saved preset, if any. */
export function resolveGroupPresetActions(
  profile: AccessProfile,
  presets: GroupPresetsMap,
): PagePermissionActions {
  const rg = roleGroup(profile.role);
  if (rg && presets[rg]) {
    return presets[rg]!;
  }
  return {};
}

export function hasIndividualPermissionOverride(
  profile: AccessProfile | null | undefined,
): boolean {
  if (!profile) return false;
  const tier = profile.access_tier ?? "standard";
  if (tier !== "delegated") return false;
  const stored = sanitizePermissionActions(profile.page_permission_actions);
  return Object.keys(stored).length > 0;
}

export function normalizeGroupPresetsMap(
  rows: GroupPresetRow[] | null | undefined,
): GroupPresetsMap {
  const out: GroupPresetsMap = {};
  for (const key of GROUP_PRESET_KEYS) {
    const row = rows?.find((r) => r.group_key === key);
    const actions = row
      ? sanitizePermissionActions(row.page_permission_actions)
      : getDefaultGroupPreset(key);
    if (Object.keys(actions).length > 0) {
      out[key] = withUniversalStaffPageAccess(actions);
    }
  }
  return out;
}

/** Fetch all group presets from Supabase; fills missing keys with code defaults. */
export async function fetchGroupPresetsFromDb(
  supabase: SupabaseClient,
): Promise<{ presets: GroupPresetsMap; rows: GroupPresetRow[] }> {
  const { data, error } = await supabase
    .from("access_group_presets")
    .select("group_key, page_permission_actions, updated_at, updated_by");

  if (error) {
    console.warn("[fetchGroupPresetsFromDb]", error.message);
    const presets: GroupPresetsMap = {};
    for (const key of GROUP_PRESET_KEYS) {
      const actions = getDefaultGroupPreset(key);
      if (Object.keys(actions).length > 0) presets[key] = actions;
    }
    return { presets, rows: [] };
  }

  const rows: GroupPresetRow[] = (data ?? [])
    .filter((row) => isGroupPresetKey(row.group_key as string))
    .map((row) => ({
      group_key: row.group_key as GroupPresetKey,
      page_permission_actions: sanitizePermissionActions(row.page_permission_actions),
      updated_at: row.updated_at ?? null,
      updated_by: row.updated_by ?? null,
    }));

  return { presets: normalizeGroupPresetsMap(rows), rows };
}

export function groupPresetKeyFromListGroup(
  listGroup: UserListGroup,
): GroupPresetKey | null {
  if (listGroup === "all") return null;
  return listGroup;
}
