export type Role = "admin" | "super_admin" | "manager" | "employee";

export type AccessTier = "standard" | "delegated";

export type GradeLevel = "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";

export interface User {
  id: string;
  user_id: string;
  email: string;
  phone?: string | null;
  role: Role;
  first_name: string;
  last_name: string;
  company_id: string;
  job_position?: string | null;
  grade_level?: GradeLevel | null;
  /** Average of the 4 quarters' final_quarter_score, written once Q4 locks. */
  final_score?: number | null;
  final_score_year?: number | null;
  /** Fully computed (final_score >= 70) — no manual override anywhere. */
  promotion_eligible?: boolean;
  /** standard = normal; delegated = sub-admin / half_admin (Access Control only) */
  access_tier?: AccessTier;
  /** Page keys when access_tier is delegated — legacy view list */
  page_permissions?: string[];
  /** view | add | edit per page key — legacy hierarchical levels */
  page_permission_levels?: Partial<
    Record<string, "view" | "add" | "edit">
  > | null;
  /** Independent actions per page key: view, add, edit, approve, review */
  page_permission_actions?: Partial<
    Record<string, Partial<Record<string, boolean>>>
  > | null;
  access_updated_at?: string | null;
  access_updated_by?: string | null;
  /** When true, user cannot sign in or use the dashboard */
  is_disabled?: boolean;
  /** Set to true once the invited user saves their password on first setup */
  email_verified?: boolean;
  email_confirm?: boolean;
  created_at?: string;
  /** user_id of who added this account (via Add User) — null for pre-existing/seed rows */
  created_by?: string | null;
  // Task Manager: can this user see every task/project, or only their own?
  // See canViewAllTasks() in src/lib/taskAccessControl.ts. Defaults to
  // false except super_admin, who always has it regardless of this value.
  tm_can_view_all_tasks?: boolean;
}

export interface Content {
  id: string;
  title: string;
  category: string;
  sub_category: string;
  description: string;
  cover_image_url?: string;
  video_url?: string;
  video_duration_minutes?: number;
  document_url?: string;
  document_read_minutes?: number;
  created_at: string;
  created_by: string;
  /** Resolved display name of the creator — added by the API, not stored. */
  created_by_name?: string | null;
  /** Set when archived (hidden from the main list, restorable). Requires
   * docs/sop/sop-audit-log.sql to have been run. */
  archived_at?: string | null;
}

export interface SopAuditLogEntry {
  id: string;
  content_id: string;
  content_title: string;
  action: "added" | "edited" | "archived" | "restored" | "deleted";
  performed_by: string;
  performed_by_name: string;
  performed_at: string;
}

export interface PolicyAuditLogEntry {
  id: string;
  manual_id: string;
  manual_title: string;
  action: "added" | "version_added" | "edited" | "deleted";
  detail?: string | null;
  performed_by: string;
  performed_by_name: string;
  performed_at: string;
}

// Appraisal-specific types (0–100% scoring, Q1–Q4 with Q4 = Annual) now
// live in src/lib/appraisal/scoring.ts and src/lib/appraisal/sections.ts —
// see those modules instead of duplicating types here.
