import {
  gradeIndex,
  isSuperAdmin,
} from "@/lib/accessControl";

/** Granular page keys — editable only via Access Control */
export const PAGE_PERMISSION_KEYS = [
  "dashboard",
  "users",
  "hc:leave",
  "hc:appraisal",
  "hc:justifications",
  "hc:skillLog",
  "hc:promotion",
  "hc:recruitment",
  "tm:tasks",
  "tm:calendar",
  "policies",
  "sop:view",
  "sop:add",
  "notifications",
  "sys:definitions",
] as const;

export type PagePermissionKey = (typeof PAGE_PERMISSION_KEYS)[number];

import type { PagePermissionActions } from "@/lib/moduleRegistry/types";

export type AccessTier = "standard" | "delegated";

export interface AccessProfile {
  role?: string | null;
  grade_level?: string | null;
  access_tier?: AccessTier | string | null;
  page_permissions?: string[] | null;
  /** view | add | edit per page key — legacy hierarchical levels */
  page_permission_levels?: Partial<
    Record<string, "view" | "add" | "edit">
  > | null;
  /** Independent action checkboxes per page key (source of truth for matrix UI) */
  page_permission_actions?: PagePermissionActions | null;
}

export const PAGE_PERMISSION_LABELS: Record<
  PagePermissionKey,
  { label: string; group: string }
> = {
  dashboard: { label: "Overview", group: "General" },
  users: { label: "User Management", group: "General" },
  notifications: { label: "Notifications", group: "General" },
  "hc:leave": { label: "Leave", group: "Human Capital" },
  "hc:appraisal": { label: "Appraisal", group: "Human Capital" },
  "hc:justifications": { label: "Justifications", group: "Human Capital" },
  "hc:skillLog": { label: "Skill Logs", group: "Human Capital" },
  "hc:promotion": { label: "Promotion", group: "Human Capital" },
  "hc:recruitment": { label: "Recruitment", group: "Human Capital" },
  "tm:tasks": { label: "Tasks", group: "Task Manager" },
  "tm:calendar": { label: "Calendar", group: "Task Manager" },
  policies: { label: "Policies & Ops", group: "Operations" },
  "sop:view": { label: "SOP (view)", group: "Operations" },
  "sop:add": { label: "Add SOP", group: "Operations" },
  "sys:definitions": { label: "System Definitions", group: "General" },
};

/** Full role — admin, manager, super_admin (sidebar admin group) */
export function isFullRoleAccess(role: string | null | undefined): boolean {
  return (
    role === "super_admin" || role === "admin" || role === "manager"
  );
}

/**
 * Unconditional (role-only) bypass for User Management. Super Admin and
 * Manager L5+ always get full manage rights. Admin is deliberately NOT
 * included here — their default is "view" on User Management (see
 * ADMIN_DEFAULT_OVERRIDES in permissionLevels.ts) and can be raised to
 * add/edit per-user via the permission matrix, but never full by default.
 */
export function canManageAccessControl(
  role: string | null | undefined,
  grade: string | null | undefined,
): boolean {
  if (isSuperAdmin(role)) return true;
  if (role === "manager" && gradeIndex(grade) >= 4) return true;
  return false;
}

export const STANDARD_EMPLOYEE_PAGES: PagePermissionKey[] = [
  "dashboard",
  "hc:leave",
  "hc:appraisal",
  "hc:skillLog",
  "tm:tasks",
  "tm:calendar",
  "policies",
  "sop:view",
  "notifications",
];

export function pageKeyFromPath(pathname: string): PagePermissionKey | null {
  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    return "dashboard";
  }
  if (pathname.startsWith("/dashboard/access-control")) return null;
  if (pathname.startsWith("/dashboard/settings")) return null;
  if (pathname.startsWith("/dashboard/users")) return null;
  if (pathname.startsWith("/dashboard/humanCapital/leave")) return "hc:leave";
  if (pathname.startsWith("/dashboard/humanCapital/appraisal/justifications")) {
    return "hc:justifications";
  }
  if (pathname.startsWith("/dashboard/humanCapital/appraisal")) {
    return "hc:appraisal";
  }
  if (pathname.startsWith("/dashboard/humanCapital/skillLog")) {
    return "hc:skillLog";
  }
  if (pathname.startsWith("/dashboard/humanCapital/schedule")) {
    return "tm:calendar";
  }
  if (pathname.startsWith("/dashboard/humanCapital/promotion")) {
    return "hc:promotion";
  }
  if (pathname.startsWith("/dashboard/humanCapital/recruitment")) {
    return "hc:recruitment";
  }
  if (pathname.startsWith("/dashboard/taskManager/calendar")) return "tm:calendar";
  if (pathname.startsWith("/dashboard/taskManager")) return "tm:tasks";
  if (pathname.startsWith("/dashboard/policies")) return "policies";
  if (pathname.startsWith("/dashboard/addSop")) return "sop:add";
  if (pathname.startsWith("/dashboard/sop")) return "sop:view";
  if (pathname.startsWith("/dashboard/notifications")) return "notifications";
  if (pathname.startsWith("/dashboard/system-definitions")) {
    return "sys:definitions";
  }
  return null;
}

export function groupedPagePermissions(): {
  group: string;
  keys: PagePermissionKey[];
}[] {
  const map = new Map<string, PagePermissionKey[]>();
  for (const key of PAGE_PERMISSION_KEYS) {
    const { group } = PAGE_PERMISSION_LABELS[key];
    if (!map.has(group)) map.set(group, []);
    map.get(group)!.push(key);
  }
  return Array.from(map.entries()).map(([group, keys]) => ({ group, keys }));
}

/** DB profile with session JWT fallback (e.g. super_admin only in auth metadata). */
export function resolveAccessProfile(
  dbUser: AccessProfile | null | undefined,
  sessionRole?: string | null,
): AccessProfile | null {
  if (dbUser?.role) {
    return {
      role: dbUser.role,
      grade_level: dbUser.grade_level,
      access_tier: dbUser.access_tier ?? "standard",
      page_permissions: dbUser.page_permissions ?? [],
      page_permission_levels: dbUser.page_permission_levels ?? null,
      page_permission_actions: dbUser.page_permission_actions ?? null,
    };
  }
  if (sessionRole) {
    return {
      role: sessionRole,
      access_tier: "standard",
      page_permissions: [],
      page_permission_levels: null,
    };
  }
  return null;
}

export function hasUnrestrictedAccess(
  profile: AccessProfile | null | undefined,
  sessionRole?: string | null,
): boolean {
  const role = profile?.role ?? sessionRole;
  return isSuperAdmin(role);
}

function sortedKeys(keys: PagePermissionKey[]): string[] {
  return [...keys].sort();
}

export function isStandardEmployeePageSet(perms: PagePermissionKey[]): boolean {
  const a = sortedKeys(perms);
  const b = sortedKeys(STANDARD_EMPLOYEE_PAGES);
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

export function isFullPageSet(perms: PagePermissionKey[]): boolean {
  return PAGE_PERMISSION_KEYS.every((k) => perms.includes(k));
}
