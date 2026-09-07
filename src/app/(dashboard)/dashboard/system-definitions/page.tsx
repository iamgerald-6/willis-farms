"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  History,
  Layers,
  ListChecks,
  Rows3,
  Settings2,
  Tag,
  ToggleRight,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import type { PagePermissionKey } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import {
  MODULE_GROUPS,
  getModuleGroupForModule,
  getModuleRegistrySync,
  resolveNavIcon,
} from "@/lib/moduleRegistry";
import type {
  ListFilterDef,
  ModuleRecord,
  PermissionAction,
} from "@/lib/moduleRegistry";
import {
  isEditableApplicationFormModule,
  isEditableOnboardingFormModule,
  isEditableCompetencySectionModule,
  isEditableLeavePolicyModule,
  isEditableRatingSectionModule,
  isEditableRefereeReferenceModule,
  isEditableOptionList,
  registryRefToOptionList,
} from "@/lib/systemDefinitions";
import OptionsEditor from "./components/OptionsEditor";
import AppraisalGradeTemplatesManager from "./components/AppraisalGradeTemplatesManager";
import LeavePolicyEditor from "./components/LeavePolicyEditor";
import CompanyEmailDomainEditor from "./components/CompanyEmailDomainEditor";
import CompetencySectionsEditor from "./components/CompetencySectionsEditor";
import ApplicationFormEditor from "./components/ApplicationFormEditor";
import OnboardingFormEditor from "./components/OnboardingFormEditor";
import OnboardingHrFieldsEditor from "./components/OnboardingHrFieldsEditor";
import GradeLevelsEditor from "./components/GradeLevelsEditor";
import RefereeReferenceEditor from "./components/RefereeReferenceEditor";
import AuditLogPanel from "./components/AuditLogPanel";
import {
  ONBOARDING_DEPARTMENTS_L1L6_LIST,
  ONBOARDING_DEPARTMENTS_L7_LIST,
  ONBOARDING_LOCATIONS_LIST,
  ONBOARDING_MEDICAL_REPORTS_LIST,
} from "@/lib/systemDefinitions/onboardingDefaults";
import { ONBOARDING_EMPLOYMENT_TYPES_LIST } from "@/lib/systemDefinitions/onboardingHrDefaults";

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "Can view",
  add: "Can add",
  edit: "Can edit",
  approve: "Can approve",
  review: "Can review",
};

const ACTION_COLORS: Record<PermissionAction, string> = {
  view: "bg-gray-100 text-gray-600 border border-gray-200",
  add: "bg-blue-50 text-blue-700 border border-blue-200",
  edit: "bg-purple-50 text-purple-700 border border-purple-200",
  approve: "bg-green-50 text-green-700 border border-green-200",
  review: "bg-amber-50 text-amber-700 border border-amber-200",
};

/** Turns an internal key like "taxonomy.appraisal.sectionsForGradeBand" or
 * "current_grade" into plain words, e.g. "Sections For Grade Band". */
function humanizeKey(key: string): string {
  const lastPart = key.split(".").pop() ?? key;
  const spaced = lastPart
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ");
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

function filterLabel(f: ListFilterDef): string {
  if (f.type === "search") return "Search box";
  if (f.optionsRef) return humanizeKey(f.optionsRef);
  if (f.field) return humanizeKey(f.field);
  return humanizeKey(f.id);
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Layers;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-start gap-2.5">
        <Icon className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {description && (
            <p className="text-xs text-gray-400 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-gray-400 italic py-2 text-center">
      {children}
    </p>
  );
}

/**
 * Shared collapsible sidebar section — one heading you can expand/collapse,
 * revealing indented children underneath. Used for both Organizational
 * structure (children are real routed Links) and any module-registry group
 * rolled into COLLAPSIBLE_GROUP_IDS_IN_SYSTEM_DEFINITIONS below (children
 * are in-page module-select buttons) — same look and interaction either
 * way, so the two stop being visually inconsistent with each other.
 */
function CollapsibleNavSection({
  icon: Icon,
  label,
  active,
  open,
  onToggle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const expanded = open || active;
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all text-left ${
          active
            ? "bg-red-600 text-white shadow-sm"
            : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        <Icon
          className={`w-4 h-4 shrink-0 ${
            active ? "text-white" : "text-gray-400"
          }`}
        />
        <span className="flex-1 text-left truncate">{label}</span>
        {expanded ? (
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 ${
              active ? "text-white/70" : "text-gray-400"
            }`}
          />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-400" />
        )}
      </button>
      {expanded && (
        <div className="mt-1 ml-3 pl-3 border-l-2 border-gray-100 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

type ModuleSection = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  render: () => React.ReactNode;
};

/**
 * Every section a module's detail view can show, in display order. Used
 * two ways: ModuleDetail concatenates all of them (the whole-page view,
 * still used for modules in a non-collapsible group), and — for modules in
 * a COLLAPSIBLE_GROUP_IDS_IN_SYSTEM_DEFINITIONS group — the sidebar lists
 * these as a second-level sub-nav, and ModuleSectionDetail renders just the
 * one picked.
 */
/** Modules whose System Definitions detail intentionally has no Overview
 * section — e.g. Appraisal, where the generic Overview panels (dropdown
 * options, how records are shown, what can be done here) don't add anything
 * beyond its own dedicated sections (Appraisal scope, Rating sections, ...). */
const HIDE_OVERVIEW_SECTION_MODULE_IDS = new Set(["mod:appraisal"]);

function getModuleSections(
  m: ModuleRecord,
  canAdd: boolean,
  canEdit: boolean,
): ModuleSection[] {
  const sections: ModuleSection[] = [];
  const Icon = resolveNavIcon(m.sidebar.icon);
  const group = getModuleGroupForModule(m);

  // Overview bundles the module's basic info together with the three
  // "standard" panels every module has — Dropdown options & categories,
  // How records are shown, and What can be done here — rather than giving
  // each its own sub-nav entry, since none of them are substantial enough
  // on their own to warrant a separate click.
  if (!HIDE_OVERVIEW_SECTION_MODULE_IDS.has(m.id)) {
    sections.push({
    key: "overview",
    label: "Overview",
    icon: Icon,
    render: () => (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-red-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">{m.label}</h2>
                {!m.enabled && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                    Turned off
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Part of: {group?.label ?? "General"}
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-3 mb-1.5">
            What people can do here:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {m.supportedActions.map((a) => (
              <span
                key={a}
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[a]}`}
              >
                {ACTION_LABELS[a]}
              </span>
            ))}
          </div>
        </div>

        <SectionCard
          icon={Tag}
          title="Dropdown options & categories"
          description="The preset choices people can pick from in this section's forms and filters."
        >
          {(() => {
            const editableRefs = (m.taxonomyRefs ?? []).filter((ref) =>
              isEditableOptionList(m.id, registryRefToOptionList(ref)),
            );
            if (editableRefs.length === 0) {
              return (
                <EmptyRow>
                  No editable dropdown lists for this section yet.
                </EmptyRow>
              );
            }
            return (
              <div className="space-y-4">
                {editableRefs.map((ref) => {
                  const optionList = registryRefToOptionList(ref);
                  return (
                    <OptionsEditor
                      key={ref}
                      moduleId={m.id}
                      optionList={optionList}
                      title={humanizeKey(ref)}
                      canAdd={canAdd}
                      canEdit={canEdit}
                    />
                  );
                })}
              </div>
            );
          })()}
        </SectionCard>

        <SectionCard
          icon={ListChecks}
          title="How records are shown"
          description="What people see when they browse the list for this section."
        >
          {m.listView ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Shown as:{" "}
                <span className="font-medium text-gray-700">
                  {m.listView.type === "table" ? "a table" : "a grid of cards"}
                </span>
                {m.listView.mobileFallback && (
                  <> · On phones: cards</>
                )}
              </p>
              {m.listView.columns && m.listView.columns.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">
                    Columns shown:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.listView.columns
                      .filter((c) => c.label)
                      .map((c) => (
                        <span
                          key={c.id}
                          className="px-2.5 py-1 rounded-lg text-xs bg-gray-50 text-gray-600 border border-gray-200"
                        >
                          {c.label}
                        </span>
                      ))}
                  </div>
                </div>
              )}
              {m.listView.filters && m.listView.filters.length > 0 && (
                <p className="text-xs text-gray-400">
                  Ways to narrow the list:{" "}
                  {m.listView.filters.map(filterLabel).join(", ")}
                </p>
              )}
            </div>
          ) : (
            <EmptyRow>No list display set up for this section.</EmptyRow>
          )}
        </SectionCard>

        <SectionCard
          icon={ToggleRight}
          title="What can be done here"
          description="Each action and the permission someone needs to use it."
        >
          {m.features && m.features.length > 0 ? (
            <ul className="space-y-1.5">
              {m.features.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-gray-700">{f.label}</span>
                  <span className="text-gray-400">
                    {Object.keys(f.requires)
                      .map((k) => ACTION_LABELS[k as PermissionAction])
                      .join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyRow>No specific actions listed for this section.</EmptyRow>
          )}
        </SectionCard>
      </div>
    ),
    });
  }

  if (isEditableLeavePolicyModule(m.id)) {
    sections.push({
      key: "leave-policy",
      label: "Leave policy",
      icon: Settings2,
      render: () => (
        <SectionCard
          icon={Settings2}
          title="Leave policy"
          description="Annual leave allowance and other leave rules for all staff."
        >
          <LeavePolicyEditor moduleId={m.id} readOnly={!canEdit} />
        </SectionCard>
      ),
    });
  }

  if (isEditableApplicationFormModule(m.id)) {
    sections.push({
      key: "application-form",
      label: "Job application form",
      icon: Rows3,
      render: () => (
        <SectionCard
          icon={Rows3}
          title="Job application form"
          description="Fields shown on the public multi-step job application — including referee contact fields. Add, edit, or remove fields and steps."
        >
          <ApplicationFormEditor
            moduleId={m.id}
            canAdd={canAdd}
            canEdit={canEdit}
          />
        </SectionCard>
      ),
    });
  }

  if (isEditableRefereeReferenceModule(m.id)) {
    sections.push({
      key: "referee-reference",
      label: "Referee reference form",
      icon: Rows3,
      render: () => (
        <SectionCard
          icon={Rows3}
          title="Referee reference form"
          description="Rating lines on the public link referees receive after an application is submitted."
        >
          <RefereeReferenceEditor
            moduleId={m.id}
            readOnly={!canEdit}
            canAdd={canAdd}
            canEdit={canEdit}
          />
        </SectionCard>
      ),
    });
  }

  if (isEditableOnboardingFormModule(m.id)) {
    sections.push({
      key: "onboarding-form",
      label: "Employee onboarding form",
      icon: Rows3,
      render: () => (
        <SectionCard
          icon={Rows3}
          title="Employee onboarding form"
          description="Fields on the post-hire onboarding link sent to candidates. Add inputs, set type (text, select, phone, date, etc.), and conditional visibility."
        >
          <OnboardingFormEditor
            moduleId={m.id}
            canAdd={canAdd}
            canEdit={canEdit}
          />
        </SectionCard>
      ),
    });

    sections.push({
      key: "onboarding-hr-fields",
      label: "HR onboarding — Section O",
      icon: Rows3,
      render: () => (
        <SectionCard
          icon={Rows3}
          title="HR onboarding — Section O"
          description="HR-only fields on the recruitment onboarding tab (not shown to candidates). Configure placement, employee ID, grade, and notes."
        >
          <OnboardingHrFieldsEditor
            moduleId={m.id}
            canAdd={canAdd}
            canEdit={canEdit}
          />
        </SectionCard>
      ),
    });

    sections.push({
      key: "onboarding-dropdowns",
      label: "HR onboarding dropdown lists",
      icon: Tag,
      render: () => (
        <SectionCard
          icon={Tag}
          title="HR onboarding dropdown lists"
          description="Work locations, departments, and employment types used in HR Section O."
        >
          <div className="space-y-4">
            <OptionsEditor
              moduleId={m.id}
              optionList={ONBOARDING_LOCATIONS_LIST}
              title="Work locations"
              canAdd={canAdd}
              canEdit={canEdit}
            />
            <OptionsEditor
              moduleId={m.id}
              optionList={ONBOARDING_DEPARTMENTS_L1L6_LIST}
              title="Departments (L1–L6 and junior grades)"
              canAdd={canAdd}
              canEdit={canEdit}
            />
            <OptionsEditor
              moduleId={m.id}
              optionList={ONBOARDING_DEPARTMENTS_L7_LIST}
              title="Departments (L7+ senior grades)"
              canAdd={canAdd}
              canEdit={canEdit}
            />
            <OptionsEditor
              moduleId={m.id}
              optionList={ONBOARDING_EMPLOYMENT_TYPES_LIST}
              title="Employment types"
              canAdd={canAdd}
              canEdit={canEdit}
            />
            <OptionsEditor
              moduleId={m.id}
              optionList={ONBOARDING_MEDICAL_REPORTS_LIST}
              title="Required medical reports"
              description="Shown on the onboarding medical step and in the congratulations / onboarding email."
              canAdd={canAdd}
              canEdit={canEdit}
            />
          </div>
        </SectionCard>
      ),
    });

    sections.push({
      key: "company-email-domain",
      label: "Company email domain",
      icon: Settings2,
      render: () => (
        <SectionCard
          icon={Settings2}
          title="Company email domain"
          description="Domain for HR-assigned company emails in Section O (e.g. willsfarms.com)."
        >
          <CompanyEmailDomainEditor moduleId={m.id} readOnly={!canEdit} />
        </SectionCard>
      ),
    });

    sections.push({
      key: "grade-levels",
      label: "Grade levels & linked roles",
      icon: Settings2,
      render: () => (
        <SectionCard
          icon={Settings2}
          title="Grade levels & linked roles"
          description="L1–L7 are built in. Add L8 or higher with a job posting role (e.g. L1 → Junior Swine Technician)."
        >
          <GradeLevelsEditor moduleId={m.id} canAdd={canAdd} canEdit={canEdit} />
        </SectionCard>
      ),
    });
  }

  if (isEditableCompetencySectionModule(m.id)) {
    sections.push({
      key: "competency-sections",
      label: "Competency sections",
      icon: Rows3,
      render: () => (
        <SectionCard
          icon={Rows3}
          title="Competency sections"
          description="Section titles and skill lines for each skills log type. Pick the type first — sections you add belong to that type only."
        >
          <CompetencySectionsEditor
            moduleId={m.id}
            readOnly={!canEdit}
            canAdd={canAdd}
            canEdit={canEdit}
          />
        </SectionCard>
      ),
    });
  }

  // Appraisal scope, Rating sections, Rating section weights, and Extra
  // rules by grade are four related pieces of the same appraisal-form
  // configuration — combined into one "Appraisal scope" sub-nav entry
  // rather than four separate clicks, each still gated by its own
  // isEditable*Module check exactly as before.
  if (isEditableRatingSectionModule(m.id)) {
    sections.push({
      key: "appraisal-scope",
      label: "Appraisal scope",
      icon: Settings2,
      render: () => (
        <SectionCard
          icon={Settings2}
          title="Appraisal scope"
          description="Build the appraisal question set for an exact Site/Business unit/Department/Section/Position/Grade level combination — matched against each employee's own org placement."
        >
          <AppraisalGradeTemplatesManager
            moduleId={m.id}
            canAdd={canAdd}
            canEdit={canEdit}
          />
        </SectionCard>
      ),
    });
  }

  return sections;
}

/** Whole-page view — every section for this module, concatenated. Still
 * used for modules in a non-collapsible group (General, Operations,
 * System); collapsible-group modules use ModuleSectionDetail instead, one
 * section at a time, picked from the sidebar's sub-nav. */
function ModuleDetail({
  module: m,
  canAdd,
  canEdit,
}: {
  module: ModuleRecord;
  canAdd: boolean;
  canEdit: boolean;
}) {
  const sections = useMemo(
    () => getModuleSections(m, canAdd, canEdit),
    [m, canAdd, canEdit],
  );
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <div key={s.key}>{s.render()}</div>
      ))}
    </div>
  );
}

/** Renders just one of a module's sections — the collapsible-group
 * counterpart to ModuleDetail above. */
function ModuleSectionDetail({
  module: m,
  sectionKey,
  canAdd,
  canEdit,
}: {
  module: ModuleRecord;
  sectionKey: string;
  canAdd: boolean;
  canEdit: boolean;
}) {
  const sections = useMemo(
    () => getModuleSections(m, canAdd, canEdit),
    [m, canAdd, canEdit],
  );
  const section = sections.find((s) => s.key === sectionKey) ?? sections[0];
  if (!section) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
        Nothing to show yet.
      </div>
    );
  }
  return <div className="space-y-4">{section.render()}</div>;
}

const AUDIT_LOG_ID = "__audit_log__";

/** Not configurable here — hide from the System Definitions module picker. */
const HIDDEN_SYSTEM_DEFINITIONS_MODULE_IDS = new Set([
  "mod:overview",
  "mod:notifications",
  "mod:system-definitions",
]);

/** Organizational structure isn't a module-registry group (its two links are
 * real routed pages, not in-page module selectors), so it needs its own key
 * for the shared open/closed state below. */
const ORG_STRUCTURE_SECTION_ID = "sys-def:organizational-structure";

/**
 * Which module-registry groups render as a collapsible section here (same
 * look as Organizational structure) instead of the old flat list every
 * group used to render as. Rolling this out one group at a time — add a
 * group's id here when it's ready, no other code changes needed.
 *
 * This is intentionally separate from that group's own `sidebar.mode` in
 * moduleRegistry/groups.ts, which drives the real app sidebar (a different
 * surface, already collapsible there for some groups) — conflating the two
 * would flip groups over here before they're actually ready.
 */
const COLLAPSIBLE_GROUP_IDS_IN_SYSTEM_DEFINITIONS = new Set<string>([
  "grp:human-capital",
]);

/** Stable module id for Recruitment — used to append the Create job posting
 * link into its sub-nav (see the sidebar render below). Never changes even
 * if the module's label is renamed. */
const RECRUITMENT_MODULE_ID = "mod:recruitment";

export default function SystemDefinitionsPage() {
  const pathname = usePathname();
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  // Only meaningful when the selected module belongs to a collapsible group
  // (see COLLAPSIBLE_GROUP_IDS_IN_SYSTEM_DEFINITIONS) — which of that
  // module's own sections (Job application form, Interview, ...) is picked.
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);
  const [openSectionIds, setOpenSectionIds] = useState<Set<string>>(new Set());
  const toggleSectionOpen = (id: string) =>
    setOpenSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const orgStructureActive = !!pathname?.startsWith(
    "/dashboard/system-definitions/organizational-structure",
  );
  const createJobPostingActive = !!pathname?.startsWith(
    "/dashboard/system-definitions/create-job-posting",
  );
  const accessControlActive = !!pathname?.startsWith(
    "/dashboard/system-definitions/access-control",
  );
  const setupActive = orgStructureActive;

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const profile = users?.find((u) => u.user_id === session?.user?.id);
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const accessProfile = resolveAccessProfile(profile, sessionRole);
  const { data: groupPresetData } = useGroupPresets();
  const groupPresets = groupPresetData?.presets;
  const canView =
    accessProfile &&
    canPerformModuleAction(
      accessProfile,
      "sys:definitions",
      "view",
      sessionRole,
      groupPresets,
    );
  const canEdit =
    accessProfile &&
    canPerformModuleAction(
      accessProfile,
      "sys:definitions",
      "edit",
      sessionRole,
      groupPresets,
    );
  const canAdd =
    accessProfile &&
    canPerformModuleAction(
      accessProfile,
      "sys:definitions",
      "add",
      sessionRole,
      groupPresets,
    );

  const modules = useMemo(() => getModuleRegistrySync(), []);
  const groupedModules = useMemo(() => {
    return [...MODULE_GROUPS]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((group) => ({
        group,
        modules: modules
          .filter((m) => m.groupId === group.id)
          .filter((m) => !HIDDEN_SYSTEM_DEFINITIONS_MODULE_IDS.has(m.id))
          .filter((m) => {
            // A module's own config section shouldn't appear here unless the
            // viewer actually has view access to that module elsewhere in
            // the app (mirrors how the main Sidebar hides items via legacyKey).
            if (!m.legacyKey) return true;
            if (!accessProfile) return false;
            return canPerformModuleAction(
              accessProfile,
              m.legacyKey as PagePermissionKey,
              "view",
              sessionRole,
              groupPresets,
            );
          })
          .sort((a, b) => a.sortOrder - b.sortOrder),
      }))
      .filter((g) => g.modules.length > 0);
  }, [modules, accessProfile, sessionRole, groupPresets]);

  const showAuditLog = selectedModuleId === AUDIT_LOG_ID;

  const selectedModule = useMemo(() => {
    if (selectedModuleId && selectedModuleId !== AUDIT_LOG_ID) {
      return modules.find((m) => m.id === selectedModuleId) ?? null;
    }
    if (selectedModuleId === AUDIT_LOG_ID) return null;
    return groupedModules[0]?.modules[0] ?? null;
  }, [modules, groupedModules, selectedModuleId]);

  const selectedModuleIsSectioned = !!(
    selectedModule &&
    COLLAPSIBLE_GROUP_IDS_IN_SYSTEM_DEFINITIONS.has(
      getModuleGroupForModule(selectedModule)?.id ?? "",
    )
  );

  if (sessionLoading || usersLoading) {
    return (
      <div className="p-4 md:p-6 bg-gray-50 min-h-full">
        <div className="h-8 w-56 bg-gray-100 rounded animate-pulse mb-2" />
        <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 text-sm">
            System Definitions view access is required to open this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-red-600" />
          System Definitions
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage dropdown options, rating sections, weights, and review how
          each section is set up. Leave, Appraisal, and Skill Logs can be
          edited here.
        </p>
        {!canEdit && !canAdd && (
          <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            View only — add or edit access is required to change settings here.
          </p>
        )}
        {canAdd && !canEdit && (
          <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Add only — you can create new options and rules, but not edit
            existing records or save policy/weight changes.
          </p>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-start">
        {/* Module list */}
        <div className="w-full md:w-64 shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden md:sticky md:top-24">
          <nav className="max-h-[70vh] overflow-y-auto p-2 space-y-3">
            <div>
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedModuleId(AUDIT_LOG_ID)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                    showAuditLog
                      ? "bg-red-600 text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <History
                    className={`w-4 h-4 shrink-0 ${
                      showAuditLog ? "text-white" : "text-gray-400"
                    }`}
                  />
                  <span className="truncate">Audit log</span>
                </button>
                <CollapsibleNavSection
                  icon={Building2}
                  label="Organizational structure"
                  active={orgStructureActive}
                  open={openSectionIds.has(ORG_STRUCTURE_SECTION_ID)}
                  onToggle={() => toggleSectionOpen(ORG_STRUCTURE_SECTION_ID)}
                >
                  <Link
                    href="/dashboard/system-definitions/organizational-structure"
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      setupActive
                        ? "bg-red-50 text-red-600"
                        : "text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                    }`}
                  >
                    Organizational structure set up
                  </Link>
                </CollapsibleNavSection>
              </div>
              <div className="border-t border-gray-100 my-2" />
            </div>
            {groupedModules.map(({ group, modules: groupModules }) => {
              const isCollapsible = COLLAPSIBLE_GROUP_IDS_IN_SYSTEM_DEFINITIONS.has(
                group.id,
              );
              const groupActive = groupModules.some(
                (m) => m.id === selectedModule?.id,
              );

              if (isCollapsible) {
                const GroupIcon = resolveNavIcon(group.sidebar?.icon ?? "user-check");
                return (
                  <div key={group.id}>
                    <CollapsibleNavSection
                      icon={GroupIcon}
                      label={group.label}
                      active={groupActive}
                      open={openSectionIds.has(group.id)}
                      onToggle={() => toggleSectionOpen(group.id)}
                    >
                      {groupModules.map((m) => {
                        const ModuleIcon = resolveNavIcon(m.sidebar.icon);
                        const moduleActive =
                          selectedModule?.id === m.id ||
                          (m.id === RECRUITMENT_MODULE_ID && createJobPostingActive);
                        const moduleSections = getModuleSections(
                          m,
                          !!canAdd,
                          !!canEdit,
                        );
                        return (
                          <CollapsibleNavSection
                            key={m.id}
                            icon={ModuleIcon}
                            label={m.label}
                            active={moduleActive}
                            open={openSectionIds.has(m.id)}
                            onToggle={() => toggleSectionOpen(m.id)}
                          >
                            {moduleSections.map((s) => {
                              const sectionActive =
                                moduleActive && selectedSectionKey === s.key;
                              return (
                                <button
                                  key={s.key}
                                  type="button"
                                  onClick={() => {
                                    setSelectedModuleId(m.id);
                                    setSelectedSectionKey(s.key);
                                  }}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-left ${
                                    sectionActive
                                      ? "bg-red-50 text-red-600"
                                      : "text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                                  }`}
                                >
                                  <span className="truncate">{s.label}</span>
                                </button>
                              );
                            })}
                            {/* Create job posting is a full separate page
                                (its own table/form/tabs), not an inline
                                section like the others above — so it's a
                                real link here rather than a section-select
                                button. */}
                            {m.id === RECRUITMENT_MODULE_ID && (
                              <Link
                                href="/dashboard/system-definitions/create-job-posting"
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                  createJobPostingActive
                                    ? "bg-red-50 text-red-600"
                                    : "text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                                }`}
                              >
                                Create job posting
                              </Link>
                            )}
                          </CollapsibleNavSection>
                        );
                      })}
                    </CollapsibleNavSection>
                  </div>
                );
              }

              return (
                <div key={group.id}>
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {groupModules.map((m) => {
                      const Icon = resolveNavIcon(m.sidebar.icon);
                      const active = selectedModule?.id === m.id;

                      // User Management gets one empty placeholder submenu,
                      // "Access control" — not wired to anything yet, just
                      // the entry itself for now.
                      if (m.id === "mod:users") {
                        return (
                          <CollapsibleNavSection
                            key={m.id}
                            icon={Icon}
                            label={m.label}
                            active={active || accessControlActive}
                            open={openSectionIds.has(m.id)}
                            onToggle={() => toggleSectionOpen(m.id)}
                          >
                            <Link
                              href="/dashboard/system-definitions/access-control"
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                accessControlActive
                                  ? "bg-red-50 text-red-600"
                                  : "text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                              }`}
                            >
                              Access control
                            </Link>
                          </CollapsibleNavSection>
                        );
                      }

                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedModuleId(m.id)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                            active
                              ? "bg-red-600 text-white shadow-sm"
                              : "text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              active ? "text-white" : "text-gray-400"
                            }`}
                          />
                          <span className="truncate">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Detail panel */}
        <div className="flex-1 min-w-0 w-full">
          {showAuditLog ? (
            <AuditLogPanel />
          ) : selectedModule && selectedModuleIsSectioned ? (
            selectedSectionKey ? (
              <ModuleSectionDetail
                module={selectedModule}
                sectionKey={selectedSectionKey}
                canAdd={!!canAdd}
                canEdit={!!canEdit}
              />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
                Pick a section from {selectedModule.label} to view it here.
              </div>
            )
          ) : selectedModule ? (
            <ModuleDetail
              module={selectedModule}
              canAdd={!!canAdd}
              canEdit={!!canEdit}
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
              Nothing to show yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
