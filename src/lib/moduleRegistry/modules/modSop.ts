import type { FormDefinition, ModuleRecord } from "../types";
import { SOP_BROWSE_COPY } from "../taxonomy/sop";

/** Shared upload form fields for SOP content */
export const sopUploadFormDefinition: FormDefinition = {
  fields: [
    {
      id: "title",
      label: "Title",
      type: "text",
      required: true,
      helpText: "e.g. Farrowing Crate Preparation",
    },
    {
      id: "category",
      label: "Category",
      type: "select",
      required: true,
      optionsRef: "taxonomy.sop.categories",
    },
    {
      id: "sub_category",
      label: "Sub-category",
      type: "select",
      required: true,
      optionsRef: "taxonomy.sop.subcategories",
    },
    {
      id: "description",
      label: "Description",
      type: "textarea",
      required: true,
    },
    {
      id: "document_read_minutes",
      label: "Document read time (minutes)",
      type: "number",
      required: true,
    },
    {
      id: "video_duration_minutes",
      label: "Video duration (minutes)",
      type: "number",
      required: false,
    },
    {
      id: "cover_image",
      label: "Cover image",
      type: "readOnly",
      helpText: "Optional — file upload in modal",
    },
    {
      id: "document",
      label: "Document (PDF)",
      type: "readOnly",
      required: true,
      helpText: "Required — file upload in modal",
    },
    {
      id: "video",
      label: "Video",
      type: "readOnly",
      helpText: "Optional — file upload in modal",
    },
  ],
};

export const modSop: ModuleRecord = {
  id: "mod:sop",
  source: "builtin",
  legacyKey: "sop:view",
  label: "SOP",
  groupId: "grp:operations",
  route: "/dashboard/sop",
  enabled: true,
  sortOrder: 20,
  sidebar: {
    icon: "leafy-green",
    showInSidebar: true,
  },
  table: "content",
  supportedActions: ["view"],
  taxonomyRefs: ["taxonomy.sop.categories", "taxonomy.sop.subcategories"],
  businessLogic: [],

  shell: {
    layout: "module-standard-v1",
  },

  features: [
    {
      id: "feat:sop:browse",
      label: "Browse SOP library",
      requires: { view: true },
    },
    {
      id: "feat:sop:detail",
      label: "Open SOP detail",
      requires: { view: true },
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
        optionsRef: "taxonomy.sop.categories",
      },
      {
        id: "search",
        type: "search",
        fields: ["title", "category", "sub_category"],
      },
    ],
    emptyState: {
      title: SOP_BROWSE_COPY.emptyTitle,
      description: SOP_BROWSE_COPY.emptyDescription,
    },
  },

  formDefinition: sopUploadFormDefinition,
};

// Not shown in the sidebar — Management is now reached via the "Manage"
// toggle on /dashboard/sop (see SOPHubPage). This record stays registered
// so the "sop:add" permission, taxonomy refs, and the /dashboard/addSop
// direct link (kept alive for anyone linked straight to it) still resolve.
export const modSopManage: ModuleRecord = {
  id: "mod:sop-manage",
  source: "builtin",
  legacyKey: "sop:add",
  label: "SOP Management",
  groupId: "grp:operations",
  route: "/dashboard/addSop",
  enabled: true,
  sortOrder: 30,
  sidebar: {
    icon: "file-stack",
    showInSidebar: false,
  },
  table: "content",
  supportedActions: ["view", "add", "edit"],
  taxonomyRefs: ["taxonomy.sop.categories", "taxonomy.sop.subcategories"],
  businessLogic: [],

  shell: {
    layout: "module-standard-v1",
    primaryAction: {
      label: "Add SOP",
      featureId: "feat:sop:upload",
      requires: { add: true },
    },
  },

  features: [
    {
      id: "feat:sop:upload",
      label: "Upload new SOP",
      requires: { add: true },
    },
    {
      id: "feat:sop:delete",
      label: "Delete SOP content",
      requires: { edit: true },
    },
    {
      id: "feat:sop:manage-list",
      label: "Manage SOP listing",
      requires: { view: true },
    },
  ],

  listView: {
    type: "table",
    mobileFallback: "cards",
    columns: [
      { id: "title", field: "title", label: "Title", sortable: true },
      { id: "category", field: "category", label: "Category" },
      { id: "sub_category", field: "sub_category", label: "Sub-category" },
      { id: "media", field: "document_url", label: "Media" },
      { id: "duration", field: "document_read_minutes", label: "Duration" },
      { id: "created_at", field: "created_at", label: "Created", cell: "date" },
      { id: "actions", field: "id", label: "", cell: "rowActions" },
    ],
    filters: [
      {
        id: "search",
        type: "search",
        fields: ["title", "category", "sub_category"],
      },
    ],
    emptyState: {
      title: "No SOP content yet",
      description: "Upload your first standard operating procedure.",
    },
  },

  formDefinition: sopUploadFormDefinition,
};
