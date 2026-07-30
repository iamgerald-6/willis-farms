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
  due_date?: string | null; // ISO date, e.g. "2026-12-31"
  is_recurring: boolean;
  task_type: TaskType;
  frequency?: string | null;
  indicator?: string | null;
  method_provider?: string | null;
  lifecycle_status: LifecycleStatus;
  completed_at?: string | null;
  source: TaskSource;
  source_document_url?: string | null;
  source_document_name?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;

  // Attached by the API — not stored columns
  owner_name?: string | null;
  display_status?: DisplayStatus;
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

export interface TMExtractionJob {
  id: string;
  project_id: string;
  file_name: string;
  file_url: string;
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
}

export interface TMMonthlyReport {
  id: string;
  period_start: string;
  period_end: string;
  pdf_url?: string | null;
  sent_to: string[];
  generated_by: string;
  generated_at: string;
}
