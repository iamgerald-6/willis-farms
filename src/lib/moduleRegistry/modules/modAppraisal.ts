import type { FormDefinition, ModuleRecord } from "../types";

/**
 * The appraisal form itself is highly dynamic — rating sections vary by
 * grade band and quarter (see `lib/appraisal/sections.ts`), so this
 * definition covers the stable header fields only. The rating grid is
 * rendered by the existing `AppraisalPage.tsx` engine, referenced here via
 * the `competencies`-style readOnly field + optionsRef.
 */
export const appraisalFormDefinition: FormDefinition = {
  fields: [
    {
      id: "review_quarter",
      label: "Review Quarter",
      type: "select",
      required: true,
      optionsRef: "taxonomy.appraisal.quarters",
    },
    {
      id: "review_year",
      label: "Review Year",
      type: "number",
      required: true,
    },
    {
      id: "job_title",
      label: "Job Title",
      type: "text",
      required: true,
    },
    {
      id: "immediate_supervisor",
      label: "Immediate Supervisor",
      type: "text",
      required: true,
    },
    {
      id: "ratings",
      label: "Rating Sections",
      type: "readOnly",
      optionsRef: "taxonomy.appraisal.sectionsForGradeBand",
      helpText: "Section weights and items vary by grade band and quarter",
    },
    {
      id: "promotion_readiness_assessment",
      label: "Promotion Readiness",
      type: "select",
      optionsRef: "taxonomy.appraisal.promotionReadiness",
    },
    {
      id: "employee_user_id",
      label: "Employee",
      type: "hidden",
      source: { kind: "session", path: "userId" },
    },
  ],
};

export const modAppraisal: ModuleRecord = {
  id: "mod:appraisal",
  source: "builtin",
  legacyKey: "hc:appraisal",
  label: "Appraisal",
  groupId: "grp:human-capital",
  route: "/dashboard/humanCapital/appraisal",
  enabled: true,
  sortOrder: 20,
  sidebar: {
    icon: "star",
    showInSidebar: true,
  },
  table: "appraisals",
  supportedActions: ["view", "add", "edit", "review"],
  taxonomyRefs: [
    "taxonomy.appraisal.quarters",
    "taxonomy.appraisal.gradeBands",
    "taxonomy.appraisal.promotionReadiness",
    "taxonomy.appraisal.sectionsForGradeBand",
  ],

  shell: {
    layout: "module-standard-v1",
    primaryAction: {
      label: "Fill Appraisal",
      featureId: "feat:appraisal:self-assess",
      requires: { add: true },
    },
  },

  features: [
    {
      id: "feat:appraisal:self-assess",
      label: "Complete self-assessment",
      requires: { add: true },
    },
    {
      id: "feat:appraisal:supervisor-review",
      label: "Complete supervisor evaluation",
      requires: { edit: true },
    },
    {
      id: "feat:appraisal:final-review",
      label: "Run final review meeting",
      requires: { review: true },
    },
    {
      id: "feat:appraisal:archive",
      label: "Archive appraisal",
      requires: { edit: true },
    },
    {
      id: "feat:appraisal:view-all",
      label: "View all employees' appraisals",
      requires: { view: true },
    },
  ],

  listView: {
    type: "table",
    mobileFallback: "cards",
    columns: [
      { id: "employee", field: "employee_name", label: "Employee", sortable: true },
      { id: "job_title", field: "job_title", label: "Job Title" },
      { id: "period", field: "review_quarter", label: "Period" },
      { id: "status", field: "status", label: "Status", cell: "statusBadge" },
      {
        id: "score",
        field: "final_quarter_score",
        label: "Score",
        cell: "number",
        align: "right",
      },
      {
        id: "promotion_readiness",
        field: "promotion_readiness",
        label: "Promotion Readiness",
      },
      { id: "actions", field: "id", label: "", cell: "rowActions" },
    ],
    filters: [
      {
        id: "quarter",
        type: "pill",
        field: "review_quarter",
        optionsRef: "taxonomy.appraisal.quarters",
      },
      {
        id: "search",
        type: "search",
        fields: ["employee_name", "job_title"],
      },
    ],
    emptyState: {
      title: "No appraisals yet",
      description: "Appraisals appear here once the review period opens.",
    },
  },

  formDefinition: appraisalFormDefinition,
};

export const modJustifications: ModuleRecord = {
  id: "mod:justifications",
  source: "builtin",
  legacyKey: "hc:justifications",
  label: "Justifications",
  groupId: "grp:human-capital",
  route: "/dashboard/humanCapital/appraisal/justifications",
  enabled: true,
  sortOrder: 30,
  sidebar: {
    icon: "shield-alert",
    showInSidebar: true,
  },
  table: "appraisal_justifications",
  supportedActions: ["view", "add", "approve"],
  taxonomyRefs: ["taxonomy.appraisal.justificationStatuses"],

  shell: {
    layout: "module-standard-v1",
  },

  features: [
    {
      id: "feat:justifications:submit",
      label: "Submit deadline justification",
      requires: { add: true },
    },
    {
      id: "feat:justifications:review",
      label: "Approve or reject justification",
      requires: { approve: true },
    },
  ],

  listView: {
    type: "table",
    mobileFallback: "cards",
    columns: [
      { id: "employee", field: "employee_name", label: "Employee" },
      { id: "period", field: "review_quarter", label: "Period" },
      { id: "reason", field: "reason_text", label: "Reason" },
      { id: "status", field: "status", label: "Status", cell: "statusBadge" },
      { id: "reviewed_by", field: "reviewed_by_name", label: "Reviewed By" },
      { id: "actions", field: "id", label: "", cell: "rowActions" },
    ],
    filters: [
      {
        id: "status",
        type: "pill",
        field: "status",
        optionsRef: "taxonomy.appraisal.justificationStatuses",
      },
    ],
    emptyState: {
      title: "No justifications submitted",
      description:
        "Supervisors can submit a justification after a missed deadline.",
    },
  },
};
