import type { FormDefinition, ModuleRecord } from "../types";
import {
  SKILL_LOG_FORM_COPY,
  SKILL_LOG_PAGE_COPY,
} from "../taxonomy/skillLog";

export const skillLogFormDefinition: FormDefinition = {
  fields: [
    {
      id: "employee_grade",
      label: "Select Grade",
      type: "select",
      required: true,
      optionsRef: "taxonomy.skillLog.grades",
    },
    {
      id: "employee_id",
      label: "Employee",
      type: "select",
      required: true,
    },
    {
      id: "section",
      label: "Section",
      type: "select",
      optionsRef: "taxonomy.skillLog.sections",
    },
    {
      id: "tier_auth",
      label: "Tier Authorisation",
      type: "select",
      optionsRef: "taxonomy.skillLog.tierAuthorisations",
    },
    {
      id: "review_period",
      label: "Review Period",
      type: "select",
      required: true,
      optionsRef: "taxonomy.skillLog.reviewPeriods",
    },
    {
      id: "log_type",
      label: "Skills Log Type",
      type: "select",
      required: true,
      optionsRef: "taxonomy.skillLog.types",
    },
    {
      id: "competencies",
      label: "Competency Assessment",
      type: "readOnly",
      optionsRef: "taxonomy.skillLog.competencies",
    },
    {
      id: "strengths_observed",
      label: "Strengths Observed",
      type: "textarea",
    },
    {
      id: "development_gaps",
      label: "Development Gaps",
      type: "textarea",
    },
    {
      id: "supervisor_id",
      label: "Supervisor",
      type: "hidden",
      source: { kind: "session", path: "userId" },
    },
  ],
  autoFill: {
    supervisor_id: { kind: "session", path: "userId" },
  },
};

export const modSkillLog: ModuleRecord = {
  id: "mod:skill-log",
  source: "builtin",
  legacyKey: "hc:skillLog",
  label: "Skill Logs",
  groupId: "grp:human-capital",
  route: "/dashboard/humanCapital/skillLog",
  enabled: true,
  sortOrder: 40,
  sidebar: {
    icon: "clipboard-list",
    showInSidebar: true,
  },
  table: "skill_logs",
  supportedActions: ["view", "add", "edit", "review", "approve"],
  taxonomyRefs: [
    "taxonomy.skillLog.types",
    "taxonomy.skillLog.sections",
    "taxonomy.skillLog.tierAuthorisations",
    "taxonomy.skillLog.reviewPeriods",
    "taxonomy.skillLog.grades",
    "taxonomy.skillLog.statuses",
    "taxonomy.skillLog.competencies",
  ],
  businessLogic: [],

  shell: {
    layout: "module-standard-v1",
    primaryAction: {
      label: SKILL_LOG_PAGE_COPY.fillButton,
      featureId: "feat:skill-log:fill",
      requires: { add: true },
    },
  },

  features: [
    {
      id: "feat:skill-log:list",
      label: "View skills logs",
      requires: { view: true },
    },
    {
      id: "feat:skill-log:fill",
      label: "Fill skills log",
      requires: { add: true },
    },
    {
      id: "feat:skill-log:edit-draft",
      label: "Edit draft log",
      requires: { edit: true },
    },
    {
      id: "feat:skill-log:review-queue",
      label: "Review submitted skill logs",
      requires: { review: true },
    },
    {
      id: "feat:skill-log:sign-off",
      label: "Approve / sign off submitted log",
      requires: { approve: true },
    },
    {
      id: "feat:skill-log:delete-draft",
      label: "Delete draft log",
      requires: { edit: true },
    },
  ],

  listView: {
    type: "table",
    mobileFallback: "cards",
    columns: [
      { id: "log_type", field: "log_type", label: "Log Type", sortable: true },
      { id: "employee", field: "employee_name", label: "Employee" },
      { id: "grade", field: "employee_grade", label: "Grade" },
      { id: "period", field: "review_period", label: "Period" },
      { id: "supervisor", field: "supervisor_name", label: "Filled By" },
      { id: "status", field: "status", label: "Status", cell: "statusBadge" },
      {
        id: "rating",
        field: "overall_rating",
        label: "Rating",
        cell: "number",
        align: "right",
      },
      { id: "actions", field: "id", label: "", cell: "rowActions" },
    ],
    filters: [
      {
        id: "status",
        type: "pill",
        field: "status",
        optionsRef: "taxonomy.skillLog.statuses",
      },
      {
        id: "search",
        type: "search",
        fields: ["employee_name", "log_type"],
      },
    ],
    emptyState: {
      title: SKILL_LOG_PAGE_COPY.emptyTitle,
      description: SKILL_LOG_PAGE_COPY.emptyCanAct,
    },
  },

  formDefinition: skillLogFormDefinition,
};
