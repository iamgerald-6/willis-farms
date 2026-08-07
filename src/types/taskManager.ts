// Task Manager domain types.
// Kept in its own file (rather than the shared src/types.ts) so this feature
// stays easy to isolate/remove and doesn't touch a file your colleague may
// also be editing.

export type LifecycleStatus = "active" | "completed" | "archived" | "deleted";

export type DisplayStatus =
  | "Not Started"
  | "In Progress"
  | "Overdue"
  | "Compliant / Ongoing"
  | "Completed"
  | "Archived"
  | "Deleted";

export type TaskType = "general" | "obligation" | "monitoring";
export type TaskSource = "manual" | "ai_extracted";
export type AuditAction =
  | "created"
  | "edited"
  | "archived"
  | "deleted"
  | "restored"
  | "completed";

export interface TMProject {
  id: string;
  name: string;
  description?: string | null;
  status: "active" | "archived";
  created_by: string;
  created_at: string;
  updated_at: string;
  // Attached by the API — not stored columns
  task_count?: number;
  open_task_count?: number;
  overdue_task_count?: number;
}

export interface TMTask {
  id: string;
  project_id: string;
  title: string;
  description?: string | null;
  owner_id?: string | null;
  start_date?: string | null; // ISO date, e.g. "2026-01-15"
  due_date?: string | null; // ISO date, e.g. "2026-12-31"
  is_recurring: boolean;
  task_type: TaskType;
  frequency?: string | null;
  indicator?: string | null;
  method_provider?: string | null;
  lifecycle_status: LifecycleStatus;
  completed_at?: string | null;
  progress_percent: number;
  source: TaskSource;
  source_document_url?: string | null;
  source_document_name?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;

  // Attached by the API — not stored columns
  owner_name?: string | null;
  display_status?: DisplayStatus;
  project_name?: string | null;
  // Whether this task has any subtasks defined. When true, progress_percent
  // is a computed rollup (see subtaskProgress.ts) driven by ticking leaf
  // subtasks, not the manual slider — only accurate on responses from
  // GET /api/task-manager/tasks (the list view); other routes that return a
  // single task (progress/lifecycle updates) don't compute it and default
  // to false, since the client always refetches the list afterward anyway.
  has_subtasks?: boolean;
}

/**
 * A node in a task's subtask tree, up to 4 levels deep (depth 1 = a direct
 * child of the task, depth 4 = the deepest allowed level). Only leaf nodes
 * (no children) are ever ticked directly via is_done — a parent's own
 * completion is always computed client/server-side as the weighted sum of
 * its children (see src/lib/subtaskProgress.ts), never stored.
 *
 * `children` is populated when the API returns the tree (GET .../subtasks);
 * it's absent on the raw row shape used for create/update payloads.
 */
export interface TMSubtask {
  id: string;
  task_id: string;
  parent_id: string | null;
  title: string;
  weight_percent: number;
  is_done: boolean;
  depth: number;
  position: number;
  created_at: string;
  updated_at: string;
  children?: TMSubtask[];
}

export interface TMAuditLogEntry {
  id: string;
  task_id: string;
  project_id: string;
  action: AuditAction;
  changed_fields?: string[] | null;
  previous_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  performed_by: string;
  performed_by_name: string;
  performed_at: string;
}

export interface ExtractionJobFile {
  file_name: string;
  file_url: string;
}

export interface TMExtractionJob {
  id: string;
  project_id: string;
  // Legacy single-file columns — kept populated with the first file for
  // back-compat, but `files` is the source of truth now that a job can
  // cover more than one document (see multi-document-extraction.sql).
  file_name: string | null;
  file_url: string | null;
  files: ExtractionJobFile[];
  status: "pending" | "completed" | "failed";
  extracted_tasks?: ExtractedTaskProposal[] | null;
  error_message?: string | null;
  created_by: string;
  created_at: string;
}

/** What Claude proposes before a human reviews and saves it as a real task. */
export interface ExtractedTaskProposal {
  title: string;
  description?: string;
  due_date?: string | null;
  is_recurring?: boolean;
  task_type?: TaskType;
  frequency?: string | null;
  indicator?: string | null;
  method_provider?: string | null;
  // Best-effort filled in server-side by matching owner_name against real
  // users (see matchOwnerId in the extract route) — still just a proposal;
  // whoever reviews it can change or clear it before saving.
  owner_id?: string | null;
  // The name as actually written in the source document, if any — kept
  // even when owner_id couldn't be confidently matched, so the reviewer
  // can see who was intended and pick manually.
  owner_name?: string | null;
  // Which uploaded file this task was primarily drawn from, when the
  // extraction covered more than one document — omitted when a task
  // synthesizes information across several files rather than coming from
  // just one. Display-only, not saved onto the task itself.
  source_file_name?: string | null;
}

/** An already-uploaded document elsewhere in the portal, offered as an extraction source instead of uploading a fresh file. */
export interface PortalDocument {
  id: string;
  title: string;
  source: "Policies & Ops" | "SOP";
  category?: string | null;
  file_name: string;
  url: string;
  uploaded_at: string;
}

export interface TMMonthlyReport {
  id: string;
  period_start: string;
  period_end: string;
  pdf_url?: string | null;
  sent_to: string[];
  generated_by: string | null;
  generated_at: string;
  // Attached by the API — not a stored column. "Automatic Schedule" when
  // generated_by is null (a cron-triggered send).
  generated_by_name?: string;
}

/** Automatic monthly-report send config — singleton row, read/written via /api/task-manager/reports/schedule. */
export interface TMReportSchedule {
  id: string;
  enabled: boolean;
  day_of_month: number;
  recipients: string[];
  last_sent_period: string | null;
  updated_at: string;
}

/** Deadline reminder config — singleton row, read/written via /api/task-manager/reminders/settings. */
export interface TMReminderSettings {
  id: string;
  enabled: boolean;
  days_before_due: number;
  // Optional extra addresses cc'd on every reminder, in addition to the
  // task owner (who's always notified automatically).
  cc_recipients: string[];
  updated_at: string;
}
