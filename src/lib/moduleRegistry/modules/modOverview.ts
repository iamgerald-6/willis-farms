import type { ModuleRecord } from "../types";

export const modOverview: ModuleRecord = {
  id: "mod:overview",
  source: "builtin",
  legacyKey: "dashboard",
  label: "Overview",
  groupId: "grp:general",
  route: "/dashboard",
  enabled: true,
  sortOrder: 1,
  sidebar: {
    icon: "layout-dashboard",
    showInSidebar: true,
  },
  supportedActions: ["view"],

  shell: {
    layout: "module-standard-v1",
  },

  overview: {
    greetingTemplate: "{greeting}, {firstName}",
    quickActions: [
      {
        moduleId: "mod:users",
        label: "User Management",
        audience: "admin",
        sortOrder: 10,
      },
      {
        moduleId: "mod:leave",
        label: "Leave",
        audience: "admin",
        sortOrder: 20,
      },
      {
        moduleId: "mod:leave",
        label: "My Leave",
        audience: "employee",
        sortOrder: 10,
      },
      {
        moduleId: "mod:appraisal",
        label: "Appraisals",
        audience: "admin",
        sortOrder: 30,
      },
      {
        moduleId: "mod:appraisal",
        label: "Appraisals",
        audience: "employee",
        sortOrder: 20,
      },
      {
        moduleId: "mod:skill-log",
        label: "Skill Logs",
        audience: "admin",
        sortOrder: 40,
      },
      {
        moduleId: "mod:skill-log",
        label: "Skill Log",
        audience: "employee",
        sortOrder: 30,
      },
      {
        moduleId: "mod:sop",
        label: "SOPs",
        audience: "all",
        sortOrder: 50,
      },
      {
        moduleId: "mod:tm-calendar",
        label: "Calendar",
        audience: "employee",
        sortOrder: 60,
      },
    ],
    extraLinks: [
      {
        id: "link:lms",
        label: "Learning Hub",
        route: "/dashboard/lms",
        icon: "book-open",
        audience: "all",
        sortOrder: 70,
      },
    ],
  },
};
