import type { FormDefinition, ModuleRecord } from "../types";

/**
 * Grade-step promotion forms are highly dynamic (eligibility, disqualifying
 * factors, documented evidence, skills-log competencies, and interview
 * questions all vary per step — see `promotionFormConfigs.ts`), so this
 * definition covers the stable header fields. The step-specific sections are
 * rendered by the existing `promotionForm.tsx` engine.
 */
export const promotionFormDefinition: FormDefinition = {
  fields: [
    {
      id: "employee_id",
      label: "Employee",
      type: "select",
      required: true,
    },
    {
      id: "current_grade",
      label: "Current Grade",
      type: "text",
      required: true,
    },
    {
      id: "proposed_grade",
      label: "Proposed Grade",
      type: "text",
      required: true,
    },
    {
      id: "assessment",
      label: "Promotion Assessment",
      type: "readOnly",
      optionsRef: "taxonomy.promotion.formConfigForStep",
      helpText: "Eligibility, evidence, skills log, and interview sections vary by step",
    },
    {
      id: "final_decision",
      label: "Final Decision",
      type: "select",
      required: true,
      optionsRef: "taxonomy.promotion.decisions",
    },
  ],
};

export const modPromotion: ModuleRecord = {
  id: "mod:promotion",
  source: "builtin",
  legacyKey: "hc:promotion",
  label: "Promotion",
  groupId: "grp:human-capital",
  route: "/dashboard/humanCapital/promotion",
  enabled: true,
  sortOrder: 50,
  sidebar: {
    icon: "trending-up",
    showInSidebar: true,
  },
  table: "promotions",
  supportedActions: ["view", "add", "review"],
  taxonomyRefs: [
    "taxonomy.promotion.matrix",
    "taxonomy.promotion.decisions",
    "taxonomy.promotion.generalConditions",
    "taxonomy.promotion.formConfigForStep",
  ],

  shell: {
    layout: "module-standard-v1",
    primaryAction: {
      label: "New Promotion Assessment",
      featureId: "feat:promotion:assess",
      requires: { add: true },
    },
  },

  features: [
    {
      id: "feat:promotion:assess",
      label: "Start promotion assessment",
      requires: { add: true },
    },
    {
      id: "feat:promotion:decide",
      label: "Record final promotion decision",
      requires: { review: true },
    },
    {
      id: "feat:promotion:view-history",
      label: "View promotion history",
      requires: { view: true },
    },
  ],

  listView: {
    type: "table",
    mobileFallback: "cards",
    columns: [
      { id: "employee", field: "employee_name", label: "Employee", sortable: true },
      { id: "grade_change", field: "current_grade", label: "Grade Change" },
      { id: "proposed_title", field: "proposed_job_title", label: "Proposed Title" },
      { id: "reviewing_manager", field: "reviewing_manager", label: "Reviewing Manager" },
      { id: "decision", field: "final_decision", label: "Decision", cell: "statusBadge" },
      { id: "created_at", field: "created_at", label: "Date", cell: "date" },
      { id: "actions", field: "id", label: "", cell: "rowActions" },
    ],
    filters: [
      {
        id: "grade",
        type: "pill",
        field: "current_grade",
        optionsRef: "taxonomy.promotion.gradeOrder",
      },
      {
        id: "decision",
        type: "pill",
        field: "final_decision",
        optionsRef: "taxonomy.promotion.decisions",
      },
      {
        id: "search",
        type: "search",
        fields: ["employee_name"],
      },
    ],
    emptyState: {
      title: "No promotion history yet",
      description: "Completed promotion assessments will appear here.",
    },
  },

  formDefinition: promotionFormDefinition,
};
