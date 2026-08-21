"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
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
  isEditableBusinessLogicModule,
  isEditableApplicationFormModule,
  isEditableOnboardingFormModule,
  isEditableJobPostingModule,
  isEditableCompetencySectionModule,
  isEditableLeavePolicyModule,
  isEditableRatingSectionModule,
  isEditableOptionList,
  registryRefToOptionList,
} from "@/lib/systemDefinitions";
import OptionsEditor from "./components/OptionsEditor";
import BusinessLogicEditor from "./components/BusinessLogicEditor";
import SectionWeightsEditor from "./components/SectionWeightsEditor";
import RatingSectionsEditor from "./components/RatingSectionsEditor";
import LeavePolicyEditor from "./components/LeavePolicyEditor";
import CompetencySectionsEditor from "./components/CompetencySectionsEditor";
import ApplicationFormEditor from "./components/ApplicationFormEditor";
import OnboardingFormEditor from "./components/OnboardingFormEditor";
import JobPostingsEditor from "./components/JobPostingsEditor";
import {
  ONBOARDING_DEPARTMENTS_L1L6_LIST,
  ONBOARDING_DEPARTMENTS_L7_LIST,
  ONBOARDING_LOCATIONS_LIST,
} from "@/lib/systemDefinitions/onboardingDefaults";

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

function ModuleDetail({
  module: m,
  canAdd,
  canEdit,
}: {
  module: ModuleRecord;
  canAdd: boolean;
  canEdit: boolean;
}) {
  const Icon = resolveNavIcon(m.sidebar.icon);
  const group = getModuleGroupForModule(m);

  return (
    <div className="space-y-4">
      {/* Overview */}
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

      {/* Dropdown options — only lists editable in System Definitions */}
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

      {isEditableLeavePolicyModule(m.id) && (
        <SectionCard
          icon={Settings2}
          title="Leave policy"
          description="Annual leave allowance and other leave rules for all staff."
        >
          <LeavePolicyEditor moduleId={m.id} readOnly={!canEdit} />
        </SectionCard>
      )}

      {/* List view */}
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

      {/* Features */}
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

      {isEditableJobPostingModule(m.id) && (
        <SectionCard
          icon={Tag}
          title="Job posting"
          description="Roles HR can publish on the careers page. Add or remove roles here — interview guide is set internally."
        >
          <JobPostingsEditor moduleId={m.id} canAdd={canAdd} canEdit={canEdit} />
        </SectionCard>
      )}

      {isEditableApplicationFormModule(m.id) && (
        <SectionCard
          icon={Rows3}
          title="Job application form"
          description="Fields shown on the public multi-step job application. Add, edit, or remove fields and steps."
        >
          <ApplicationFormEditor
            moduleId={m.id}
            canAdd={canAdd}
            canEdit={canEdit}
          />
        </SectionCard>
      )}

      {isEditableOnboardingFormModule(m.id) && (
        <>
          <SectionCard
            icon={Rows3}
            title="Employee onboarding form"
            description="Fields on the post-hire onboarding link. Add inputs, set type (text, select, phone, date, etc.), and conditional visibility."
          >
            <OnboardingFormEditor
              moduleId={m.id}
              canAdd={canAdd}
              canEdit={canEdit}
            />
          </SectionCard>

          <SectionCard
            icon={Tag}
            title="Onboarding dropdown lists"
            description="Work locations and department options (L1–L6 vs L7 use different department lists)."
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
                title="Departments (L1–L6)"
                canAdd={canAdd}
                canEdit={canEdit}
              />
              <OptionsEditor
                moduleId={m.id}
                optionList={ONBOARDING_DEPARTMENTS_L7_LIST}
                title="Departments (L7)"
                canAdd={canAdd}
                canEdit={canEdit}
              />
            </div>
          </SectionCard>
        </>
      )}

      {isEditableCompetencySectionModule(m.id) && (
        <SectionCard
          icon={Rows3}
          title="Competency sections"
          description="Section titles and skill lines for each skills log type."
        >
          <CompetencySectionsEditor moduleId={m.id} readOnly={!canEdit} />
        </SectionCard>
      )}

      {isEditableRatingSectionModule(m.id) && (
        <SectionCard
          icon={Rows3}
          title="Rating sections"
          description="Section titles and rating line items for each grade band — Quarterly or Annual."
        >
          <RatingSectionsEditor moduleId={m.id} readOnly={!canEdit} />
        </SectionCard>
      )}

      {isEditableBusinessLogicModule(m.id) && (
        <SectionCard
          icon={Settings2}
          title="Rating section weights"
          description="How much each rating section counts in the score — for all staff or per grade band."
        >
          <SectionWeightsEditor moduleId={m.id} readOnly={!canEdit} />
        </SectionCard>
      )}

      {/* Conditional business rules */}
      {(isEditableBusinessLogicModule(m.id) || m.businessLogic.length > 0) && (
        <SectionCard
          icon={Settings2}
          title="Extra rules by grade"
          description="Conditional weight boosts when the employee being appraised is at a certain grade level."
        >
          {isEditableBusinessLogicModule(m.id) ? (
            <BusinessLogicEditor
              moduleId={m.id}
              canAdd={canAdd}
              canEdit={canEdit}
            />
          ) : (
            <ul className="space-y-2">
              {m.businessLogic.map((rule) => (
                <li
                  key={rule.id}
                  className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs"
                >
                  <p className="font-medium text-gray-700">{rule.label}</p>
                  {rule.description && (
                    <p className="text-gray-400 mt-0.5">{rule.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}

export default function SystemDefinitionsPage() {
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

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
          .sort((a, b) => a.sortOrder - b.sortOrder),
      }))
      .filter((g) => g.modules.length > 0);
  }, [modules]);

  const selectedModule = useMemo(() => {
    if (selectedModuleId) {
      return modules.find((m) => m.id === selectedModuleId) ?? null;
    }
    return groupedModules[0]?.modules[0] ?? null;
  }, [modules, groupedModules, selectedModuleId]);

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
            {groupedModules.map(({ group, modules: groupModules }) => (
              <div key={group.id}>
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {groupModules.map((m) => {
                    const Icon = resolveNavIcon(m.sidebar.icon);
                    const active = selectedModule?.id === m.id;
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
            ))}
          </nav>
        </div>

        {/* Detail panel */}
        <div className="flex-1 min-w-0 w-full">
          {selectedModule ? (
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
