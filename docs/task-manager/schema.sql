-- ============================================================================
-- Task Manager — database schema
-- Run this once in the Supabase SQL editor for the Wills Farms project.
--
-- Follows the same convention as the rest of this app: no Postgres RLS
-- policies; every table is only ever touched through the Next.js API routes
-- using the service-role key, and those routes enforce who can do what
-- (see src/lib/taskAccessControl.ts). This matches how leave_requests,
-- manuals, appraisals, etc. are already set up in this project.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Projects ─────────────────────────────────────────────────────────────
-- e.g. "EPA Permit", "Fire Service", "Human Capital Audit"
create table if not exists tm_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Tasks ────────────────────────────────────────────────────────────────
create table if not exists tm_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references tm_projects(id) on delete cascade,

  title text not null,
  description text,
  owner_id uuid,                 -- references public.users.user_id
  start_date date,
  due_date date,
  is_recurring boolean not null default false,

  -- Optional fields used when a task represents a recurring monitoring check
  -- (mirrors the "Monitoring Schedule" view in the concept deck). Left null
  -- for ordinary tasks.
  task_type text not null default 'general' check (task_type in ('general', 'obligation', 'monitoring')),
  frequency text,                -- e.g. "Quarterly", "Monthly"
  indicator text,                -- e.g. "Air Quality", "Surface Water Quality"
  method_provider text,          -- e.g. "Accredited lab", "In-house test kit"

  -- Lifecycle: separate from the auto-computed display status (Not Started /
  -- In Progress / Overdue / Compliant-Ongoing), which is derived from
  -- due_date + is_recurring at read time, not stored.
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'completed', 'archived', 'deleted')),
  completed_at timestamptz,

  -- The one thing a task's owner can update themselves, without full edit
  -- access: their own progress. Hitting 100 auto-completes the task
  -- (lifecycle_status -> 'completed'). See /api/task-manager/tasks/[id]/progress.
  progress_percent int not null default 0 check (progress_percent between 0 and 100),

  source text not null default 'manual' check (source in ('manual', 'ai_extracted')),
  source_document_url text,
  source_document_name text,

  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tm_tasks_project_id_idx on tm_tasks(project_id);
create index if not exists tm_tasks_owner_id_idx on tm_tasks(owner_id);
create index if not exists tm_tasks_lifecycle_status_idx on tm_tasks(lifecycle_status);
create index if not exists tm_tasks_due_date_idx on tm_tasks(due_date);

-- ── Audit log ────────────────────────────────────────────────────────────
-- Every edit / archive / delete / restore is written here — who, what, when.
create table if not exists tm_task_audit_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tm_tasks(id) on delete cascade,
  project_id uuid not null references tm_projects(id) on delete cascade,

  action text not null check (action in ('created', 'edited', 'archived', 'deleted', 'restored', 'completed')),
  changed_fields jsonb,          -- e.g. ["due_date", "owner_id"]
  previous_values jsonb,
  new_values jsonb,

  performed_by uuid not null,
  performed_by_name text not null,
  performed_at timestamptz not null default now()
);

create index if not exists tm_audit_task_id_idx on tm_task_audit_log(task_id);
create index if not exists tm_audit_project_id_idx on tm_task_audit_log(project_id);

-- ── Subtasks ─────────────────────────────────────────────────────────────
-- Nested up to 4 levels deep; each sibling group's weight_percent values
-- must sum to exactly 100 (enforced in the API — see docs/task-manager/
-- subtasks.sql for the full rationale). Only leaf nodes are directly
-- tickable; a parent's completion is the weighted sum of its children,
-- rolled up onto the task's own progress_percent.
create table if not exists tm_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tm_tasks(id) on delete cascade,
  parent_id uuid references tm_subtasks(id) on delete cascade,

  title text not null,
  weight_percent int not null check (weight_percent between 0 and 100),
  is_done boolean not null default false,
  depth int not null check (depth between 1 and 4),
  position int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tm_subtasks_task_id_idx on tm_subtasks(task_id);
create index if not exists tm_subtasks_parent_id_idx on tm_subtasks(parent_id);

-- ── AI document-extraction jobs ─────────────────────────────────────────
-- A staging area: Claude proposes tasks from an uploaded document, a Senior
-- Management user reviews/edits them in the UI, then they're saved as real
-- tm_tasks rows (source = 'ai_extracted') via the bulk-create endpoint.
create table if not exists tm_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references tm_projects(id) on delete cascade,

  file_name text not null,
  file_url text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  extracted_tasks jsonb,         -- proposed tasks before review
  error_message text,

  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- ── Monthly report log ───────────────────────────────────────────────────
create table if not exists tm_monthly_reports (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  pdf_url text,
  sent_to jsonb not null default '[]',
  generated_by uuid not null,
  generated_at timestamptz not null default now()
);

create index if not exists tm_reports_period_idx on tm_monthly_reports(period_start, period_end);
