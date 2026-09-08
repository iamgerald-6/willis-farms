"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import {
  defaultSkillLogTypeNames,
  sectionsFromDefaultSkillLogType,
  type SkillLogTemplate,
  type SkillLogTemplateSection,
} from "@/lib/skillLog/templates";
import type {
  OrgCustomListItem,
  OrgCustomListType,
} from "@/lib/organizationalStructureCustomLists";
import {
  EMPTY_ORG_MAP_ROWS,
  itemsForOrgMapField,
  parentOrgTable,
  type OrgMapRows,
} from "@/lib/organizationalStructureMapping";

const CHAIN_TABLES = [
  "sites",
  "business_units",
  "departments",
  "sections",
  "custom_position",
] as const;
type ChainTable = (typeof CHAIN_TABLES)[number];
const GRADE_TABLE = "grade_levels";

const TABLE_TO_TEMPLATE_COLUMN: Record<string, keyof SkillLogTemplate> = {
  sites: "site_id",
  business_units: "business_unit_id",
  departments: "department_id",
  sections: "section_id",
  custom_position: "position_id",
  grade_levels: "grade_level_id",
};

type WizardTab = "scope" | "sections";
const TAB_LABELS: Record<WizardTab, string> = {
  scope: "Skill log scope",
  sections: "Competency sections",
};
const TAB_ORDER: WizardTab[] = ["scope", "sections"];

function labelForItem(items: OrgCustomListItem[] | undefined, id: string | null | undefined) {
  if (!id) return "—";
  return items?.find((i) => i.id === id)?.label ?? "Unknown";
}

type Props = {
  canAdd: boolean;
  canEdit: boolean;
};

export default function SkillLogTemplatesManager({ canAdd, canEdit }: Props) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "wizard">("list");
  const [activeTemplate, setActiveTemplate] = useState<SkillLogTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<WizardTab>("scope");

  const { data: listTypes = [] } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => (await api.get("/organizational-structure/custom-list-types")).data.data,
  });

  const relevantListTypes = useMemo(
    () =>
      listTypes.filter((lt) =>
        [...CHAIN_TABLES, GRADE_TABLE].includes(lt.table_name as ChainTable | typeof GRADE_TABLE),
      ),
    [listTypes],
  );

  const itemsQueries = useQueries({
    queries: relevantListTypes.map((lt) => ({
      queryKey: ["org_custom_list_items", lt.id],
      queryFn: async () =>
        (await api.get(`/organizational-structure/custom-list-types/${lt.id}/items`)).data
          .data as OrgCustomListItem[],
      enabled: relevantListTypes.length > 0,
    })),
  });

  const itemsByTable = useMemo(() => {
    const map: Record<string, OrgCustomListItem[]> = {};
    relevantListTypes.forEach((lt, i) => {
      map[lt.table_name] = itemsQueries[i]?.data ?? [];
    });
    return map;
  }, [relevantListTypes, itemsQueries]);

  const { data: orgMaps = EMPTY_ORG_MAP_ROWS } = useQuery<OrgMapRows>({
    queryKey: ["org_map_rows"],
    queryFn: async () => (await api.get("/organizational-structure/org-maps")).data.data,
  });

  const [selections, setSelections] = useState<Record<string, string>>({});

  function itemsForField(tableName: string): OrgCustomListItem[] {
    return itemsForOrgMapField(
      tableName,
      itemsByTable[tableName] ?? [],
      selections,
      orgMaps,
    );
  }

  function clearDownstream(fromTable: string) {
    const order = [...CHAIN_TABLES, GRADE_TABLE];
    const idx = order.indexOf(fromTable as (typeof order)[number]);
    setSelections((prev) => {
      const next = { ...prev };
      order.slice(idx + 1).forEach((t) => delete next[t]);
      return next;
    });
  }

  const { data: templates = [], isLoading: templatesLoading } = useQuery<SkillLogTemplate[]>({
    queryKey: ["skill_log_templates"],
    queryFn: async () => (await api.get("/system-definitions/skill-log-templates")).data.data,
  });

  const findOrCreateMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      [...CHAIN_TABLES, GRADE_TABLE].forEach((t) => {
        body[TABLE_TO_TEMPLATE_COLUMN[t]] = selections[t];
      });
      const res = await api.post("/system-definitions/skill-log-templates", body);
      return res.data.data as SkillLogTemplate;
    },
    onSuccess: (template) => {
      setActiveTemplate(template);
      queryClient.invalidateQueries({ queryKey: ["skill_log_templates"] });
      setActiveTab("sections");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save scope.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/system-definitions/skill-log-templates/${id}`),
    onSuccess: () => {
      toast.success("Template deleted.");
      queryClient.invalidateQueries({ queryKey: ["skill_log_templates"] });
    },
    onError: () => toast.error("Could not delete template."),
  });

  function startNew() {
    setSelections({});
    setActiveTemplate(null);
    setActiveTab("scope");
    setView("wizard");
  }

  function openTemplate(t: SkillLogTemplate) {
    setActiveTemplate(t);
    setSelections({
      sites: t.site_id,
      business_units: t.business_unit_id,
      departments: t.department_id,
      sections: t.section_id,
      custom_position: t.position_id,
      grade_levels: t.grade_level_id,
    });
    setActiveTab("sections");
    setView("wizard");
  }

  function templateLabel(t: SkillLogTemplate) {
    return [
      labelForItem(itemsByTable.sites, t.site_id),
      labelForItem(itemsByTable.business_units, t.business_unit_id),
      labelForItem(itemsByTable.departments, t.department_id),
      labelForItem(itemsByTable.sections, t.section_id),
      labelForItem(itemsByTable.custom_position, t.position_id),
    ].join(" / ");
  }

  function templateName(t: SkillLogTemplate) {
    const position = labelForItem(itemsByTable.custom_position, t.position_id);
    const grade = labelForItem(itemsByTable.grade_levels, t.grade_level_id);
    return `${position} — ${grade}`;
  }

  if (view === "list") {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-gray-400 max-w-xl">
            Every skill log form is defined per exact combination of Site,
            Business unit, Department, Section, Position, and Grade level —
            matched against each employee&apos;s own org placement when a
            supervisor fills their log.
          </p>
          {canAdd && (
            <button
              type="button"
              onClick={startNew}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700"
            >
              <Plus className="w-3.5 h-3.5" /> New template
            </button>
          )}
        </div>

        {templatesLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-4 text-center">
            No skill log templates yet — click &quot;New template&quot; to build one.
          </p>
        ) : (
          <div className="rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Site</th>
                  <th className="px-3 py-2 font-medium">Business unit</th>
                  <th className="px-3 py-2 font-medium">Department</th>
                  <th className="px-3 py-2 font-medium">Section</th>
                  <th className="px-3 py-2 font-medium">Sections built</th>
                  {canEdit && <th className="px-3 py-2 font-medium w-10" />}
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-gray-50 last:border-0 bg-white hover:bg-gray-50 cursor-pointer"
                    onClick={() => openTemplate(t)}
                  >
                    <td className="px-3 py-2.5 font-medium text-gray-900">{templateName(t)}</td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {labelForItem(itemsByTable.sites, t.site_id)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {labelForItem(itemsByTable.business_units, t.business_unit_id)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {labelForItem(itemsByTable.departments, t.department_id)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {labelForItem(itemsByTable.sections, t.section_id)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-400">{t.sections.length}</td>
                    {canEdit && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(t.id)}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete template"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const complete = [...CHAIN_TABLES, GRADE_TABLE].every((t) => !!selections[t]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setView("list")}
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to templates
      </button>

      <div className="flex flex-wrap gap-2">
        {TAB_ORDER.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => (activeTemplate || tab === "scope") && setActiveTab(tab)}
            disabled={!activeTemplate && tab !== "scope"}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === tab
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-600 disabled:opacity-40"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === "scope" && (
        <ScopeTab
          selections={selections}
          setSelections={setSelections}
          clearDownstream={clearDownstream}
          itemsForField={itemsForField}
          activeTemplate={activeTemplate}
          templateLabel={activeTemplate ? templateLabel(activeTemplate) : null}
          gradeLabel={
            activeTemplate
              ? labelForItem(itemsByTable.grade_levels, activeTemplate.grade_level_id)
              : null
          }
          onSave={() => findOrCreateMutation.mutate()}
          saving={findOrCreateMutation.isPending}
          complete={complete}
          canEdit={!activeTemplate}
        />
      )}

      {activeTab === "sections" && activeTemplate && (
        <SectionsTab
          template={activeTemplate}
          canAdd={canAdd}
          canEdit={canEdit}
          otherTemplates={templates.filter(
            (t) => t.id !== activeTemplate.id && t.sections.length > 0,
          )}
          describeTemplate={(t) => templateName(t)}
          onSaved={(t) => {
            setActiveTemplate(t);
            queryClient.invalidateQueries({ queryKey: ["skill_log_templates"] });
            toast.success("Template saved.");
            setView("list");
          }}
        />
      )}
    </div>
  );
}

function ScopeTab({
  selections,
  setSelections,
  clearDownstream,
  itemsForField,
  activeTemplate,
  templateLabel,
  gradeLabel,
  onSave,
  saving,
  complete,
  canEdit,
}: {
  selections: Record<string, string>;
  setSelections: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  clearDownstream: (fromTable: string) => void;
  itemsForField: (tableName: string) => OrgCustomListItem[];
  activeTemplate: SkillLogTemplate | null;
  templateLabel: string | null;
  gradeLabel: string | null;
  onSave: () => void;
  saving: boolean;
  complete: boolean;
  canEdit: boolean;
}) {
  const FIELD_LABELS: Record<string, string> = {
    sites: "Site",
    business_units: "Business unit",
    departments: "Department",
    sections: "Section",
    custom_position: "Position",
    grade_levels: "Grade level",
  };

  if (activeTemplate) {
    return (
      <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
        <p className="text-xs text-gray-400 mb-1">This template applies to:</p>
        <p className="text-sm font-semibold text-gray-900">{templateLabel}</p>
        <p className="text-sm text-gray-600 mt-0.5">Grade: {gradeLabel}</p>
        <p className="text-xs text-gray-400 mt-2">
          Scope can&apos;t be changed once a template exists — delete it from
          the list and start a new one if this combination was wrong.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Pick the mapped org path this skill log applies to. Each dropdown
        only lists what is mapped under the value above it — not the full
        catalog.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[...CHAIN_TABLES, GRADE_TABLE].map((table) => {
          const parentTable = parentOrgTable(table);
          const parentReady = !parentTable || !!selections[parentTable];
          const options = parentReady ? itemsForField(table) : [];
          const emptyLabel = !parentReady
            ? `Select ${FIELD_LABELS[parentTable] ?? "the parent"} first`
            : options.length === 0 && parentTable
              ? `No ${FIELD_LABELS[table]?.toLowerCase() ?? "items"} mapped`
              : "Not set";
          return (
          <div key={table}>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              {FIELD_LABELS[table]}
            </label>
            <select
              value={selections[table] ?? ""}
              disabled={!canEdit || !parentReady}
              onChange={(e) => {
                setSelections((prev) => ({ ...prev, [table]: e.target.value }));
                clearDownstream(table);
              }}
              className="w-full border border-gray-200 p-2.5 rounded-lg text-sm text-gray-900 disabled:opacity-60"
            >
              <option value="">{emptyLabel}</option>
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          );
        })}
      </div>
      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!complete || saving}
            onClick={onSave}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save & continue"}
          </button>
        </div>
      )}
    </div>
  );
}

function SectionsTab({
  template,
  canAdd,
  canEdit,
  otherTemplates,
  describeTemplate,
  onSaved,
}: {
  template: SkillLogTemplate;
  canAdd: boolean;
  canEdit: boolean;
  otherTemplates: SkillLogTemplate[];
  describeTemplate: (t: SkillLogTemplate) => string;
  onSaved: (t: SkillLogTemplate) => void;
}) {
  const [draft, setDraft] = useState<SkillLogTemplateSection[]>(() =>
    template.sections.map((s) => ({ ...s, skills: [...s.skills] })),
  );
  const [tierAuth, setTierAuth] = useState<string[]>(() =>
    template.tier_auth_options?.length ? [...template.tier_auth_options] : ["None yet"],
  );
  const [reuseSelection, setReuseSelection] = useState("");
  const [defaultSelection, setDefaultSelection] = useState("");
  const [autofilling, setAutofilling] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.patch(`/system-definitions/skill-log-templates/${template.id}`, {
        sections: draft
          .map((s, i) => ({
            key: s.key || `sec-${i}`,
            title: s.title.trim(),
            skills: s.skills.map((sk) => sk.trim()).filter(Boolean),
          }))
          .filter((s) => s.title || s.skills.length > 0),
        tier_auth_options: tierAuth.map((t) => t.trim()).filter(Boolean),
      });
      return res.data.data as SkillLogTemplate;
    },
    onSuccess: onSaved,
    onError: () => toast.error("Could not save competency sections."),
  });

  function addSection() {
    setDraft((prev) => [
      ...prev,
      { key: `sec-${Date.now()}`, title: "New section", skills: [""] },
    ]);
  }

  function handleReuse(sourceId: string) {
    const source = otherTemplates.find((t) => t.id === sourceId);
    if (!source) return;
    setDraft(source.sections.map((s) => ({ ...s, skills: [...s.skills] })));
    if (source.tier_auth_options?.length) {
      setTierAuth([...source.tier_auth_options]);
    }
    toast.success(`Reused competency sections from "${describeTemplate(source)}".`);
    setReuseSelection("");
  }

  function handleLoadDefault(logType: string) {
    const sections = sectionsFromDefaultSkillLogType(logType);
    if (sections.length === 0) return;
    setDraft(sections);
    toast.success(`Loaded default skill log: ${logType}. Review before saving.`);
    setDefaultSelection("");
  }

  function handleStartBlank() {
    setDraft([{ key: `sec-${Date.now()}`, title: "", skills: [""] }]);
    toast.success("Started a blank skill log — add your own sections and skills.");
  }

  async function handleAutofillFile(file: File) {
    setAutofilling(true);
    try {
      const uploaded = await uploadCareersFile(file, "SkillLogTemplate");
      const res = await api.post("/skillLog/templates/extract", {
        file_url: uploaded.secure_url,
        file_name: uploaded.original_name,
      });
      const extracted = (res.data.data?.sections ?? []) as SkillLogTemplateSection[];
      setDraft(extracted.map((s, i) => ({
        key: s.key || `sec-${i}`,
        title: s.title,
        skills: [...(s.skills ?? [])],
      })));
      toast.success("Sections filled in from the document — review before saving.");
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(e?.response?.data?.error ?? e?.message ?? "Couldn't read that document.");
    } finally {
      setAutofilling(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Build your own skill log, load a default pack, reuse another template,
        or prefill from a document. Tier authorisation is always editable here
        — it is what the supervisor picks when they fill the log.
      </p>

      <div className="rounded-lg border border-gray-200 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Tier authorisation</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            These options always appear on the fill form for this template.
          </p>
        </div>
        {tierAuth.map((tier, i) => (
          <div key={`tier-${i}`} className="flex items-center gap-2">
            <input
              value={tier}
              disabled={!canEdit}
              onChange={(e) =>
                setTierAuth((prev) => prev.map((t, idx) => (idx === i ? e.target.value : t)))
              }
              className="flex-1 border border-gray-200 p-2 rounded-lg text-sm text-gray-900 disabled:opacity-60"
              placeholder="Tier authorisation"
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => setTierAuth((prev) => prev.filter((_, idx) => idx !== i))}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <button
            type="button"
            onClick={() => setTierAuth((prev) => [...prev, ""])}
            className="text-xs font-medium text-red-600 hover:text-red-700"
          >
            + Add tier
          </button>
        )}
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleStartBlank}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add your own skill log
          </button>
          <select
            value={defaultSelection}
            onChange={(e) => {
              const name = e.target.value;
              setDefaultSelection(name);
              if (name) handleLoadDefault(name);
            }}
            className="h-9 rounded-lg border border-gray-200 px-3 text-xs text-gray-600 bg-white"
          >
            <option value="">Load default skill log…</option>
            {defaultSkillLogTypeNames().map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {otherTemplates.length > 0 && (
            <select
              value={reuseSelection}
              onChange={(e) => {
                const id = e.target.value;
                setReuseSelection(id);
                if (id) handleReuse(id);
              }}
              className="h-9 rounded-lg border border-gray-200 px-3 text-xs text-gray-600 bg-white"
            >
              <option value="">Reuse skill log setup…</option>
              {otherTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {describeTemplate(t)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {canEdit && (
        <div className="rounded-lg border border-dashed border-gray-300 p-3">
          <label className="flex flex-wrap items-center gap-2 cursor-pointer">
            {autofilling ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-600" />
            ) : (
              <Sparkles className="w-4 h-4 text-red-600" />
            )}
            <span className="text-sm font-medium text-red-700">
              {autofilling ? "Reading document…" : "Prefill with AI"}
            </span>
            <span className="text-xs text-gray-400">
              — upload an SOP, old skill log, or job description (Word, PDF, or image)
            </span>
            <input
              type="file"
              className="sr-only"
              accept=".pdf,.doc,.docx,image/jpeg,image/png"
              disabled={autofilling}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                await handleAutofillFile(file);
              }}
            />
          </label>
        </div>
      )}

      {draft.map((section, si) => (
        <div key={section.key} className="rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              value={section.title}
              disabled={!canEdit}
              onChange={(e) =>
                setDraft((prev) =>
                  prev.map((s, i) => (i === si ? { ...s, title: e.target.value } : s)),
                )
              }
              className="flex-1 border border-gray-200 p-2 rounded-lg text-sm font-medium text-gray-900 disabled:opacity-60"
              placeholder="Section title"
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => setDraft((prev) => prev.filter((_, i) => i !== si))}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="space-y-2">
            {section.skills.map((skill, ski) => (
              <div key={`${section.key}-${ski}`} className="flex items-center gap-2">
                <input
                  value={skill}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev.map((s, i) =>
                        i === si
                          ? {
                              ...s,
                              skills: s.skills.map((sk, k) =>
                                k === ski ? e.target.value : sk,
                              ),
                            }
                          : s,
                      ),
                    )
                  }
                  className="flex-1 border border-gray-200 p-2 rounded-lg text-sm text-gray-900 disabled:opacity-60"
                  placeholder="Skill / competency"
                />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) =>
                        prev.map((s, i) =>
                          i === si
                            ? { ...s, skills: s.skills.filter((_, k) => k !== ski) }
                            : s,
                        ),
                      )
                    }
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {canAdd && canEdit && (
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) =>
                    prev.map((s, i) =>
                      i === si ? { ...s, skills: [...s.skills, ""] } : s,
                    ),
                  )
                }
                className="text-xs font-medium text-red-600 hover:text-red-700"
              >
                + Add skill
              </button>
            )}
          </div>
        </div>
      ))}

      {canAdd && canEdit && (
        <button
          type="button"
          onClick={addSection}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700"
        >
          <Plus className="w-3.5 h-3.5" /> Add section
        </button>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saveMutation.isPending ? "Saving…" : "Save template"}
          </button>
        </div>
      )}
    </div>
  );
}
