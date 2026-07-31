# Task Manager — setup & local testing

This is the branch `sheila/task-manager`. Everything below gets it running on
your machine so you can click through it before pushing or merging.

## 1. Run the schema

Open the Supabase SQL editor for the Wills Farms project and run
`docs/task-manager/schema.sql` (in this same folder) once. It creates five
new tables — `tm_projects`, `tm_tasks`, `tm_task_audit_log`,
`tm_extraction_jobs`, `tm_monthly_reports` — and doesn't touch anything
that already exists.

## 2. Environment variables

Add these to your `.env.local` (create it at the repo root if you don't
already have one — it's gitignored, so it never gets committed):

```
NEXT_PUBLIC_SUPABASE_URL=...          # already needed by the rest of the app
NEXT_PUBLIC_SUPABASE_ANON_KEY=...     # already needed by the rest of the app
SUPABASE_SERVICE_ROLE_KEY=...         # already needed by the rest of the app

RESEND_API_KEY=...                    # already used for the lead-capture form —
                                       # reuse the same key. Needed for the
                                       # monthly report email.

ANTHROPIC_API_KEY=...                 # NEW — needed for "Add Tasks From a
                                       # Document". Get one at
                                       # console.anthropic.com. Without this,
                                       # everything else works fine — only the
                                       # document-extraction button will error.

NEXT_PUBLIC_APP_URL=http://localhost:3000   # optional — used to build the
                                       # dashboard link inside the report
                                       # email. Defaults to a placeholder if
                                       # not set.
```

## 3. Give yourself a Senior Management role

Editing, archiving, deleting, creating projects/tasks, and sending reports
are all restricted to `admin`, `manager`, or `super_admin` roles (the same
set the Leave page already treats as "admin/manager"). Check your row in
the `users` table has one of those roles if you want to test the edit flow
— otherwise you'll see the read-only employee view (only your own tasks,
no Edit List button).

To see the *employee* view, log in as (or temporarily set) a user with
role `employee`, and assign them a task as a Senior Management user first
— otherwise their Task Manager tab will show "no tasks assigned yet."

## 4. Install & run

```
npm install
npm run dev
```

Then open `/dashboard/taskManager` (there's also a "Task Manager" link in
the sidebar, marked NEW).

## 5. What to test

- **Create a project** (Senior Management) → pills appear at the top.
- **Add a task manually**, assign an owner and due date → status badge
  updates automatically (never editable directly).
- **Edit List** → click a task's pencil icon → the row itself becomes
  editable (task name, owner, due date) → Save/Cancel.
- **Archive / Delete** a task, then switch the Active/Completed/Archived/
  Deleted toggle above the list to find it, and **Restore** it.
- Click the clock icon on any task to see its **audit history** — who
  changed what, and when.
- **Add Tasks From a Document** (needs `ANTHROPIC_API_KEY`) → upload a PDF
  (e.g. a permit or licence) → review the proposed tasks → save.
- **Monthly Report** button (top right) → pick a month, enter an email,
  Generate & Send → check the inbox for the PDF attachment (needs
  `RESEND_API_KEY`; without it, the report still generates and logs, it
  just won't actually email).
- Log in as an **employee** (non-Senior-Management) and confirm: no Edit
  List / New Project / Monthly Report buttons, and only projects where
  they own a task are visible at all.

## Update — round 2 (progress %, owner assignment, Word docs, document picker)

If you already ran the schema once, run this too (adds one column, safe to
re-run):

```sql
alter table tm_tasks add column if not exists progress_percent int not null default 0 check (progress_percent between 0 and 100);
```

Then, since this round added a new package (`mammoth`, for reading Word
documents), run `npm install` again before `npm run dev`.

**New things to test:**

- **Progress**: as a task's owner (or Senior Management), you'll see a thin
  progress bar under the status badge — click it to open a slider (0–100,
  steps of 5). This is the one thing a non-Senior-Management owner can
  change on their own task. Hitting 100 auto-completes the task and logs it,
  same as clicking Complete.
- **Owner assignment during extraction**: on the review screen after
  uploading/choosing a document, each proposed task now has an owner
  dropdown — assign before saving instead of after.
- **Word documents**: the upload step now accepts `.doc`/`.docx` alongside
  PDF. Text is extracted and sent to Claude as plain text (no native
  document view for Word, so formatting/images in the doc aren't seen —
  only the text).
- **Choose existing document**: in "Add Tasks From a Document," toggle to
  "Choose existing" to pick from documents already uploaded under Policies &
  Ops or the SOP library, instead of uploading a fresh file.

## Notes / things I simplified from the concept deck

- The deck's separate "Obligation Register" and "Monitoring Schedule"
  tabs are unified into one **Tasks** list here — a task can optionally
  carry monitoring-specific fields (indicator, frequency, method/provider)
  when it's a recurring check, but they live in the same table and list
  rather than two separate views. Easy to split back out later if you'd
  rather keep them visually distinct.
- The deck's "Dashboard / Gantt" tab became the **Summary** tab (stat
  cards + upcoming deadlines) rather than a full Gantt chart, to keep the
  first build scoped. Can add a real Gantt view as a follow-up.
- Deleting a task is a **soft delete** — the row and its full audit trail
  stay in the database, just hidden from the default view. Nothing is
  ever hard-deleted.
