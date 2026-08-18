import { gradeIndex, isSuperAdmin } from "@/lib/accessControl";
import { getModuleRegistrySync } from "@/lib/moduleRegistry";
import type {
  ModuleActions,
  PagePermissionActions,
  PermissionAction,
} from "@/lib/moduleRegistry/types";
import { PERMISSION_ACTIONS } from "@/lib/moduleRegistry/types";
import {
  type PermissionLevel,
} from "@/lib/permissionLevels";
import {
  resolveGroupPresetActions,
  type GroupPresetsMap,
} from "@/lib/groupPermissionPresets";
import {
  isFullRoleAccess,
  PAGE_PERMISSION_KEYS,
  PAGE_PERMISSION_LABELS,
  STANDARD_EMPLOYEE_PAGES,
  type AccessProfile,
  type AccessTier,
  type PagePermissionKey,
} from "@/lib/pagePermissions";

export type { ModuleActions, PagePermissionActions, PermissionAction };

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "View",
  add: "Add",
  edit: "Edit",
  approve: "Approve",
  review: "Review",
};

/** Per-module action help shown in the permission matrix header tooltips. */
export const ACTION_HELP: Partial<
  Record<PagePermissionKey, Partial<Record<PermissionAction, string>>>
> = {
  dashboard: {
    view: "Open the Overview dashboard.",
  },
  users: {
    view: "See the user list only — cannot add users or open Manage User.",
    add: "Invite new users — cannot disable accounts or change permissions.",
    edit: "Full User Management: manage accounts, disable users, set permissions.",
  },
  "hc:leave": {
    view: "See own leave history.",
    add: "Apply for leave.",
    review: "See all staff leave requests and add review notes — cannot approve.",
    approve: "Approve or reject leave requests.",
  },
  "hc:appraisal": {
    view: "Open appraisals and read the current period.",
    add: "Start and submit self-assessments.",
    edit: "Supervisor evaluation and archive/restore.",
    review: "Run the final review meeting.",
  },
  "hc:justifications": {
    view: "See the justifications inbox.",
    add: "Submit a supervisor justification.",
    approve: "Approve or reject a justification appeal.",
  },
  "hc:skillLog": {
    view: "View skill logs you are involved in (as employee or filler).",
    add: "Fill and submit a skill log for an employee.",
    edit: "Edit or delete your own draft logs.",
    review: "View submitted skill logs from other supervisors.",
    approve: "Sign off (approve) a submitted skill log — cannot approve your own.",
  },
  "hc:promotion": {
    view: "View promotion history.",
    add: "Submit a promotion assessment.",
    review: "Record a promotion decision.",
  },
  policies: {
    view: "Browse policies and ops documents.",
    add: "Upload new policy documents.",
    edit: "Delete or manage policy records.",
  },
  "sop:view": {
    view: "Browse SOP content.",
  },
  "sop:add": {
    view: "Open the SOP hub.",
    add: "Upload and manage SOP content.",
    edit: "Delete or archive SOP records.",
  },
  "sys:definitions": {
    view: "Open System Definitions and browse module registry.",
    add: "Add dropdown options and new business-logic rules.",
    edit: "Edit or remove existing options, save leave policy, weights, and rating sections.",
  },
};

export type MatrixModuleRow = {
  key: PagePermissionKey;
  moduleId: string;
  label: string;
  group: string;
  groupId: string;
  supportedActions: PermissionAction[];
};

/** Leave uses review + approve (registry updated in modLeave). */
const LEAVE_ACTIONS: PermissionAction[] = ["view", "add", "review", "approve"];

function registryRow(key: PagePermissionKey): MatrixModuleRow | null {
  const meta = PAGE_PERMISSION_LABELS[key];
  const modules = getModuleRegistrySync();

  if (key === "sop:add") {
    const mod = modules.find((m) => m.legacyKey === "sop:add");
    return {
      key,
      moduleId: mod?.id ?? "mod:sop-manage",
      label: meta.label,
      group: meta.group,
      groupId: mod?.groupId ?? "grp:operations",
      supportedActions: mod?.supportedActions ?? ["view", "add", "edit"],
    };
  }

  const mod = modules.find((m) => m.legacyKey === key);
  if (!mod) return null;

  let supportedActions = [...mod.supportedActions];
  if (key === "hc:leave") {
    supportedActions = LEAVE_ACTIONS;
  }

  return {
    key,
    moduleId: mod.id,
    label: meta.label,
    group: meta.group,
    groupId: mod.groupId,
    supportedActions,
  };
}

export function getPermissionMatrixModules(): MatrixModuleRow[] {
  return PAGE_PERMISSION_KEYS.map((key) => registryRow(key)).filter(
    (row): row is MatrixModuleRow => row != null,
  );
}

export function getPermissionMatrixByGroup(): {
  group: string;
  groupId: string;
  modules: MatrixModuleRow[];
}[] {
  const map = new Map<
    string,
    { group: string; groupId: string; modules: MatrixModuleRow[] }
  >();
  for (const row of getPermissionMatrixModules()) {
    if (!map.has(row.groupId)) {
      map.set(row.groupId, {
        group: row.group,
        groupId: row.groupId,
        modules: [],
      });
    }
    map.get(row.groupId)!.modules.push(row);
  }
  return Array.from(map.values());
}

export function emptyPermissionActions(): PagePermissionActions {
  return {};
}

export function sanitizePermissionActions(raw: unknown): PagePermissionActions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PagePermissionActions = {};
  const validActions = new Set(PERMISSION_ACTIONS);

  for (const [key, val] of Object.entries(raw)) {
    if (!(PAGE_PERMISSION_KEYS as readonly string[]).includes(key)) continue;
    if (!val || typeof val !== "object") continue;
    const actions: ModuleActions = {};
    for (const [action, enabled] of Object.entries(val)) {
      if (!validActions.has(action as PermissionAction)) continue;
      if (enabled === true) actions[action as PermissionAction] = true;
    }
    if (Object.keys(actions).length > 0) {
      out[key] = actions;
    }
  }
  return out;
}

/** Map legacy hierarchical levels → independent action checkboxes. */
export function levelsToActions(
  levels: Partial<Record<PagePermissionKey, PermissionLevel>>,
): PagePermissionActions {
  const out: PagePermissionActions = {};
  for (const key of PAGE_PERMISSION_KEYS) {
    const level = levels[key];
    if (!level) continue;
    const row = registryRow(key);
    if (!row) continue;
    const actions: ModuleActions = {};
    if (level === "view" || level === "add" || level === "edit") {
      actions.view = true;
    }
    if (level === "add" || level === "edit") {
      if (row.supportedActions.includes("add")) actions.add = true;
      if (row.supportedActions.includes("review")) actions.review = true;
      if (row.supportedActions.includes("approve")) actions.approve = true;
    }
    if (level === "edit") {
      if (row.supportedActions.includes("edit")) actions.edit = true;
      if (row.supportedActions.includes("approve") && !actions.approve) {
        actions.approve = true;
      }
      if (row.supportedActions.includes("review") && !actions.review) {
        actions.review = true;
      }
    }
    if (Object.keys(actions).length > 0) out[key] = actions;
  }
  return out;
}

/** Derive legacy levels from checkbox actions (backward compat for existing gates). */
export function actionsToLevels(
  actions: PagePermissionActions,
): Partial<Record<PagePermissionKey, PermissionLevel>> {
  const out: Partial<Record<PagePermissionKey, PermissionLevel>> = {};
  for (const key of PAGE_PERMISSION_KEYS) {
    const mod = actions[key];
    if (!mod) continue;
    if (mod.edit) {
      out[key] = "edit";
      continue;
    }
    if (mod.add || mod.approve || mod.review) {
      out[key] = "add";
      continue;
    }
    if (mod.view) {
      out[key] = "view";
    }
  }
  return out;
}

export function actionsToLegacyPageKeys(
  actions: PagePermissionActions,
): PagePermissionKey[] {
  return PAGE_PERMISSION_KEYS.filter((key) => {
    const mod = actions[key];
    return mod && Object.values(mod).some(Boolean);
  });
}

export function defaultStandardEmployeeActions(): PagePermissionActions {
  const out: PagePermissionActions = {};
  for (const key of STANDARD_EMPLOYEE_PAGES) {
    const row = registryRow(key);
    if (!row) continue;
    const actions: ModuleActions = { view: true };
    if (key === "hc:leave") {
      actions.add = true;
    }
    out[key] = actions;
  }
  return out;
}

export function defaultAdminActions(): PagePermissionActions {
  const employee = defaultStandardEmployeeActions();
  const out: PagePermissionActions = { ...employee };
  out.users = { view: true };
  out.policies = { ...(out.policies ?? { view: true }), view: true, add: true };
  out["sop:view"] = { view: true };
  out["sop:add"] = { view: true, add: true };
  out["hc:appraisal"] = {
    ...(out["hc:appraisal"] ?? { view: true }),
    view: true,
    add: true,
  };
  return out;
}

export function defaultFullAccessActions(): PagePermissionActions {
  const out: PagePermissionActions = {};
  for (const row of getPermissionMatrixModules()) {
    const actions: ModuleActions = {};
    for (const action of row.supportedActions) {
      actions[action] = true;
    }
    out[row.key] = actions;
  }
  return out;
}

function mergeStoredActions(
  profile: AccessProfile,
): PagePermissionActions {
  const fromActions = sanitizePermissionActions(profile.page_permission_actions);
  if (Object.keys(fromActions).length > 0) return fromActions;

  const levels = profile.page_permission_levels;
  if (levels && typeof levels === "object" && !Array.isArray(levels)) {
    return levelsToActions(levels as Partial<Record<PagePermissionKey, PermissionLevel>>);
  }

  const legacy = profile.page_permissions ?? [];
  if (legacy.length > 0) {
    const levelMap: Partial<Record<PagePermissionKey, PermissionLevel>> = {};
    for (const k of legacy) {
      if ((PAGE_PERMISSION_KEYS as readonly string[]).includes(k)) {
        levelMap[k as PagePermissionKey] = "view";
      }
    }
    return levelsToActions(levelMap);
  }

  return {};
}

export function getEffectivePermissionActions(
  profile: AccessProfile | null | undefined,
  sessionRole?: string | null,
  groupPresets?: GroupPresetsMap | null,
): PagePermissionActions {
  if (!profile) return {};

  const role = profile.role ?? sessionRole;
  if (isSuperAdmin(role)) return defaultFullAccessActions();

  const tier = (profile.access_tier ?? "standard") as AccessTier;
  const stored = mergeStoredActions(profile);

  // Individual override — set via Manage User (access_tier = delegated)
  if (tier === "delegated" && Object.keys(stored).length > 0) {
    return stored;
  }

  // Group presets — role group + grade band merged
  if (groupPresets && Object.keys(groupPresets).length > 0) {
    const fromGroups = resolveGroupPresetActions(profile, groupPresets);
    if (Object.keys(fromGroups).length > 0) return fromGroups;
  }

  // Legacy fallbacks when group presets are not loaded
  if (role === "admin") {
    if (Object.keys(stored).length > 0) return stored;
    return defaultAdminActions();
  }

  if (isFullRoleAccess(role)) {
    return defaultFullAccessActions();
  }

  if (tier === "delegated") {
    if (Object.keys(stored).length > 0) return stored;
    return {};
  }

  return defaultStandardEmployeeActions();
}

export function hasModuleAction(
  actions: PagePermissionActions,
  key: PagePermissionKey,
  action: PermissionAction,
): boolean {
  return actions[key]?.[action] === true;
}

export function canPerformModuleAction(
  profile: AccessProfile | null | undefined,
  key: PagePermissionKey,
  action: PermissionAction,
  sessionRole?: string | null,
  groupPresets?: GroupPresetsMap | null,
): boolean {
  const effective = getEffectivePermissionActions(
    profile,
    sessionRole,
    groupPresets,
  );
  return hasModuleAction(effective, key, action);
}

/** Whether the user can open a module page (view action). */
export function canAccessPage(
  profile: AccessProfile,
  pageKey: PagePermissionKey,
  groupPresets?: GroupPresetsMap | null,
  sessionRole?: string | null,
): boolean {
  const role = profile.role ?? sessionRole;
  if (isSuperAdmin(role)) return true;
  return canPerformModuleAction(
    profile,
    pageKey,
    "view",
    sessionRole,
    groupPresets,
  );
}

/** Pages the user can access today (for Access Control pre-tick UI). */
export function getEffectivePagePermissions(
  profile: AccessProfile,
  groupPresets?: GroupPresetsMap | null,
  sessionRole?: string | null,
): PagePermissionKey[] {
  return PAGE_PERMISSION_KEYS.filter((key) =>
    canAccessPage(profile, key, groupPresets, sessionRole),
  );
}

/** Count modules with at least one action enabled. */
export function permissionActionModuleCount(
  actions: PagePermissionActions,
): number {
  return actionsToLegacyPageKeys(actions).length;
}

export function isStandardEmployeeActionSet(
  actions: PagePermissionActions,
): boolean {
  const expected = defaultStandardEmployeeActions();
  for (const key of PAGE_PERMISSION_KEYS) {
    const a = actions[key];
    const e = expected[key];
    if (!e && !a) continue;
    if (!e || !a) return false;
    for (const action of PERMISSION_ACTIONS) {
      if (!!e[action] !== !!a[action]) return false;
    }
  }
  return true;
}

export function isFullAccessActionSet(actions: PagePermissionActions): boolean {
  const expected = defaultFullAccessActions();
  for (const row of getPermissionMatrixModules()) {
    for (const action of row.supportedActions) {
      if (actions[row.key]?.[action] !== true) return false;
    }
  }
  return Object.keys(expected).length > 0;
}

export function permissionActionSetsEqual(
  a: PagePermissionActions,
  b: PagePermissionActions,
): boolean {
  for (const key of PAGE_PERMISSION_KEYS) {
    const modA = a[key];
    const modB = b[key];
    if (!modA && !modB) continue;
    if (!modA || !modB) return false;
    for (const action of PERMISSION_ACTIONS) {
      if (!!modA[action] !== !!modB[action]) return false;
    }
  }
  return true;
}

/** User list grouping helpers */
export type UserListGroup =
  | "all"
  | "employees"
  | "managers"
  | "admins"
  | "grade_l1_l3"
  | "grade_l4_l7";

export function gradeBandGroup(
  grade: string | null | undefined,
): "grade_l1_l3" | "grade_l4_l7" | null {
  const idx = gradeIndex(grade);
  if (idx < 0) return null;
  return idx >= 3 ? "grade_l4_l7" : "grade_l1_l3";
}

export function roleGroup(
  role: string | null | undefined,
): "employees" | "managers" | "admins" | null {
  if (role === "employee") return "employees";
  if (role === "manager") return "managers";
  if (role === "admin") return "admins";
  return null;
}

export function actionHelpFor(
  key: PagePermissionKey,
  action: PermissionAction,
): string {
  return (
    ACTION_HELP[key]?.[action] ??
    `${ACTION_LABELS[action]} on ${PAGE_PERMISSION_LABELS[key].label}.`
  );
}
