"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Pencil, Check, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { SectionDef } from "@/lib/appraisal/scoring";
import type {
  AppraisalGradeTemplate,
  ExtraWeightRule,
} from "@/lib/appraisal/gradeTemplates";
import type {
  OrgCustomListItem,
  OrgCustomListType,
} from "@/lib/organizationalStructureCustomLists";

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

type MappingLevel = {
  id: string;
  position: number;
  parent_level_id: string | null;
  list_type_id: string;
  list_type: { id: string; label: string; singular: string; table_name: string };
};
type MappingNode = { id: string; level_id: string; item_id: string; parent_node_id: string | null };

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
  moduleId: string;
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

  const { data: mappingLevels = [] } = useQuery<MappingLevel[]>({
    queryKey: ["org_mapping_levels_list"],
    queryFn: async () => (await api.get("/organizational-structure/mapping-levels")).data.data,
  });
  const { data: mappingNodes = [] } = useQuery<MappingNode[]>({
    queryKey: ["org_mapping_nodes_list"],
    queryFn: async () => (await api.get("/organizational-structure/mapping-nodes")).data.data,
  });

  function chainLevel(tableName: string): MappingLevel | undefined {
    return mappingLevels.find((l) => l.list_type.table_name === tableName);
  }

  // ── Selections for the "scope" tab (building/finding a template) ──
  const [selections, setSelections] = useState<Record<string, string>>({});

  function resolvedNodeIdFor(tableName: string): string | undefined {
    const level = chainLevel(tableName);
    if (!level) return undefined;
    const itemId = selections[tableName];
    if (!itemId) return undefined;

    let parentNodeId: string | null | undefined = null;
    if (level.parent_level_id) {
      const parentLevel = mappingLevels.find((l) => l.id === level.parent_level_id);
      parentNodeId = parentLevel ? resolvedNodeIdFor(parentLevel.list_type.table_name) : undefined;
    }
    if (parentNodeId === undefined) return undefined;

    return mappingNodes.find(
      (n) => n.level_id === level.id && n.item_id === itemId && n.parent_node_id === parentNodeId,
    )?.id;
  }

  function itemsForField(tableName: string): OrgCustomListItem[] {
    const items = itemsByTable[tableName] ?? [];
    if (tableName === "sites") return items;

    const level = chainLevel(tableName);
    if (!level) return items;

    const levelNodes = mappingNodes.filter((n) => n.level_id === level.id);
    if (levelNodes.length === 0) return items; // not configured yet — fail open

    if (!level.parent_level_id) return items;
    const parentLevel = mappingLevels.find((l) => l.id === level.parent_level_id);
    if (!parentLevel) return items;
    const parentNodeId = resolvedNodeIdFor(parentLevel.list_type.table_name);
    if (parentNodeId === undefined) return [];

    const ids = new Set(
      levelNodes.filter((n) => n.parent_node_id === parentNodeId).map((n) => n.item_id),
    );
    return items.filter((i) => ids.has(i.id));
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
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
            {templates.map((t) => (
              <li key={t.id} className="bg-white px-3 py-2.5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => openTemplate(t)}
                  className="text-left flex-1 min-w-0"
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{templateLabel(t)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Grade: {labelForItem(itemsByTable.grade_levels, t.grade_level_id)} ·{" "}
                    {t.quarterly_sections.length} quarterly section
                    {t.quarterly_sections.length === 1 ? "" : "s"},{" "}
                    {t.annual_sections.length} annual section
                    {t.annual_sections.length === 1 ? "" : "s"}
                  </p>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(t.id)}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 shrink-0"
                    title="Delete template"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
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
        Pick the exact combination this appraisal question set applies to.
        Employees are matched by their own stored Site/BU/Department/
        Section/Position/Grade level.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[...CHAIN_TABLES, GRADE_TABLE].map((table) => (
          <div key={table}>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              {FIELD_LABELS[table]}
            </label>
            <select
              value={selections[table] ?? ""}
              disabled={!canEdit}
              onChange={(e) => {
                setSelections((prev) => ({ ...prev, [table]: e.target.value }));
                clearDownstream(table);
              }}
              className="w-full border border-gray-200 p-2.5 rounded-lg text-sm text-gray-900 disabled:opacity-60"
            >
              <option value="">Not set</option>
              {itemsForField(table).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        ))}
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
  return sections.map((s) => ({ ...s, items: [...s.items] }));
}

async function patchTemplate(id: string, updates: Record<string, unknown>) {
  const res = await api.patch(`/system-definitions/appraisal-grade-templates/${id}`, updates);
  return res.data.data as AppraisalGradeTemplate;
}

function SectionsTab({
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
  const [sectionSet, setSectionSet] = useState<SectionSet>("quarterly");
  const [quarterly, setQuarterly] = useState<SectionDraft[]>(() => toDraft(template.quarterly_sections));
  const [annual, setAnnual] = useState<SectionDraft[]>(() => toDraft(template.annual_sections));

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

    const withWeights = (arr: SectionDraft[]) => {
      const total = arr.reduce((sum, s) => sum + (s.weight || 0), 0);
      if (total > 0) return arr;
      const w = arr.length ? 1 / arr.length : 0;
      return arr.map((s) => ({ ...s, weight: w }));
    };

    setSaving(true);
    try {
      const t = await patchTemplate(template.id, {
        quarterly_sections: withWeights(quarterly),
        annual_sections: withWeights(annual),
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
    setDraft((prev) => [...prev, { key: `sec-${Date.now()}`, title: "New section", items: [""], weight: 0 }]);
  };
  const removeSection = (key: string) => setDraft((prev) => prev.filter((s) => s.key !== key));
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

  const allowAdd = canAdd || canEdit;

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Build the sections and rating line items for this template — separately for Quarterly and Annual.
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
                    Section title
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
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Rating items
                  </p>
                  {allowAdd && (
                    <button
                      type="button"
                      onClick={() => addItem(section.key)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add item
                    </button>
                  )}
                </div>
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
