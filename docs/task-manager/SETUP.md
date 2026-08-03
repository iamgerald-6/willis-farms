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

(none currently — see round 4 below for the Monthly Report fix)

## Update — round 4 (Monthly Report crash fixed, calendar/pill fixes)

- **Monthly Report "Minified React error #31"** is fixed. Root cause: a
  currently-unresolved upstream bug where `@react-pdf/renderer`'s
  `renderToBuffer()` crashes specifically inside Next's App Router request
  handling (confirmed with a side-by-side test — same code, same data,
  worked from a Pages Router route and a plain Node script, failed
  identically from App Router regardless of bundler, react-pdf version, or
  Strict Mode). The send route now lives at
  `src/pages/api/task-manager/reports/send.tsx` (Pages Router) instead of
  under `src/app/api/...` — same URL, so nothing else changed. No SQL, no
  new env vars, just pull and restart `npm run dev`.
- **Project pill "N overdue" count** could disagree with what the task
  list actually showed (e.g. "1 overdue" with no overdue task visible) —
  it used a raw date comparison instead of the same status logic as the
  task badges. Fixed to use the same calculation everywhere.
- **Compliance Calendar** now spans every project at once (color-coded,
  with a legend) instead of showing one project at a time, and moved out
  of the tab bar into its own "Calendar" button next to "Monthly Report."
  Clicking a day (including "+N more") opens the full list of that day's
  tasks — no more unreadable truncated text.

## Update — round 5 (scheduled monthly report + deadline reminders)

**Run this SQL once** (adds three new tables and loosens one existing
column):

```
docs/task-manager/automation.sql
```

**New env var** — set this in Vercel (Project Settings → Environment
Variables), not `.env.local`:

```
CRON_SECRET=<any long random string>
```

Setting a variable with exactly this name is what makes Vercel Cron send
`Authorization: Bearer $CRON_SECRET` on every cron request, which is how
`/api/task-manager/cron/daily` tells a real cron trigger apart from a
random request. Locally, with no `CRON_SECRET` set, that check is skipped
so you can hit the route by hand while testing:

```
curl -X POST http://localhost:3000/api/task-manager/cron/daily
```

**What's new:**

- A new **Automation** button next to Monthly Report (Senior Management
  only) opens two settings sections:
  - **Automatic monthly report** — toggle on, pick a day of the month,
    list recipients. When on, the *previous* calendar month's report gets
    generated and emailed automatically — no more remembering to click
    Generate & Send.
  - **Deadline reminders** — toggle on, set how many days before a
    deadline the heads-up goes out (defaults to 5, matching what you
    asked for). Each task's owner gets one email when their task crosses
    that day-count, then a fresh email every day at 9am for as long as
    the task stays overdue. Multiple tasks for the same owner are
    combined into one email, not one per task.
- Both run off a single Vercel Cron job (`vercel.json`) that fires once a
  day at 9am UTC. Wills Farms is in Ghana, which is UTC+0 year-round, so
  that's genuinely 9am local — no timezone conversion needed, and nothing
  to adjust for daylight saving (Ghana doesn't observe it).
- The report-sending code itself didn't change — I pulled the existing
  logic out of `send.tsx` into a shared function
  (`src/lib/reports/sendMonthlyReport.tsx`) so the manual "Generate & Send"
  button and the new automatic scheduler call the exact same code path,
  instead of two copies that could drift apart.

**Important caveat — this reuses the same Resend account as everything
else email-related.** Until a domain is verified at resend.com/domains,
Resend's sandbox restriction applies here too: automatic monthly reports
and reminder emails will only actually deliver to your own address
(`amoafosheila@outlook.com`), the same restriction you hit with the invite
emails. The schedule/reminders will run and log correctly either way —
it's only the *delivery* to anyone else that's blocked until that domain
gets verified (needs the Hostinger DNS access you mentioned you don't
currently have).

## Update — round 6 (recurring tasks auto-renew, reminder fixes, test button)

**Run this SQL once:**

```
docs/task-manager/automation.sql   -- re-run if you already ran it once —
                                    -- adds cc_recipients, safe to repeat
docs/task-manager/recurrence.sql   -- new
```

If you still see "Could not find the 'cc_recipients' column" after
re-running `automation.sql`, also run:

```sql
NOTIFY pgrst, 'reload schema';
```

**Recurring tasks now actually recur.** Marking a recurring task (
`is_recurring = true`, with a `frequency` like "Quarterly" or "Annual")
complete — either via the Complete button or by dragging progress to
100% — no longer closes it out. Instead, the same task jumps forward to
its next due date and goes back to active with progress reset to 0, ready
for the next cycle. This is based on the `frequency` text field, which is
free text (not a fixed dropdown), so it's parsed loosely: "daily",
"weekly", "fortnightly"/"biweekly", "monthly", "bimonthly", "quarterly",
"semi-annual"/"biannual", "annual"/"yearly", "biennial", and "every N
days/weeks/months/years" are all recognized. If the text doesn't match
any of those, the task completes normally instead of guessing at a
schedule — worth keeping frequency text close to one of those words.
The next due date is calculated from the *original* due date, not from
whenever it actually got marked complete, so a task due every January 1st
stays due every January 1st even if one year it's completed late.
Each cycle's completion is still recorded (in a new `tm_task_completions`
table) so the Monthly Report's completed counts and completed-tasks Gantt
still include recurring tasks for the period they were actually completed
in, even though the task itself doesn't stay "completed."

**Reminder fixes from testing:**

- The "coming up soon" reminder now fires for any task within the warning
  window (e.g. 1 or 2 days out, not just exactly on the configured day) —
  it was previously checking for an exact match, which silently skipped
  most tasks.
- Headings in the reminder email are now "Tasks coming up soon" and
  "Tasks overdue".
- Default warning window changed from 5 to 14 days for new installs —
  if you already have a settings row, update it via the Automation panel
  (Days before deadline to warn → 14 → Save).
- Added an optional "Also notify" field under Deadline Reminders — leave
  blank for the default (owner-only) behavior, or add backup addresses to
  cc every reminder.
- Added a **"Send test now"** button under Deadline Reminders — runs the
  same check the 9am cron runs, on demand, so you don't have to wait for
  the clock to test. It's a real send (not a preview): whatever it sends
  gets logged the same way, so the actual 9am run won't re-send the same
  thing later that day. For repeat testing without waiting a day, this
  resets the test history:

```sql
delete from tm_reminder_log;
```

## Update — round 7 (reminders are now a weekly Monday digest)

No new SQL for this round.

Changed how deadline reminders work based on testing feedback: instead of
a daily check that emailed each task once as it crossed into the warning
window (then stayed quiet), reminders are now a **weekly digest, sent
every Monday at 9am**. Each owner gets one email listing everything
currently overdue and everything due within the configured window (still
"Days ahead to include as 'coming up soon'" in the Automation panel —
default 14), recalculated fresh each week.

This is simpler than the old version and there's nothing to reset anymore
— since it's just "what does this look like right now," running "Send
test now" doesn't consume/mark anything, so `delete from
tm_reminder_log;` above is no longer needed for repeat testing (that table
is now unused — harmless to leave in place). The underlying cron job still
runs every day, not just Mondays — that's needed for the monthly report's
day-of-month check, which is unrelated and unaffected. Reminders just
quietly skip themselves on the other six days.

## Update — round 8 (task visibility bug + new per-user permission)

**Run this SQL before doing anything else this round** — nearly every
Task Manager screen and API call reads the new column this adds, so
skipping it will break the whole section, not just this feature:

```
docs/task-manager/permissions.sql
```

**The bug:** an employee-role account was seeing everyone's tasks, not
just their own. Root cause was React Query's cache, not the permission
check — the server was already correctly scoping tasks by owner, but the
browser's client-side cache is one long-lived object shared across the
whole app, and it was never cleared when you logged out and back in as a
different user in the same tab. So the previous user's already-fetched
task data could still be sitting in the cache and get shown to whoever
logged in next, before (or even instead of) the fresh, correctly-scoped
data loaded. Fixed by clearing the entire cache on every sign-in and
sign-out (`src/components/QueryProvider.tsx`) — each login now always
starts from a clean slate.

**The new permission:** you asked for task visibility to be
permission-based rather than automatic for a whole role tier. There's now
a `tm_can_view_all_tasks` toggle per user, managed from the **Users**
page (new "Sees all tasks" column/checkbox). Behavior:

- **Super admin** always sees everything — hardcoded, not affected by the
  toggle.
- **Everyone else — including Admin and Manager** — only sees their own
  tasks by default now, *unless* this toggle is turned on for them.
- To avoid breaking anyone currently relying on full visibility, the
  migration backfills the toggle to "on" for every existing admin/manager/
  super_admin account. From that point on it's just a normal switch you
  can flip either way per person — revoke it from an admin who shouldn't
  have it, or grant it to an employee who needs broader visibility without
  making them an admin.
- This only changes what someone can **see** in the task lists/dashboard.
  Who can create/edit/archive/delete tasks or send reports is unchanged —
  that's still tied to the Admin/Manager/Super Admin role, same as before.
