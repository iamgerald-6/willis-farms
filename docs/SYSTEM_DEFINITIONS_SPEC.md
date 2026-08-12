# System Definitions — Specification

**Purpose:** Define the target schema for modular, automated forms across Wills Farms modules. Option lists and field rules that the app does not track live belong here until moved to database policy tables.

**Parent doc:** [PLATFORM_AUDIT_AND_ROADMAP.md](./PLATFORM_AUDIT_AND_ROADMAP.md)

---

## 1. Principles

1. **One module, one definition** — keyed by module ID (`mod:leave`, `mod:appraisal`, …)
2. **Tracked vs designed** — values from `users`, session, or APIs use `source: "api"` or `source: "session"`; static lists use `options: "definition.*"`
3. **Forms render from definition** — React components become thin wrappers around a shared renderer
4. **Permissions are separate** — definitions describe fields/workflows; `page_permission_actions` gates who can view/add/edit/approve/review
5. **Validation in one place** — Zod schemas generated or composed from field definitions

---

## 2. Module definition shape

```ts
/** Stable ID — matches module registry in PLATFORM_AUDIT_AND_ROADMAP.md */
type ModuleId =
  | "mod:overview"
  | "mod:users"
  | "mod:leave"
  | "mod:appraisal"
  | "mod:justifications"
  | "mod:skillLog"
  | "mod:promotion"
  | "mod:recruitment"
  | "mod:sop:view"
  | "mod:sop:manage"
  | "mod:policies"
  | "mod:tm:tasks"
  | "mod:tm:calendar"
  | "mod:notifications"
  | "mod:settings"
  | "mod:onboarding";

type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "radio"
  | "checkbox"
  | "toggle"
  | "file"
  | "readOnly"
  | "computed";

type FieldSource =
  | { kind: "manual" }
  | { kind: "session"; path: string }           // e.g. "profile.email"
  | { kind: "api"; endpoint: string; map?: string }
  | { kind: "definition"; key: string }         // e.g. "leaveTypes"
  | { kind: "field"; fieldId: string };          // e.g. end_date min from start_date

interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  requiredWhen?: string;   // expression: "leave_type === 'Other'"
  visibleWhen?: string;
  disabledWhen?: string;
  source?: FieldSource;
  options?: string[] | { value: string; label: string }[];
  accept?: string[];       // file types
  min?: string | number;    // "today" or field ref
  max?: string | number;
  helpText?: string;
}

interface WorkflowState {
  id: string;
  label: string;
  terminal?: boolean;
}

interface ModuleDefinition {
  moduleId: ModuleId;
  label: string;
  table?: string;                    // primary Supabase table
  fields: FieldDef[];
  workflow?: WorkflowState[];
  /** Static option lists — "system design" until HR/policy tables exist */
  definitions?: Record<string, unknown>;
  autoFill?: Record<string, FieldSource>;
  permissions?: {
    view?: string;
    add?: string;
    edit?: string;
    approve?: string;
    review?: string;
  };
}
```

---

## 3. Example: Leave module (`mod:leave`)

This is the **first recommended migration** — smallest surface, clear hardcoded select.

```ts
export const leaveModuleDefinition: ModuleDefinition = {
  moduleId: "mod:leave",
  label: "Leave",
  table: "leave_requests",
  definitions: {
    leaveTypes: [
      "Annual",
      "Sick",
      "Emergency",
      "Maternity/Paternity",
      "Unpaid",
      "Other",
    ],
    maxAnnualDays: 30,
    workingDayCalc: "weekdays", // Mon–Fri
  },
  workflow: [
    { id: "pending", label: "Pending" },
    { id: "approved", label: "Approved", terminal: true },
    { id: "rejected", label: "Rejected", terminal: true },
  ],
  fields: [
    {
      id: "leave_type",
      label: "Leave type",
      type: "select",
      required: true,
      source: { kind: "definition", key: "leaveTypes" },
    },
    {
      id: "start_date",
      label: "Start date",
      type: "date",
      required: true,
      min: "today",
    },
    {
      id: "end_date",
      label: "End date",
      type: "date",
      required: true,
      min: { kind: "field", fieldId: "start_date" } as unknown as string,
    },
    {
      id: "reason",
      label: "Reason",
      type: "textarea",
      requiredWhen: "leave_type === 'Other'",
    },
  ],
  autoFill: {
    user_id: { kind: "session", path: "userId" },
    employee_name: { kind: "session", path: "profile.fullName" },
  },
  permissions: {
    view: "mod:leave.view",
    add: "mod:leave.add",
    approve: "mod:leave.approve",
  },
};
```

**Current implementation:** `src/app/(dashboard)/dashboard/humanCapital/leave/components/LeavePag.tsx` — `LEAVE_TYPES` constant lines 45–52.

**API:** `src/app/api/leave/` — enforce `add` on POST, `approve` on PATCH review.

---

## 4. Shared global definitions

These appear in multiple modules and should live in one shared file (e.g. `src/lib/systemDefinitions/global.ts`):

| Key | Values | Used by |
|-----|--------|---------|
| `grades` | L1–L7 + display labels | invite, skill log, appraisal, promotion |
| `roles` | employee, manager, admin (+ super_admin system) | invite, access control |
| `ratingScale` | 1–5 + labels | appraisal, skill log, recruitment |
| `quarters` | Q1–Q4 | appraisal |

---

## 5. Per-module definition files (target layout)

```
src/lib/systemDefinitions/
  index.ts              # registry: ModuleId → ModuleDefinition
  global.ts             # grades, roles, ratingScale, quarters
  modLeave.ts
  modAppraisal.ts
  modSkillLog.ts
  modPromotion.ts       # may re-export promotionFormConfigs
  modRecruitment.ts
  modSop.ts
  modPolicies.ts
  modUsers.ts
  modTaskManager.ts
```

---

## 6. Auto-populate mapping

| Field | Module | Source today | Target |
|-------|--------|--------------|--------|
| user_id | leave, appraisal | session | `session.userId` |
| employee_name | leave | session profile | `session.profile.fullName` |
| employee_email | appraisal | profile prefill | `session.email` |
| grade_band | appraisal | derived from user grade | `users.grade_level` → band map |
| employee list | appraisal, skill log | `/api/get_user` | filter by supervisor grade rules |
| supervisor candidates | appraisal | manual email | API: users where grade > employee |
| review_quarter / year | appraisal | `getActiveAppraisalPeriod()` | shared deadline service |
| owner_id | tasks | user select | `/api/get_user` |
| pending promotion employee | promotion | appraisals API | filter promotion_readiness |

---

## 7. Permission actions per module (reference)

Independent checkboxes — see [PLATFORM_AUDIT_AND_ROADMAP.md §3](./PLATFORM_AUDIT_AND_ROADMAP.md#3-new-permission-model).

When implementing enforcement:

```ts
function canPerform(
  profile: AccessProfile,
  moduleId: ModuleId,
  action: "view" | "add" | "edit" | "approve" | "review",
): boolean {
  const actions = profile.page_permission_actions?.[moduleId];
  return actions?.[action] === true;
  // Layer role/grade business rules on top where needed
}
```

**Do not** use `LEVEL_RANK` or `hasPermissionAtLeast` for the new model.

---

## 8. Migration checklist (hardcoded → definition)

| Priority | Item | From file | Definition key |
|----------|------|-----------|----------------|
| P0 | Leave types | `LeavePag.tsx` | `modLeave.definitions.leaveTypes` |
| P0 | Permission matrix | `PermissionMatrix.tsx` | `page_permission_actions` |
| P1 | Invite grades/roles | `createModal.tsx` | `global.grades`, `global.roles` |
| P1 | SOP categories | `addContentModal.tsx` | `modSop.definitions.categories` |
| P1 | Policy categories | `policies/uploadModal.tsx` | `modPolicies.definitions.categories` |
| P2 | Appraisal grade bands | `sections.ts` | `modAppraisal.definitions.gradeBands` |
| P2 | Promotion readiness | `AppraisalPage.tsx` | `modAppraisal.definitions.promotionReadiness` |
| P2 | Skill LOG_TYPES | `skillLogForms/page.tsx` | `modSkillLog.definitions.logTypes` |
| P3 | Careers openings | `openings.ts` | `modRecruitment.definitions.openings` |
| P3 | Interview configs | `interviewFormConfigs.ts` | `modRecruitment.definitions.interviews` |
| P3 | Task report day 1–28 | AutomationSettingsModal | `modTaskManager.definitions.reportDays` |

---

## 9. Form renderer (future component)

```tsx
// Pseudocode — not yet implemented
<SystemForm
  definition={leaveModuleDefinition}
  mode="create" | "edit" | "review" | "approve"
  values={initialValues}
  onSubmit={handleSubmit}
/>
```

Responsibilities:
- Render fields by `type`
- Resolve `source` (session, API, definition)
- Apply `visibleWhen` / `requiredWhen`
- Disable fields based on permission `mode`
- Emit validated payload matching API contract

---

## 10. Database evolution (optional later)

When HR wants to edit leave types without deploys:

```sql
CREATE TABLE system_option_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id text NOT NULL,
  list_key text NOT NULL,
  options jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (module_id, list_key)
);
```

Until then, TypeScript definitions in repo are the source of truth (same pattern as `promotionFormConfigs.ts` today).

---

*Companion to PLATFORM_AUDIT_AND_ROADMAP.md — August 2026.*
