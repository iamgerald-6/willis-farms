# Consultant grade & HR approval

## Consultant grade (System Definitions → Grade levels)

- Built-in **`consultant`** grade has **no L-rank** (`roleKind: consultant`).
- Used for part-time HR and similar roles.
- Appears in grade pickers, job posting interview keys, and Section O.
- Additional consultant grades can be added in System Definitions (slug id, e.g. `hr_consultant`).

## HR onboarding approval (consultant users)

| Logged-in user | Action |
|----------------|--------|
| **Head consultant** (consultant grade, no supervisor) | Save Section O → checkbox “I, [name], approve…” → **Approve & invite to WillsOne** |
| **Subordinate consultant** (has `supervisor_id`) | Save Section O → HR notes → **Submit for supervisor approval** (emails supervisor) |
| **Assigned supervisor** | Checkbox + **Approve & invite** on the same onboarding detail |
| **Admin / manager** (non-consultant) | Existing flow: submit → senior HR inbox → approve |

Stored on `onboarding_submissions.hr_data`:

- `hr_review_mode`: `"consultant"` | `"senior_hr"`
- `hr_approval_supervisor_id`: supervisor `user_id` (consultant flow)
- `hr_review_submitted_at`, `hr_reviewed_by`, `hr_approved_at`, `approved_by`

## User invite (Add User modal)

- **Username** = company email (editable, **Regenerate** uses Section O format: `{firstInitial}.{middleInitial?}{lastName}@domain`).
- **Invite delivery** goes to the candidate’s personal / application email.
- Duplicate usernames are flagged before send.

## Consultant program exclusions

Consultant-grade users are **not subjects** of appraisal, skill log, or promotion programs (they are not ranked employees).

- **Sidebar / routes** — appraisal, skill log, promotion, and justifications stay available when permissions allow.
- **Self-service forms** — consultants cannot start self-appraisal, receive skill logs, or appear in promotion pending queues.
- **Supervisor fills** — ranked supervisors cannot create appraisals or skill logs **for** consultant-grade users.
- **View / review / approve** — unchanged; governed by existing page permissions (e.g. review, approve on skill logs; read appraisal lists).
- **Overview dashboard** — hides self-appraisal KPIs for consultants and shows a short notice; leave and other tools remain available.

## Job application

- Passport verification checks **name, DOB, gender, nationality** (not passport number — filled from bio photo).
- Institution type dropdown reads **System Definitions → careers.institutionTypes**.
- Field types renamed: `work_fields`, `education_fields` (legacy `work_history` / `education_history` still supported).
- Within each form step, **file uploads render last** regardless of sort order.

## SQL to run (Supabase)

See `docs/system-definitions/consultant_grade_migration.sql` (includes `users.grade_level` constraint drop).

For the grade constraint only, run `docs/access-control/users-grade-level-check.sql`.
