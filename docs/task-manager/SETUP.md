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

## Fixing "Add User" errors on a fresh/test Supabase project

Two separate things need to be true for the Users page's "Add User" to work,
and a test project usually starts missing both:

1. `NEXT_PUBLIC_SUPABASE_URL` and friends aside — the invite email needs
   `NEXT_PUBLIC_APP_URL` set in `.env.local` (e.g.
   `NEXT_PUBLIC_APP_URL=http://localhost:3000`), **and** that same URL added
   to Supabase's allowed redirect list: Authentication → URL Configuration →
   Redirect URLs → add `http://localhost:3000/set-password`. Without both,
   Supabase rejects the invite outright.
2. The `users` table needs two more columns than the earlier migration
   added — `create_user`'s insert also writes `email_verified` and
   `email_confirm`, which a fresh table won't have. Run:

```sql
alter table users add column if not exists email_verified boolean default false;
alter table users add column if not exists email_confirm boolean default false;
```

If "Add User" still fails after both of those, the error message returned
by the API is the real Supabase/Postgres error — paste it back to me
verbatim rather than a summary, it'll say exactly what's missing.

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

## Update — round 3 (tabs now match the deck exactly, plus fixes)

The tab structure was rebuilt to match the concept deck: **Summary**,
**Dashboard / Gantt**, **Obligation Register**, **Monitoring Schedule**,
**Compliance Calendar** — five tabs instead of the earlier simplified
three.

- **Obligation Register** and **Monitoring Schedule** are now two separate
  views. Same underlying `tm_tasks` table — a task's `task_type` decides
  which list it shows up in (`monitoring` → Monitoring Schedule, anything
  else → Obligation Register). Monitoring tasks additionally show/edit
  Indicator, Frequency, and Method/Provider fields; the Obligation Register
  doesn't.
- **Dashboard / Gantt** is a real progress view now: one row per active
  task, sorted by completion, with a bar filled to `progress_percent` and
  colored by status (red = overdue, amber = in progress, green =
  compliant/ongoing, blue = completed, grey = not started). It intentionally
  does **not** position bars by due date — the ask was "how complete is
  each task at a glance," not a calendar-style timeline.
- No new SQL for this round — `task_type` and `progress_percent` already
  existed from earlier rounds.
- Deleting a task is a **soft delete** — the row and its full audit trail
  stay in the database, just hidden from the default view. Nothing is
  ever hard-deleted.

**Also fixed this round:**

- "Add User" errors and the missing invite-redirect config — see the
  section above.
- Policies & Ops upload failing with "could not find the table
  public.manuals" — your test Supabase project was missing the `manuals`,
  `manual_versions`, and `content` tables entirely (used elsewhere in the
  portal, not new to Task Manager). Run `docs/task-manager/supporting-tables.sql`
  once to add them.
- Manual upload category is now a free-text field with your existing
  categories as suggestions, instead of being locked to four fixed options.

**Still open, need info from you to fix:**

- The "Minified React error #31" you hit sending the Monthly Report — need
  to know whether you were running `npm run dev` or a production build, and
  the full terminal output at the moment it crashed.
- The user you added directly via the SQL editor not showing up in `users`
  or on the platform — need to see the exact SQL you ran.
