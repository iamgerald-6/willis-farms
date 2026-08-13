# Module registry (Phase 1)

Built-in module definitions live here today. Same JSON shape will move to `system_modules` in Supabase when admins can add modules from Settings.

## Quick test — Leave types from registry

1. Open `/dashboard/humanCapital/leave`
2. Leave type dropdown should behave exactly as before
3. To add a type: edit `taxonomy/leave.ts`, add an option, reload — no change to `LeavePag.tsx`

## Quick test — SOP categories from registry

1. Open `/dashboard/sop` — filter pills and category badges come from `taxonomy/sop.ts`
2. Open **SOP Management** (`/dashboard/addSop`) → **Add SOP** — category/sub-category dropdowns from registry
3. To add a category: edit `taxonomy/sop.ts`, reload — no change to `addContentModal.tsx` or `sop/page.tsx`

## Quick test — Policies categories from registry

1. Open `/dashboard/policies` — category tabs, badges, and icons from `taxonomy/policies.ts`
2. **Upload Manual** — category datalist suggestions from registry (free-text still allowed)
3. To add a category: edit `taxonomy/policies.ts`, reload

## Quick test — Skill log types from registry

1. Open `/dashboard/humanCapital/skillLog` — status filters and copy from `taxonomy/skillLog.ts`
2. **Fill Skills Log** — log type dropdown and competency rows from `taxonomy/skillLogLogTypes.ts`
3. To add a log type or skills: edit taxonomy files, reload — no change to form page logic

## Quick test — Appraisal & Justifications from registry

1. Open `/dashboard/humanCapital/appraisal` — quarter filter labels from `taxonomy/appraisal.ts`
2. Fill an appraisal → promotion-readiness options come from `getPromotionReadinessOptions()`
   (previously duplicated inline in `AppraisalPage.tsx` and `finalFormReview.tsx`)
3. Open **Justifications** — status pills from `taxonomy/appraisal.ts` (`JUSTIFICATION_STATUSES`)
4. The rating-section content itself (`SECTIONS_MAP`) intentionally stays in
   `lib/appraisal/sections.ts` — it's already a well-factored, dedicated engine;
   the registry only wraps grade bands, quarters, statuses, and promotion-readiness

## Quick test — Promotion from registry

1. Open `/dashboard/humanCapital/promotion` — promotion matrix, general conditions,
   and decision badges come from `taxonomy/promotion.ts`
2. Grade-step form content (`PROMOTION_FORM_CONFIGS`) stays in `promotionFormConfigs.ts`
   as the source of truth; the registry re-exports it for the module's `formDefinition`
3. To add a decision type or matrix step: edit `taxonomy/promotion.ts`, reload — no
   change to `promotion/page.tsx` rendering logic

## API

```ts
import {
  getModuleByIdSync,
  getLeaveTypeOptions,
  buildSidebarNav,
} from "@/lib/moduleRegistry";

const leave = getModuleByIdSync("mod:leave");
const types = getLeaveTypeOptions();
const sidebar = buildSidebarNav(); // labels, routes, icons from registry
```

## Layout

```
moduleRegistry/
  types.ts              — ModuleRecord, FormDefinition, ListViewConfig, …
  groups.ts             — grp:general, grp:human-capital, …
  getRegistry.ts        — getModuleRegistry(), getModuleById()
  navigation/           — buildSidebarNav() for Sidebar.tsx
  icons.ts              — lucide icon map for nav
  builtinModules.ts     — list of shipped modules
  modules/modOverview.ts   — full mod:overview (quick actions config)
  modules/modSop.ts        — mod:sop + mod:sop-manage (browse grid + manage table)
  modules/modPolicies.ts   — mod:policies (manuals grid + admin table)
  modules/modSkillLog.ts   — mod:skill-log (competency logs)
  modules/modAppraisal.ts  — mod:appraisal + mod:justifications
  modules/modPromotion.ts  — mod:promotion
  overview/                — buildOverviewQuickActions() for dashboard
  modules/navModules.ts — all sidebar modules (stubs + migrated modules)
  taxonomy/leave.ts     — opt:leave:type:*
  taxonomy/sop.ts       — cat:sop:* categories + subcategories
  taxonomy/policies.ts  — cat:policies:* manual categories
  taxonomy/skillLog.ts  — statuses, grades, helpers
  taxonomy/skillLogLogTypes.ts — log types + competency skill lists
  taxonomy/appraisal.ts — thin wrapper over lib/appraisal/* (quarters, grade
                          bands, promotion-readiness, justification statuses)
  taxonomy/promotion.ts — promotion matrix, decisions, general conditions +
                          re-export of promotionFormConfigs.ts
```

## Next slices (not built yet)

- Permission actions (`hasModuleAction`)
- Module shell / `ModuleDataTable`
- Permission matrix checkboxes
- Leave API enforcement

See `docs/PLATFORM_AUDIT_AND_ROADMAP.md` and `docs/SYSTEM_DEFINITIONS_SPEC.md`.
