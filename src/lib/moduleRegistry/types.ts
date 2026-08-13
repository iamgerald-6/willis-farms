/**
 * Module registry types — stable contract for Git-defined modules today and
 * DB-backed system_modules later. Same shape in both sources.
 */

export const PERMISSION_ACTIONS = [
  "view",
  "add",
  "edit",
  "approve",
  "review",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type ModuleSource = "builtin" | "dynamic";

export type ModuleGroupId =
  | "grp:general"
  | "grp:human-capital"
  | "grp:task-manager"
  | "grp:operations"
  | "grp:system";

export type NavIconKey =
  | "layout-dashboard"
  | "bell"
  | "user-check"
  | "calendar-check"
  | "star"
  | "shield-alert"
  | "shield-check"
  | "shield-x"
  | "clipboard-list"
  | "trending-up"
  | "user-plus"
  | "list-checks"
  | "calendar"
  | "gantt-chart-square"
  | "leafy-green"
  | "file-stack"
  | "book-open"
  | "tag"
  | "check-circle"
  | "clock"
  | "alert-circle"
  | "x-circle";

/** How a group renders in the sidebar */
export type SidebarGroupMode = "collapsible" | "flat";

export interface ModuleGroupSidebar {
  mode: SidebarGroupMode;
  icon?: NavIconKey;
  /** Parent href when mode is collapsible */
  href?: string;
}

export interface ModuleGroup {
  id: ModuleGroupId;
  label: string;
  sortOrder: number;
  sidebar?: ModuleGroupSidebar;
}

export interface ModuleSidebar {
  icon: NavIconKey;
  showInSidebar?: boolean;
}

export interface TaxonomyOption {
  id: string;
  label: string;
  /** Value stored in legacy DB columns until migration to option ids */
  legacyValue?: string;
  sortOrder?: number;
}

export type FormFieldType =
  | "text"
  | "textarea"
  | "email"
  | "number"
  | "date"
  | "select"
  | "hidden"
  | "readOnly";

export type FieldSource =
  | { kind: "manual" }
  | { kind: "session"; path: string }
  | { kind: "definition"; key: string };

export interface FormFieldDef {
  id: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  requiredWhen?: string;
  optionsRef?: string;
  source?: FieldSource;
  min?: string;
  helpText?: string;
}

export interface FormDefinition {
  fields: FormFieldDef[];
  autoFill?: Record<string, FieldSource>;
}

export type ListCellType =
  | "text"
  | "date"
  | "statusBadge"
  | "number"
  | "rowActions";

export interface ListColumnDef {
  id: string;
  field: string;
  label: string;
  cell?: ListCellType;
  sortable?: boolean;
  align?: "left" | "right" | "center";
}

export interface ListFilterDef {
  id: string;
  type: "search" | "pill";
  field?: string;
  fields?: string[];
  optionsRef?: string;
}

export interface ListEmptyState {
  title: string;
  description: string;
}

export interface ListViewConfig {
  type: "table" | "grid";
  mobileFallback?: "cards";
  columns?: ListColumnDef[];
  filters?: ListFilterDef[];
  emptyState: ListEmptyState;
}

export interface ModuleFeatureDef {
  id: string;
  label: string;
  requires: Partial<Record<PermissionAction, boolean>>;
}

export interface ModuleShellConfig {
  layout: "module-standard-v1";
  primaryAction?: {
    label: string;
    featureId: string;
    requires: Partial<Record<PermissionAction, boolean>>;
  };
}

/** Overview dashboard — quick links to other modules */
export type OverviewAudience = "admin" | "employee" | "all";

export interface OverviewQuickActionRef {
  moduleId: string;
  /** Label override on overview (defaults to module.label) */
  label?: string;
  audience: OverviewAudience;
  sortOrder: number;
}

export interface OverviewExtraLink {
  id: string;
  label: string;
  route: string;
  icon: NavIconKey;
  audience: OverviewAudience;
  sortOrder: number;
}

export interface OverviewConfig {
  /** Page heading in hero (supports {firstName} at runtime) */
  greetingTemplate: string;
  quickActions: OverviewQuickActionRef[];
  /** Routes not yet full modules (e.g. LMS until built) */
  extraLinks?: OverviewExtraLink[];
}

export interface ModuleRecord {
  id: string;
  source: ModuleSource;
  /** Maps to PAGE_PERMISSION_KEYS during migration */
  legacyKey?: string;
  label: string;
  groupId: ModuleGroupId;
  route: string;
  enabled: boolean;
  sortOrder: number;
  sidebar: ModuleSidebar;
  /** Primary Supabase table for builtin modules with dedicated schemas */
  table?: string;
  supportedActions: PermissionAction[];
  shell?: ModuleShellConfig;
  listView?: ListViewConfig;
  formDefinition?: FormDefinition;
  features?: ModuleFeatureDef[];
  taxonomyRefs?: string[];
  /** Present on mod:overview — dashboard quick actions & copy */
  overview?: OverviewConfig;
}

export type ModuleActions = Partial<Record<PermissionAction, boolean>>;

export type PagePermissionActions = Partial<Record<string, ModuleActions>>;
