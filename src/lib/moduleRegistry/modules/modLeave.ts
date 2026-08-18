import type { ModuleRecord } from "../types";

export const modLeave: ModuleRecord = {
  id: "mod:leave",
  source: "builtin",
  legacyKey: "hc:leave",
  label: "Leave",
  groupId: "grp:human-capital",
  route: "/dashboard/humanCapital/leave",
  enabled: true,
  sortOrder: 10,
  sidebar: {
    icon: "calendar-check",
    showInSidebar: true,
  },
  table: "leave_requests",
  supportedActions: ["view", "add", "review", "approve"],
  taxonomyRefs: ["taxonomy.leave.types"],
  businessLogic: [],

  shell: {
    layout: "module-standard-v1",
    primaryAction: {
      label: "Apply for Leave",
      featureId: "feat:leave:apply",
      requires: { add: true },
    },
  },

  features: [
    {
      id: "feat:leave:apply",
      label: "Apply for leave",
      requires: { add: true },
    },
    {
      id: "feat:leave:history",
      label: "View leave history",
      requires: { view: true },
    },
    {
      id: "feat:leave:admin-review",
      label: "Approve or reject requests",
      requires: { approve: true },
    },
    {
      id: "feat:leave:admin-read",
      label: "Review all staff requests",
      requires: { review: true },
    },
  ],

  listView: {
    type: "table",
    mobileFallback: "cards",
    columns: [
      { id: "type", field: "leave_type", label: "Type", sortable: true },
      { id: "from", field: "start_date", label: "From", cell: "date" },
      { id: "to", field: "end_date", label: "To", cell: "date" },
      {
        id: "days",
        field: "total_days",
        label: "Days",
        cell: "number",
        align: "right",
      },
      { id: "reason", field: "reason", label: "Reason" },
      { id: "status", field: "status", label: "Status", cell: "statusBadge" },
      { id: "reviewed", field: "reviewed_at", label: "Reviewed", cell: "date" },
      { id: "admin_note", field: "admin_note", label: "Admin Note" },
    ],
    filters: [
      {
        id: "search",
        type: "search",
        fields: ["leave_type", "reason"],
      },
    ],
    emptyState: {
      title: "No leave requests yet",
      description: 'Click "Apply for Leave" to get started.',
    },
  },
};
