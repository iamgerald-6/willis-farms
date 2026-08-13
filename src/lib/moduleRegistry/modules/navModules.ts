import type { ModuleRecord, PermissionAction } from "../types";
import { modAppraisal, modJustifications } from "./modAppraisal";
import { modLeave } from "./modLeave";
import { modOverview } from "./modOverview";
import { modPolicies } from "./modPolicies";
import { modPromotion } from "./modPromotion";
import { modSkillLog } from "./modSkillLog";
import { modSop, modSopManage } from "./modSop";

type NavModuleInput = {
  id: string;
  legacyKey: string;
  label: string;
  groupId: ModuleRecord["groupId"];
  route: string;
  sortOrder: number;
  icon: ModuleRecord["sidebar"]["icon"];
  supportedActions?: PermissionAction[];
  showInSidebar?: boolean;
};

/** Lightweight builtin nav entry — full form/list defs added when module is migrated */
function navModule(input: NavModuleInput): ModuleRecord {
  return {
    id: input.id,
    source: "builtin",
    legacyKey: input.legacyKey,
    label: input.label,
    groupId: input.groupId,
    route: input.route,
    enabled: true,
    sortOrder: input.sortOrder,
    sidebar: {
      icon: input.icon,
      showInSidebar: input.showInSidebar ?? true,
    },
    supportedActions: input.supportedActions ?? ["view"],
  };
}

/** All builtin modules — fully defined modules + nav stubs */
export const NAV_BUILTIN_MODULES: ModuleRecord[] = [
  modOverview,
  navModule({
    id: "mod:users",
    legacyKey: "users",
    label: "User Management",
    groupId: "grp:general",
    route: "/dashboard/access-control",
    sortOrder: 2,
    icon: "user-check",
    showInSidebar: false,
    supportedActions: ["view", "add", "edit"],
  }),
  modLeave,
  modAppraisal,
  modJustifications,
  modSkillLog,
  modPromotion,
  navModule({
    id: "mod:recruitment",
    legacyKey: "hc:recruitment",
    label: "Recruitment",
    groupId: "grp:human-capital",
    route: "/dashboard/humanCapital/recruitment",
    sortOrder: 60,
    icon: "user-plus",
    supportedActions: ["view", "edit", "approve", "review"],
  }),
  navModule({
    id: "mod:tm-calendar",
    legacyKey: "tm:calendar",
    label: "Calendar",
    groupId: "grp:task-manager",
    route: "/dashboard/taskManager/calendar",
    sortOrder: 10,
    icon: "calendar",
    supportedActions: ["view", "edit"],
  }),
  navModule({
    id: "mod:tm-tasks",
    legacyKey: "tm:tasks",
    label: "Tasks",
    groupId: "grp:task-manager",
    route: "/dashboard/taskManager/tasks",
    sortOrder: 20,
    icon: "list-checks",
    supportedActions: ["view", "add", "edit"],
  }),
  modPolicies,
  modSop,
  modSopManage,
  navModule({
    id: "mod:notifications",
    legacyKey: "notifications",
    label: "Notifications",
    groupId: "grp:general",
    route: "/dashboard/notifications",
    sortOrder: 90,
    icon: "bell",
  }),
];
