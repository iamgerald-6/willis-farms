import {
  gradeIndex,
  hasFullAppraisalAccess,
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
  "hc:schedule",
  "hc:promotion",
  "hc:recruitment",
  "tm:tasks",
  "tm:calendar",
  "policies",
  "sop:view",
  "sop:add",
  "notifications",
] as const;

export type PagePermissionKey = (typeof PAGE_PERMISSION_KEYS)[number];

export type AccessTier = "standard" | "delegated";

export interface AccessProfile {
  role?: string | null;
  grade_level?: string | null;
  access_tier?: AccessTier | string | null;
  page_permissions?: string[] | null;
}

export const PAGE_PERMISSION_LABELS: Record<
  PagePermissionKey,
  { label: string; group: string }
> = {
  dashboard: { label: "Overview", group: "General" },
  users: { label: "Users", group: "General" },
  notifications: { label: "Notifications", group: "General" },
  "hc:leave": { label: "Leave", group: "Human Capital" },
  "hc:appraisal": { label: "Appraisal", group: "Human Capital" },
  "hc:justifications": { label: "Justifications", group: "Human Capital" },
  "hc:skillLog": { label: "Skill Logs", group: "Human Capital" },
  "hc:schedule": { label: "Schedule Planner", group: "Human Capital" },
  "hc:promotion": { label: "Promotion", group: "Human Capital" },
  "hc:recruitment": { label: "Recruitment", group: "Human Capital" },
  "tm:tasks": { label: "Tasks", group: "Task Manager" },
  "tm:calendar": { label: "Calendar", group: "Task Manager" },
  policies: { label: "Policies & Ops", group: "Operations" },
  "sop:view": { label: "SOP (view)", group: "Operations" },
  "sop:add": { label: "Add SOP", group: "Operations" },
};

/** Full role — admin, manager, super_admin (sidebar admin group) */
export function isFullRoleAccess(role: string | null | undefined): boolean {
  return (
    role === "super_admin" || role === "admin" || role === "manager"
  );
}

/** Who may open the Access Control page */
export function canManageAccessControl(
  role: string | null | undefined,
  grade: string | null | undefined,
): boolean {
  if (isSuperAdmin(role) || role === "admin") return true;
  if (role === "manager" && gradeIndex(grade) >= 4) return true;
  return false;
}

const STANDARD_EMPLOYEE_PAGES: PagePermissionKey[] = [
  "dashboard",
  "hc:leave",
  "hc:appraisal",
  "hc:skillLog",
  "hc:schedule",
  "tm:tasks",
  "tm:calendar",
  "policies",
  "sop:view",
  "notifications",
];

export function canAccessPage(
  profile: AccessProfile,
  pageKey: PagePermissionKey,
): boolean {
  const role = profile.role;
  const grade = profile.grade_level;
  const tier = (profile.access_tier ?? "standard") as AccessTier;
  const perms = profile.page_permissions ?? [];

  // Super admin always has every page
  if (isSuperAdmin(role)) return true;

  if (pageKey === "hc:justifications") {
    if (hasFullAppraisalAccess(role, grade)) return true;
    if (tier === "delegated") return perms.includes(pageKey);
    return false;
  }

  if (isFullRoleAccess(role)) return true;

  if (tier === "delegated") {
    return perms.includes(pageKey);
  }

  return STANDARD_EMPLOYEE_PAGES.includes(pageKey);
}

export function pageKeyFromPath(pathname: string): PagePermissionKey | null {
  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    return "dashboard";
  }
  if (pathname.startsWith("/dashboard/access-control")) return null;
  if (pathname.startsWith("/dashboard/users")) return "users";
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
    return "hc:schedule";
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
    };
  }
  if (sessionRole) {
    return {
      role: sessionRole,
      access_tier: "standard",
      page_permissions: [],
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
