import type { FormDefinition, ModuleRecord } from "../types";
import { POLICIES_PAGE_COPY } from "../taxonomy/policies";

export const policiesUploadFormDefinition: FormDefinition = {
  fields: [
    {
      id: "title",
      label: "Manual Title",
      type: "text",
      required: true,
      helpText: "e.g. Employee Handbook",
    },
    {
      id: "category",
      label: "Category",
      type: "text",
      required: true,
      optionsRef: "taxonomy.policies.categories",
      helpText: "Pick an existing one or type a new category",
    },
    {
      id: "version_label",
      label: "Version Label",
      type: "text",
      required: true,
      helpText: "e.g. v1.0",
    },
    {
      id: "description",
      label: "Description",
      type: "textarea",
    },
    {
      id: "version_notes",
      label: "Version Notes",
      type: "textarea",
      helpText: "What changed in this version? (optional)",
    },
    {
      id: "file",
      label: "PDF File",
      type: "readOnly",
      required: true,
      helpText: "PDF files only — file upload in modal",
    },
  ],
};

export const modPolicies: ModuleRecord = {
  id: "mod:policies",
  source: "builtin",
  legacyKey: "policies",
  label: "Policies & Ops",
  groupId: "grp:operations",
  route: "/dashboard/policies",
  enabled: true,
  sortOrder: 10,
  sidebar: {
    icon: "gantt-chart-square",
    showInSidebar: true,
  },
  table: "manuals",
  supportedActions: ["view", "add", "edit"],
  taxonomyRefs: ["taxonomy.policies.categories"],
  businessLogic: [],

  shell: {
    layout: "module-standard-v1",
    primaryAction: {
      label: POLICIES_PAGE_COPY.uploadButton,
      featureId: "feat:policies:upload",
      requires: { add: true },
    },
  },

  features: [
    {
      id: "feat:policies:browse",
      label: "Browse manuals",
      requires: { view: true },
    },
    {
      id: "feat:policies:upload",
      label: "Upload manual",
      requires: { add: true },
    },
    {
      id: "feat:policies:delete",
      label: "Delete manual",
      requires: { edit: true },
    },
    {
      id: "feat:policies:admin-table",
      label: "Admin table view",
      requires: { edit: true },
    },
  ],

  listView: {
    type: "grid",
    mobileFallback: "cards",
    filters: [
      {
        id: "category",
        type: "pill",
        field: "category",
        optionsRef: "taxonomy.policies.categories",
      },
      {
        id: "search",
        type: "search",
        fields: ["title", "category", "description"],
      },
    ],
    emptyState: {
      title: POLICIES_PAGE_COPY.emptyTitle,
      description: POLICIES_PAGE_COPY.emptyAdminDescription,
    },
  },

  formDefinition: policiesUploadFormDefinition,
};
