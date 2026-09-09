"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Pencil, Check, X, ArrowLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import type { SectionDef } from "@/lib/appraisal/scoring";
import {
  normalizeTemplateSections,
  type AppraisalGradeTemplate,
  type ExtraWeightRule,
} from "@/lib/appraisal/gradeTemplates";
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

/**
 * Replaces the old global L1-L7 grade-band "Appraisal scope" editors
 * (AppraisalScopeEditor / RatingSectionsEditor / SectionWeightsEditor /
 * BusinessLogicEditor) with a 4-step wizard, one appraisal question set per
 * exact org combination — same tab-bar/save-and-advance shape as
 * PostingInterviewSetup under Create job posting.
 */

const CHAIN_TABLES = [
  "sites",
  "business_units",
  "departments",
  "sections",
  "custom_position",
] as const;
type ChainTable = (typeof CHAIN_TABLES)[number];
const GRADE_TABLE = "grade_levels";

const TABLE_TO_TEMPLATE_COLUMN: Record<string, keyof AppraisalGradeTemplate> = {
  sites: "site_id",
  business_units: "business_unit_id",
  departments: "department_id",
  sections: "section_id",
  custom_position: "position_id",
  grade_levels: "grade_level_id",
};

type SectionSet = "quarterly" | "annual";
type WizardTab = "scope" | "sections" | "weights" | "rules";
const TAB_LABELS: Record<WizardTab, string> = {
  scope: "Appraisal scope",
  sections: "Rating sections",
  weights: "Rating section weights",
  rules: "Extra rules by grade",
};
const TAB_ORDER: WizardTab[] = ["scope", "sections", "weights", "rules"];

function labelForItem(items: OrgCustomListItem[] | undefined, id: string | null | undefined) {
  if (!id) return "—";
  return items?.find((i) => i.id === id)?.label ?? "Unknown";
}

type Props = {
  canAdd: boolean;
  canEdit: boolean;
};

export default function AppraisalGradeTemplatesManager({ canAdd, canEdit }: Props) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "wizard">("list");
  const [activeTemplate, setActiveTemplate] = useState<AppraisalGradeTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<WizardTab>("scope");

  // ── Org-structure data (list types, items, mapping tree) ──
  const { data: listTypes = [] } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => (await api.get("/organizational-structure/custom-list-types")).data.data,
  });

  const relevantListTypes = useMemo(
    () => listTypes.filter((lt) => [...CHAIN_TABLES, GRADE_TABLE].includes(lt.table_name as ChainTable | typeof GRADE_TABLE)),
    [listTypes],
  );

  const itemsQueries = useQueries({
    queries: relevantListTypes.map((lt) => ({
      queryKey: ["org_custom_list_items", lt.id],
      queryFn: async () =>
        (await api.get(`/organizational-structure/custom-list-types/${lt.id}/items`)).data.data as OrgCustomListItem[],
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

  // ── Selections for the "scope" tab (building/finding a template) ──
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

  // ── Templates list ──
  const { data: templates = [], isLoading: templatesLoading } = useQuery<AppraisalGradeTemplate[]>({
    queryKey: ["appraisal_grade_templates"],
    queryFn: async () => (await api.get("/system-definitions/appraisal-grade-templates")).data.data,
  });

  const findOrCreateMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      [...CHAIN_TABLES, GRADE_TABLE].forEach((t) => {
        body[TABLE_TO_TEMPLATE_COLUMN[t]] = selections[t];
      });
      const res = await api.post("/system-definitions/appraisal-grade-templates", body);
      return res.data.data as AppraisalGradeTemplate;
    },
    onSuccess: (template) => {
      setActiveTemplate(template);
      queryClient.invalidateQueries({ queryKey: ["appraisal_grade_templates"] });
      setActiveTab("sections");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save scope.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/system-definitions/appraisal-grade-templates/${id}`),
    onSuccess: () => {
      toast.success("Template deleted.");
      queryClient.invalidateQueries({ queryKey: ["appraisal_grade_templates"] });
    },
    onError: () => toast.error("Could not delete template."),
  });

  function startNew() {
    setSelections({});
    setActiveTemplate(null);
    setActiveTab("scope");
    setView("wizard");
  }

  function openTemplate(t: AppraisalGradeTemplate) {
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

  function templateLabel(t: AppraisalGradeTemplate) {
    return [
      labelForItem(itemsByTable.sites, t.site_id),
      labelForItem(itemsByTable.business_units, t.business_unit_id),
      labelForItem(itemsByTable.departments, t.department_id),
      labelForItem(itemsByTable.sections, t.section_id),
      labelForItem(itemsByTable.custom_position, t.position_id),
    ].join(" / ");
  }

  /** "Name" column — the Position's label doubles as the job posting title
   * (job postings resolve their title from Position, see
   * resolveTitleFromPosition), paired with the Grade level. */
  function templateName(t: AppraisalGradeTemplate) {
    const position = labelForItem(itemsByTable.custom_position, t.position_id);
    const grade = labelForItem(itemsByTable.grade_levels, t.grade_level_id);
    return `${position} — ${grade}`;
  }

  if (view === "list") {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-gray-400 max-w-xl">
            Every appraisal question set is defined per exact combination of
            Site, Business unit, Department, Section, Position, and Grade
            level — matched against each employee&apos;s own org placement
            when they&apos;re appraised.
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
            No appraisal templates yet — click &quot;New template&quot; to build one.
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
                    <td className="px-3 py-2.5 text-gray-600">{labelForItem(itemsByTable.sites, t.site_id)}</td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {labelForItem(itemsByTable.business_units, t.business_unit_id)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {labelForItem(itemsByTable.departments, t.department_id)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {labelForItem(itemsByTable.sections, t.section_id)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-400">
                      {t.quarterly_sections.length}Q / {t.annual_sections.length}A
                    </td>
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

  // ── Wizard ──
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
            activeTemplate ? labelForItem(itemsByTable.grade_levels, activeTemplate.grade_level_id) : null
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
          otherTemplates={templates.filter((t) => t.id !== activeTemplate.id)}
          describeTemplate={(t) => `${templateName(t)} (${templateLabel(t)})`}
          onSaved={(t) => {
            setActiveTemplate(t);
            queryClient.invalidateQueries({ queryKey: ["appraisal_grade_templates"] });
            setActiveTab("weights");
          }}
        />
      )}

      {activeTab === "weights" && activeTemplate && (
        <WeightsTab
          template={activeTemplate}
          canEdit={canEdit}
          onSaved={(t) => {
            setActiveTemplate(t);
            queryClient.invalidateQueries({ queryKey: ["appraisal_grade_templates"] });
            setActiveTab("rules");
          }}
        />
      )}

      {activeTab === "rules" && activeTemplate && (
        <RulesTab
          template={activeTemplate}
          canAdd={canAdd}
          canEdit={canEdit}
          onSaved={(t) => {
            setActiveTemplate(t);
            queryClient.invalidateQueries({ queryKey: ["appraisal_grade_templates"] });
            toast.success("Template complete.");
            setView("list");
          }}
        />
      )}
    </div>
  );
}

// ── Tab 1: Scope ──────────────────────────────────────────────────────────

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
  activeTemplate: AppraisalGradeTemplate | null;
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
        Pick the mapped org path this appraisal applies to. Each dropdown
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

// ── Tab 2: Rating sections ──────────────────────────────────────────────

type SectionDraft = { key: string; title: string; items: string[]; weight: number };

function toDraft(sections: SectionDef[]): SectionDraft[] {
  return normalizeTemplateSections(sections).map((s) => ({ ...s, items: [...s.items] }));
}

async function patchTemplate(id: string, updates: Record<string, unknown>) {
  const res = await api.patch(`/system-definitions/appraisal-grade-templates/${id}`, updates);
  return res.data.data as AppraisalGradeTemplate;
}

/** Next unused single-letter key (A, B, C...), falling back to S<n> past Z —
 * matches the old band system's convention so section headers on the live
 * appraisal form ("A. Leadership", "B. Compliance"...) render cleanly
 * instead of showing a raw internal id. */
function nextSectionKey(existing: SectionDraft[]): string {
  const used = new Set(existing.map((s) => s.key));
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    if (!used.has(letter)) return letter;
  }
  return `S${existing.length + 1}`;
}

/** Splits weight evenly across every section — run after any structural
 * change (add/remove/reuse/AI-fill) so a template never sits at 0% until
 * someone visits the Weights tab; that tab is exactly where to fine-tune
 * the split afterward. */
function evenlyWeighted(sections: SectionDraft[]): SectionDraft[] {
  if (sections.length === 0) return sections;
  const w = 1 / sections.length;
  return sections.map((s) => ({ ...s, weight: w }));
}

function SectionsTab({
  template,
  canAdd,
  canEdit,
  otherTemplates,
  describeTemplate,
  onSaved,
}: {
  template: AppraisalGradeTemplate;
  canAdd: boolean;
  canEdit: boolean;
  otherTemplates: AppraisalGradeTemplate[];
  describeTemplate: (t: AppraisalGradeTemplate) => string;
  onSaved: (t: AppraisalGradeTemplate) => void;
}) {
  const [sectionSet, setSectionSet] = useState<SectionSet>("quarterly");
  const [quarterly, setQuarterly] = useState<SectionDraft[]>(() => toDraft(template.quarterly_sections));
  const [annual, setAnnual] = useState<SectionDraft[]>(() => toDraft(template.annual_sections));
  const [reuseSelection, setReuseSelection] = useState("");
  const [autofilling, setAutofilling] = useState(false);

  const draft = sectionSet === "quarterly" ? quarterly : annual;
  const setDraft = sectionSet === "quarterly" ? setQuarterly : setAnnual;

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    for (const s of [...quarterly, ...annual]) {
      if (!s.title.trim()) {
        toast.error(`Section ${s.key} needs a title.`);
        return;
      }
      if (s.items.some((item) => !item.trim())) {
        toast.error(`Section ${s.key} has a blank rating item.`);
        return;
      }
    }
    if (quarterly.length === 0 && annual.length === 0) {
      toast.error("Add at least one section (Quarterly or Annual).");
      return;
    }

    setSaving(true);
    try {
      const t = await patchTemplate(template.id, {
        quarterly_sections: quarterly,
        annual_sections: annual,
      });
      toast.success("Sections saved.");
      onSaved(t);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error ?? "Could not save sections.");
    } finally {
      setSaving(false);
    }
  };

  const addSection = () => {
    setDraft((prev) =>
      evenlyWeighted([
        ...prev,
        { key: nextSectionKey(prev), title: "New section", items: [""], weight: 0 },
      ]),
    );
  };
  const removeSection = (key: string) =>
    setDraft((prev) => evenlyWeighted(prev.filter((s) => s.key !== key)));
  const updateTitle = (key: string, title: string) =>
    setDraft((prev) => prev.map((s) => (s.key === key ? { ...s, title } : s)));
  const addItem = (key: string) =>
    setDraft((prev) => prev.map((s) => (s.key === key ? { ...s, items: [...s.items, ""] } : s)));
  const updateItem = (key: string, idx: number, value: string) =>
    setDraft((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s;
        const items = [...s.items];
        items[idx] = value;
        return { ...s, items };
      }),
    );
  const removeItem = (key: string, idx: number) =>
    setDraft((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s;
        if (s.items.length <= 1) {
          toast.error("Each section needs at least one rating item.");
          return s;
        }
        return { ...s, items: s.items.filter((_, i) => i !== idx) };
      }),
    );

  const handleReuse = (sourceId: string) => {
    const source = otherTemplates.find((t) => t.id === sourceId);
    if (!source) return;
    setQuarterly(toDraft(source.quarterly_sections));
    setAnnual(toDraft(source.annual_sections));
    toast.success(`Reused rating sections from "${describeTemplate(source)}".`);
    setReuseSelection("");
  };

  const handleAutofillFile = async (file: File) => {
    setAutofilling(true);
    try {
      const uploaded = await uploadCareersFile(file, "AppraisalGradeTemplate");
      const res = await api.post("/appraisal/grade-templates/extract", {
        file_url: uploaded.secure_url,
        file_name: uploaded.original_name,
      });
      const extractedSections = (res.data.data?.sections ?? []) as SectionDraft[];
      setDraft(extractedSections);
      toast.success("Sections filled in from the document — review before saving.");
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error ?? "Couldn't read that document.");
    } finally {
      setAutofilling(false);
    }
  };

  const allowAdd = canAdd || canEdit;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Build the sections and rating line items for this template — separately for Quarterly and Annual.
      </p>

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          {(["quarterly", "annual"] as SectionSet[]).map((set) => (
            <button
              key={set}
              type="button"
              onClick={() => setSectionSet(set)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                sectionSet === set
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              {set === "quarterly" ? "Quarterly (Q1-Q3)" : "Annual (Q4)"}
            </button>
          ))}
        </div>

        {canEdit && otherTemplates.length > 0 && (
          <select
            value={reuseSelection}
            onChange={(e) => {
              const id = e.target.value;
              setReuseSelection(id);
              if (id) handleReuse(id);
            }}
            className="h-9 rounded-lg border border-gray-200 px-3 text-xs text-gray-600 bg-white"
          >
            <option value="">Reuse appraisal setup…</option>
            {otherTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {describeTemplate(t)}
              </option>
            ))}
          </select>
        )}
      </div>

      {canEdit && (
        <div className="rounded-lg border border-dashed border-gray-300 p-3">
          <label className="flex flex-wrap items-center gap-2 cursor-pointer">
            {autofilling ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-600" />
            ) : (
              <Sparkles className="w-4 h-4 text-red-600" />
            )}
            <span className="text-sm font-medium text-red-700">
              {autofilling ? "Reading document…" : "Prefill with WillsFarms Intel"}
            </span>
            <span className="text-xs text-gray-400">
              — upload a job description, SOP, or old appraisal form (Word, PDF, or image) to fill in{" "}
              {sectionSet}
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

      {allowAdd && (
        <button
          type="button"
          onClick={addSection}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700"
        >
          <Plus className="w-3.5 h-3.5" /> Add section
        </button>
      )}

      {draft.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-2">No sections yet for {sectionSet}.</p>
      ) : (
        <div className="space-y-4">
          {draft.map((section) => (
            <div key={section.key} className="rounded-lg border border-gray-200 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Section {section.key} — title
                  </label>
                  <input
                    type="text"
                    value={section.title}
                    onChange={(e) => updateTitle(section.key, e.target.value)}
                    disabled={!canEdit}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                  />
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeSection(section.key)}
                    className="mt-5 p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  Rating items
                </p>
                <div className="space-y-2">
                  {section.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => updateItem(section.key, idx, e.target.value)}
                        disabled={!canEdit}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
                      />
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => removeItem(section.key, idx)}
                          className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {allowAdd && (
                  <button
                    type="button"
                    onClick={() => addItem(section.key)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add item
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save & continue"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Rating section weights ───────────────────────────────────────

function weightSum(sections: SectionDraft[]) {
  return sections.reduce((sum, s) => sum + s.weight, 0);
}

function WeightsTab({
  template,
  canEdit,
  onSaved,
}: {
  template: AppraisalGradeTemplate;
  canEdit: boolean;
  onSaved: (t: AppraisalGradeTemplate) => void;
}) {
  const [sectionSet, setSectionSet] = useState<SectionSet>("quarterly");
  const [quarterly, setQuarterly] = useState<SectionDraft[]>(() => toDraft(template.quarterly_sections));
  const [annual, setAnnual] = useState<SectionDraft[]>(() => toDraft(template.annual_sections));

  const draft = sectionSet === "quarterly" ? quarterly : annual;
  const setDraft = sectionSet === "quarterly" ? setQuarterly : setAnnual;

  const handleWeightChange = (key: string, pct: number) => {
    setDraft((prev) => prev.map((s) => (s.key === key ? { ...s, weight: pct / 100 } : s)));
  };

  const totalPct = weightSum(draft) * 100;

  const handleSave = () => {
    for (const set of [quarterly, annual]) {
      if (set.length === 0) continue;
      const total = weightSum(set) * 100;
      if (Math.abs(total - 100) > 2) {
        toast.error(`Weights must add up to 100% (currently ${total.toFixed(0)}%).`);
        return;
      }
    }

    patchTemplate(template.id, { quarterly_sections: quarterly, annual_sections: annual })
      .then((t) => {
        toast.success("Weights saved.");
        onSaved(t);
      })
      .catch((err) => toast.error(err?.response?.data?.error ?? "Could not save weights."));
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Set how much each section counts in the score, for Quarterly and Annual separately.
      </p>

      <div className="flex flex-wrap gap-2">
        {(["quarterly", "annual"] as SectionSet[]).map((set) => (
          <button
            key={set}
            type="button"
            onClick={() => setSectionSet(set)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              sectionSet === set
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            {set === "quarterly" ? "Quarterly (Q1-Q3)" : "Annual (Q4)"}
          </button>
        ))}
      </div>

      {draft.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-2">No sections defined for {sectionSet} yet.</p>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500">
                  <th className="px-3 py-2 font-medium">Section</th>
                  <th className="px-3 py-2 font-medium w-28">Weight %</th>
                </tr>
              </thead>
              <tbody>
                {draft.map((s) => (
                  <tr key={s.key} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium text-gray-800">{s.title}</span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        step={1}
                        disabled={!canEdit}
                        value={Math.round(s.weight * 100)}
                        onChange={(e) => handleWeightChange(s.key, Number(e.target.value))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:opacity-60"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={`text-xs font-medium ${Math.abs(totalPct - 100) <= 2 ? "text-green-600" : "text-amber-600"}`}>
            Total: {totalPct.toFixed(0)}%{Math.abs(totalPct - 100) > 2 && " — should be 100%"}
          </p>
        </>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700"
          >
            Save & continue
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Extra rules by grade ──────────────────────────────────────────

function RulesTab({
  template,
  canAdd,
  canEdit,
  onSaved,
}: {
  template: AppraisalGradeTemplate;
  canAdd: boolean;
  canEdit: boolean;
  onSaved: (t: AppraisalGradeTemplate) => void;
}) {
  const [rules, setRules] = useState<ExtraWeightRule[]>(template.extra_rules);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newSectionKey, setNewSectionKey] = useState("");
  const [newWeight, setNewWeight] = useState(0.25);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ExtraWeightRule | null>(null);

  const sectionKeyOptions = useMemo(() => {
    const keys = new Set([
      ...template.quarterly_sections.map((s) => s.key),
      ...template.annual_sections.map((s) => s.key),
    ]);
    return Array.from(keys);
  }, [template]);

  useEffect(() => {
    if (!newSectionKey && sectionKeyOptions.length > 0) setNewSectionKey(sectionKeyOptions[0]);
  }, [sectionKeyOptions, newSectionKey]);

  const finish = () => {
    patchTemplate(template.id, { extra_rules: rules })
      .then((t) => onSaved(t))
      .catch((err) => toast.error(err?.response?.data?.error ?? "Could not save rules."));
  };

  const persistLocal = (next: ExtraWeightRule[]) => {
    setRules(next);
    setShowAdd(false);
    setEditingId(null);
    setEditDraft(null);
  };

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) {
      toast.error("Label is required.");
      return;
    }
    if (!newSectionKey) {
      toast.error("Add a section in Rating sections first.");
      return;
    }
    persistLocal([
      ...rules,
      { id: `rule:${Date.now()}`, label, sectionKey: newSectionKey, weight: newWeight, enabled: true },
    ]);
    setNewLabel("");
    setNewWeight(0.25);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-gray-400 max-w-md">
          Optional conditional weight boosts on top of the base weights above — e.g. bump one section
          higher for this specific template.
        </p>
        {canAdd && (
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700"
          >
            <Plus className="w-3.5 h-3.5" /> Add rule
          </button>
        )}
      </div>

      {showAdd && (
        <div className="rounded-lg border border-red-100 bg-red-50/40 p-3 space-y-3">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Rule label"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={newSectionKey}
              onChange={(e) => setNewSectionKey(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {sectionKeyOptions.map((k) => {
                const title =
                  template.quarterly_sections.find((s) => s.key === k)?.title ??
                  template.annual_sections.find((s) => s.key === k)?.title ??
                  k;
                return (
                  <option key={k} value={k}>
                    {title}
                  </option>
                );
              })}
            </select>
            <input
              type="number"
              min={0.05}
              max={0.9}
              step={0.01}
              value={newWeight}
              onChange={(e) => setNewWeight(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white"
            >
              Save rule
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-2 text-center">No extra rules.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
          {rules.map((rule) => (
            <li key={rule.id} className="bg-white px-3 py-2.5">
              {editingId === rule.id && editDraft ? (
                <div className="space-y-3">
                  <input
                    value={editDraft.label}
                    onChange={(e) => setEditDraft({ ...editDraft, label: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select
                      value={editDraft.sectionKey}
                      onChange={(e) => setEditDraft({ ...editDraft, sectionKey: e.target.value })}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    >
                      {sectionKeyOptions.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0.05}
                      max={0.9}
                      step={0.01}
                      value={editDraft.weight}
                      onChange={(e) => setEditDraft({ ...editDraft, weight: Number(e.target.value) })}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={editDraft.enabled}
                      onChange={(e) => setEditDraft({ ...editDraft, enabled: e.target.checked })}
                    />
                    Rule is active
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => persistLocal(rules.map((r) => (r.id === rule.id ? editDraft : r)))}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-green-600 text-white"
                    >
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditDraft(null);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-gray-200"
                    >
                      <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {rule.label}
                      {!rule.enabled && <span className="ml-2 text-xs text-gray-400">(paused)</span>}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Section {rule.sectionKey} · weight {(rule.weight * 100).toFixed(0)}%
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(rule.id);
                          setEditDraft({ ...rule });
                        }}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          persistLocal(rules.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)))
                        }
                        className="px-2 py-1 text-xs rounded-lg border border-gray-200 text-gray-600"
                      >
                        {rule.enabled ? "Pause" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => persistLocal(rules.filter((r) => r.id !== rule.id))}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={finish}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700"
          >
            Save & finish
          </button>
        </div>
      )}
    </div>
  );
}
