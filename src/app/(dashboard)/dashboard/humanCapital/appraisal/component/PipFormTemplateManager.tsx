"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  ArrowLeft,
  Sparkles,
  FileText,
  CheckCircle2,
  ExternalLink,
  Table as TableIcon,
  ListChecks,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import { ACCEPT_PDF_WORD_OR_IMAGE } from "@/lib/uploadConstraints";
import type { OrgCustomListItem, OrgCustomListType } from "@/lib/organizationalStructureCustomLists";
import { EMPTY_ORG_MAP_ROWS, itemsForOrgMapField, parentOrgTable, type OrgMapRows } from "@/lib/organizationalStructureMapping";
import {
  createBlankPipColumn,
  createBlankPipField,
  createBlankPipSection,
  createEmptyPipFormSchema,
  createSystemPipField,
  isSystemField,
  pipFieldLabel,
  PIP_FIELD_TYPE_OPTIONS,
  PIP_SECTION_AUDIENCE_OPTIONS,
  PIP_SYSTEM_FIELD_SOURCES,
  type PipField,
  type PipFormSchema,
  type PipSection,
  type PipSystemFieldSourceKey,
  type PipTableColumn,
} from "@/lib/appraisal/pipFormSchema";
import type { PipFormTemplate, PipFormTemplateVersion } from "@/lib/appraisal/pipTemplates";
import { isAutoIncrementColumn } from "@/lib/appraisal/pipFormControls";
import {
  DEFAULT_PIP_SUPPORT_ACTION_OPTIONS,
  detectPipSectionRole,
  hasGapChain,
  isSupportActionColumn,
  pipSectionRoleLabel,
} from "@/lib/appraisal/pipGapChain";

function parseOptionsList(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Comma-separated options — parses on blur so typing "30, 60" doesn't eat the comma mid-keystroke. */
function CommaSeparatedOptionsInput({
  options,
  onChange,
  placeholder,
  className,
}: {
  options: string[];
  onChange: (options: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const committed = options.join(", ");

  useEffect(() => {
    setDraft(null);
  }, [committed]);

  return (
    <div className="flex-1 min-w-[200px]">
      <input
        type="text"
        value={draft ?? committed}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const raw = draft ?? committed;
          onChange(parseOptionsList(raw));
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        placeholder={placeholder ?? "30, 60, 90  or  Met, Not met, N/A"}
        className={className}
      />
      <p className="text-[10px] text-gray-400 mt-0.5">Separate choices with commas. Press Enter or click away to apply.</p>
    </div>
  );
}

/**
 * "PIP form setup" — the origin/template step for Performance Improvement
 * Plans (see docs/appraisal/pip-form-templates.sql). Same list + wizard
 * shape as the "Appraisal question sets" builder next to it
 * (AppraisalGradeTemplatesManager): one template per exact Site/Business
 * unit/Department/Section/Position/Grade level combination, picked in a
 * "Scope" step, then
 * built out in a "Form" step by adding sections by hand and/or uploading
 * the reference document to prefill them ("Prefill with WillsOne Intel") —
 * both available as soon as the template exists, never gated
 * behind an upload.
 *
 * One deliberate difference from a generic form builder: fields that are
 * really tracked employee/appraisal data (name, position, supervisor...)
 * are locked "system" fields, not retyped HR content — see
 * PIP_SYSTEM_FIELD_SOURCES in pipFormSchema.ts. They render read-only here
 * and will be auto-filled from the real record once PIP instances exist
 * (Phase 2+).
 *
 * No live PIP instances yet — this only sets up the origin template that
 * Phase 2 (creating a PIP for an employee after a poor final review) will
 * read from.
 */

const CHAIN_TABLES = [
  "sites",
  "business_units",
  "departments",
  "sections",
  "custom_position",
] as const;
const GRADE_TABLE = "grade_levels";
const SCOPE_TABLES = [...CHAIN_TABLES, GRADE_TABLE] as const;

const TABLE_TO_TEMPLATE_COLUMN: Record<string, keyof PipFormTemplate> = {
  sites: "site_id",
  business_units: "business_unit_id",
  departments: "department_id",
  sections: "section_id",
  custom_position: "position_id",
  grade_levels: "grade_level_id",
};

const FIELD_LABELS: Record<string, string> = {
  sites: "Site",
  business_units: "Business unit",
  departments: "Department",
  sections: "Section",
  custom_position: "Position",
  grade_levels: "Grade level",
};

type WizardTab = "scope" | "form";

const TAB_LABELS: Record<WizardTab, string> = {
  scope: "PIP scope",
  form: "Form sections",
};
const TAB_ORDER: WizardTab[] = ["scope", "form"];

function labelForItem(items: OrgCustomListItem[] | undefined, id: string | null | undefined) {
  if (!id) return "—";
  return items?.find((i) => i.id === id)?.label ?? "Unknown";
}

type Props = {
  canAdd: boolean;
  canEdit: boolean;
};

export default function PipFormTemplateManager({ canAdd, canEdit }: Props) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "wizard">("list");
  const [activeTemplate, setActiveTemplate] = useState<PipFormTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<WizardTab>("scope");

  // ── Org-structure data (list types, items, mapping tree) — same source
  // as AppraisalGradeTemplatesManager — same six-level org chain. ──
  const { data: listTypes = [] } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => (await api.get("/organizational-structure/custom-list-types")).data.data,
  });

  const relevantListTypes = useMemo(
    () => listTypes.filter((lt) => (SCOPE_TABLES as readonly string[]).includes(lt.table_name)),
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
    return itemsForOrgMapField(tableName, itemsByTable[tableName] ?? [], selections, orgMaps);
  }

  function clearDownstream(fromTable: string) {
    const order = [...SCOPE_TABLES];
    const idx = order.indexOf(fromTable as (typeof SCOPE_TABLES)[number]);
    setSelections((prev) => {
      const next = { ...prev };
      order.slice(idx + 1).forEach((t) => delete next[t]);
      return next;
    });
  }

  // ── Templates list ──
  const { data: templates = [], isLoading: templatesLoading } = useQuery<PipFormTemplate[]>({
    queryKey: ["pip_form_templates"],
    queryFn: async () => (await api.get("/appraisal/pip-templates")).data.data,
  });

  const findOrCreateMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      SCOPE_TABLES.forEach((t) => {
        body[TABLE_TO_TEMPLATE_COLUMN[t]] = selections[t];
      });
      const res = await api.post("/appraisal/pip-templates", body);
      return res.data.data as PipFormTemplate;
    },
    onSuccess: (template) => {
      setActiveTemplate(template);
      queryClient.invalidateQueries({ queryKey: ["pip_form_templates"] });
      setActiveTab("form");
      toast.success("Scope saved — now build the PIP form sections.");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save scope.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/appraisal/pip-templates/${id}`),
    onSuccess: () => {
      toast.success("Template deleted.");
      queryClient.invalidateQueries({ queryKey: ["pip_form_templates"] });
    },
    onError: () => toast.error("Could not delete template."),
  });

  function backToList() {
    setActiveTemplate(null);
    setActiveTab("scope");
    setSelections({});
    setView("list");
  }

  function startNew() {
    setSelections({});
    setActiveTemplate(null);
    setActiveTab("scope");
    setView("wizard");
  }

  function openTemplate(t: PipFormTemplate) {
    setActiveTemplate(t);
    setSelections({
      sites: t.site_id,
      business_units: t.business_unit_id,
      departments: t.department_id,
      sections: t.section_id,
      custom_position: t.position_id,
      grade_levels: t.grade_level_id,
    });
    setActiveTab("form");
    setView("wizard");
  }

  function templateLabel(t: PipFormTemplate) {
    return [
      labelForItem(itemsByTable.sites, t.site_id),
      labelForItem(itemsByTable.business_units, t.business_unit_id),
      labelForItem(itemsByTable.departments, t.department_id),
      labelForItem(itemsByTable.sections, t.section_id),
      labelForItem(itemsByTable.custom_position, t.position_id),
    ].join(" / ");
  }

  function templateName(t: PipFormTemplate) {
    const position = labelForItem(itemsByTable.custom_position, t.position_id);
    const grade = labelForItem(itemsByTable.grade_levels, t.grade_level_id);
    return `${position} — ${grade}`;
  }

  if (view === "list") {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-gray-400 max-w-xl">
            Every PIP form is defined per exact combination of Site,
            Business unit, Department, Section, Position, and Grade level —
            matched against the employee&apos;s own org placement when a PIP
            is created for them after a poor final appraisal.
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
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-4 py-6 text-center space-y-2">
            <p className="text-sm text-gray-600">No PIP forms set up yet.</p>
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              Click <span className="font-medium text-gray-600">New template</span>, then pick
              Site, Business unit, Department, Section, Position, and Grade level — same as
              appraisal question sets. That scope is what appears in this table; only then can
              you add sections or prefill from a document.
            </p>
          </div>
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
                    <td className="px-3 py-2.5 font-medium text-gray-900">
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
  const complete = SCOPE_TABLES.every((t) => !!selections[t]);

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={backToList}
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

      {activeTab === "form" && activeTemplate && (
        <FormTab
          template={activeTemplate}
          scopeLabel={templateLabel(activeTemplate)}
          gradeLabel={labelForItem(itemsByTable.grade_levels, activeTemplate.grade_level_id)}
          canAdd={canAdd}
          canEdit={canEdit}
          otherTemplates={templates.filter((t) => t.id !== activeTemplate.id)}
          describeTemplate={(t) => `${templateName(t)} (${templateLabel(t)})`}
          onPublished={(updated) => setActiveTemplate(updated)}
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
  activeTemplate: PipFormTemplate | null;
  templateLabel: string | null;
  gradeLabel: string | null;
  onSave: () => void;
  saving: boolean;
  complete: boolean;
  canEdit: boolean;
}) {
  if (activeTemplate) {
    return (
      <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
        <p className="text-xs text-gray-400 mb-1">This PIP form applies to:</p>
        <p className="text-sm font-semibold text-gray-900">{templateLabel}</p>
        <p className="text-sm text-gray-600 mt-0.5">Grade: {gradeLabel}</p>
        <p className="text-xs text-gray-400 mt-2">
          Scope can&apos;t be changed once a template exists — delete it
          from the list and start a new one if this combination was wrong.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Step 1 — Pick org scope</h3>
        <p className="text-xs text-gray-400 mt-1">
          Every PIP form is tied to one exact Site / Business unit / Department /
          Section / Position / Grade level combination — the same rule as
          appraisal question sets. Pick the mapped path below; each dropdown
          only lists what is mapped under the value above it. After you save,
          this row appears in the templates table and you can build the form
          sections.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SCOPE_TABLES.map((table) => {
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
              <label className="text-xs font-medium text-gray-600 block mb-1">{FIELD_LABELS[table]}</label>
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

// ── Tab 2: Form builder ────────────────────────────────────────────────────

type DraftFile = { url: string; name: string; publicId: string | null } | null;

type PipTemplateDetail = { template: PipFormTemplate; versions: PipFormTemplateVersion[] };

function FormTab({
  template,
  scopeLabel,
  gradeLabel,
  canAdd,
  canEdit,
  otherTemplates,
  describeTemplate,
  onPublished,
}: {
  template: PipFormTemplate;
  scopeLabel: string;
  gradeLabel: string;
  canAdd: boolean;
  canEdit: boolean;
  otherTemplates: PipFormTemplate[];
  describeTemplate: (t: PipFormTemplate) => string;
  onPublished: (template: PipFormTemplate) => void;
}) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PipTemplateDetail>({
    queryKey: ["pip_form_template", template.id],
    queryFn: async () => (await api.get(`/appraisal/pip-templates/${template.id}`)).data.data,
    placeholderData: (prev) => prev,
  });

  const versions = data?.versions ?? [];
  const activeVersion = versions.find((v) => v.id === data?.template.active_version_id) ?? null;
  const latestVersion = versions[0] ?? null;

  const [uploading, setUploading] = useState(false);
  const [reusing, setReusing] = useState(false);
  const [reuseSelection, setReuseSelection] = useState("");
  const [draftSchema, setDraftSchema] = useState<PipFormSchema | null>(null);
  const [draftFile, setDraftFile] = useState<DraftFile>(null);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);

  // Once the version list loads, the draft always has something to show —
  // the latest version's structure if one exists, or a blank schema ready
  // for "Add section" if this is a brand-new template. Never gated behind
  // an upload, same as the appraisal question-set builder.
  const draft: PipFormSchema =
    draftSchema ?? latestVersion?.form_schema ?? createEmptyPipFormSchema();

  const saveMutation = useMutation({
    mutationFn: async (publish: boolean) => {
      return (
        await api.post(`/appraisal/pip-templates/${template.id}/versions`, {
          source_file_url: draftFile?.url ?? null,
          source_file_name: draftFile?.name ?? null,
          source_cloudinary_public_id: draftFile?.publicId ?? null,
          schema: draft,
          publish,
        })
      ).data.data as { version: PipFormTemplateVersion; template: PipFormTemplate | null };
    },
    onSuccess: (result, publish) => {
      toast.success(publish ? "PIP form published." : "Draft version saved.");

      queryClient.setQueryData<PipTemplateDetail>(["pip_form_template", template.id], (prev) => {
        const previous = prev ?? { template, versions: [] };
        const versions = [
          result.version,
          ...previous.versions.filter((v) => v.id !== result.version.id),
        ];
        const nextTemplate: PipFormTemplate = result.template
          ? { ...previous.template, ...result.template }
          : publish
            ? { ...previous.template, active_version_id: result.version.id }
            : previous.template;
        return { template: nextTemplate, versions };
      });

      if (publish && result.template) {
        onPublished(result.template);
      } else if (publish) {
        onPublished({ ...template, active_version_id: result.version.id });
      }

      // Keep the published schema on screen — clearing draft before the
      // refetch completes was leaving an empty form (looked like a blank
      // page) even though the toast said "published".
      setDraftSchema(result.version.form_schema);
      setDraftFile(null);
      setEditingVersionId(null);

      void queryClient.invalidateQueries({ queryKey: ["pip_form_template", template.id] });
      void queryClient.invalidateQueries({ queryKey: ["pip_form_templates"] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error ?? "Could not save the PIP form.");
    },
  });

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await uploadCareersFile(file, "PipFormTemplate", ACCEPT_PDF_WORD_OR_IMAGE);
      const extractRes = await api.post("/appraisal/pip-templates/extract", {
        file_url: uploaded.secure_url,
        file_name: uploaded.original_name,
      });
      const schema = extractRes.data.data?.schema as PipFormSchema | undefined;
      if (!schema) throw new Error("Couldn't read a form structure from that document.");
      setDraftFile({ url: uploaded.secure_url, name: uploaded.original_name, publicId: uploaded.public_id });
      setDraftSchema(schema);
      setEditingVersionId(null);
      toast.success("Form filled in from the document — edit anything below, then publish.");
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(e?.response?.data?.error ?? e?.message ?? "Couldn't read that document.");
    } finally {
      setUploading(false);
    }
  };

  const openVersionForEditing = (version: PipFormTemplateVersion) => {
    setDraftSchema(version.form_schema);
    setDraftFile(
      version.source_file_url
        ? { url: version.source_file_url, name: version.source_file_name ?? "document", publicId: version.source_cloudinary_public_id }
        : null,
    );
    setEditingVersionId(version.id);
  };

  const handleReuse = async (sourceId: string) => {
    setReusing(true);
    try {
      const res = await api.get(`/appraisal/pip-templates/${sourceId}`);
      const detail = res.data.data as PipTemplateDetail;
      const versions = detail.versions ?? [];
      const activeId = detail.template.active_version_id;
      const sourceVersion =
        (activeId ? versions.find((v) => v.id === activeId) : null) ?? versions[0] ?? null;
      const sections = sourceVersion?.form_schema?.sections ?? [];
      if (!sourceVersion || sections.length === 0) {
        toast.error("That template has no form sections to reuse.");
        return;
      }
      setDraftSchema(structuredClone(sourceVersion.form_schema));
      setDraftFile(null);
      setEditingVersionId(null);
      toast.success(`Reused PIP form sections from "${describeTemplate(detail.template)}".`);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error ?? "Could not load that template.");
    } finally {
      setReusing(false);
      setReuseSelection("");
    }
  };

  const setDraft = (updater: (prev: PipFormSchema) => PipFormSchema) =>
    setDraftSchema((prev) => updater(prev ?? draft));

  // ── Manual section/field/column editing ──
  const updateSection = (key: string, updater: (s: PipSection) => PipSection) =>
    setDraft((prev) => ({ ...prev, sections: prev.sections.map((s) => (s.key === key ? updater(s) : s)) }));

  const addSection = (kind: "fields" | "table") =>
    setDraft((prev) => ({ ...prev, sections: [...prev.sections, createBlankPipSection(kind)] }));

  const removeSection = (key: string) =>
    setDraft((prev) => ({ ...prev, sections: prev.sections.filter((s) => s.key !== key) }));

  const updateSectionTitle = (key: string, title: string) => updateSection(key, (s) => ({ ...s, title }));

  const addField = (sectionKey: string) =>
    updateSection(sectionKey, (s) => (s.kind === "fields" ? { ...s, fields: [...s.fields, createBlankPipField()] } : s));

  const addSystemField = (sectionKey: string, source: PipSystemFieldSourceKey) =>
    updateSection(sectionKey, (s) =>
      s.kind === "fields" ? { ...s, fields: [...s.fields, createSystemPipField(source)] } : s,
    );

  const updateField = (sectionKey: string, fieldKey: string, patch: Partial<PipField>) =>
    updateSection(sectionKey, (s) =>
      s.kind === "fields"
        ? { ...s, fields: s.fields.map((f) => (f.key === fieldKey ? ({ ...f, ...patch } as PipField) : f)) }
        : s,
    );

  const removeField = (sectionKey: string, fieldKey: string) =>
    updateSection(sectionKey, (s) => (s.kind === "fields" ? { ...s, fields: s.fields.filter((f) => f.key !== fieldKey) } : s));

  const addColumn = (sectionKey: string) =>
    updateSection(sectionKey, (s) => (s.kind === "table" ? { ...s, columns: [...s.columns, createBlankPipColumn()] } : s));

  const updateColumn = (sectionKey: string, columnKey: string, patch: Partial<PipTableColumn>) =>
    updateSection(sectionKey, (s) =>
      s.kind === "table" ? { ...s, columns: s.columns.map((c) => (c.key === columnKey ? { ...c, ...patch } : c)) } : s,
    );

  const removeColumn = (sectionKey: string, columnKey: string) =>
    updateSection(sectionKey, (s) => (s.kind === "table" ? { ...s, columns: s.columns.filter((c) => c.key !== columnKey) } : s));

  const updateMinRows = (sectionKey: string, minRows: number) =>
    updateSection(sectionKey, (s) => (s.kind === "table" ? { ...s, minRows } : s));

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
        <p className="text-xs text-gray-400 mb-1">Step 2 — PIP form for:</p>
        <p className="text-sm font-semibold text-gray-900">{scopeLabel}</p>
        <p className="text-sm text-gray-600 mt-0.5">Grade: {gradeLabel}</p>
      </div>

      {/* ── Current published version ── */}
      {activeVersion ? (
        <div className="border border-green-200 bg-green-50/60 rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <p className="text-sm font-semibold text-green-800">Active — version {activeVersion.version_number}</p>
              </div>
              {activeVersion.source_file_name && (
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                  <FileText className="w-3.5 h-3.5" />
                  <a
                    href={activeVersion.source_file_url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline flex items-center gap-1"
                  >
                    {activeVersion.source_file_name}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {activeVersion.published_by_name ? `Published by ${activeVersion.published_by_name}` : "Published"}
                {activeVersion.published_at ? ` on ${new Date(activeVersion.published_at).toLocaleDateString()}` : ""}
              </p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => openVersionForEditing(activeVersion)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-green-300 text-green-800 hover:bg-green-100"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit manually
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-4 text-sm text-amber-800">
          No PIP form has been published for this scope yet — add sections
          below or prefill from the reference document, then publish.
        </div>
      )}

      {(canAdd || canEdit) && (
        <>
          {canEdit && otherTemplates.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {reusing ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading form…
                </span>
              ) : null}
              <select
                value={reuseSelection}
                disabled={reusing}
                onChange={(e) => {
                  const id = e.target.value;
                  setReuseSelection(id);
                  if (id) void handleReuse(id);
                }}
                className="h-9 rounded-lg border border-gray-200 px-3 text-xs text-gray-600 bg-white disabled:opacity-60"
              >
                <option value="">Reuse PIP setup…</option>
                {otherTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {describeTemplate(t)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── Prefill from upload ── */}
          <div className="rounded-lg border border-dashed border-gray-300 p-3">
            <label className="flex flex-wrap items-center gap-2 cursor-pointer">
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin text-red-600" />
              ) : (
                <Sparkles className="w-4 h-4 text-red-600" />
              )}
              <span className="text-sm font-medium text-red-700">
                {uploading ? "Reading document…" : "Prefill with WillsOne Intel"}
              </span>
              <span className="text-xs text-gray-400">
                — upload the PIP document (Word, PDF, or image) to fill in sections and fields
                automatically. You can edit everything afterward.
              </span>
              <input
                type="file"
                className="sr-only"
                accept={ACCEPT_PDF_WORD_OR_IMAGE}
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) handleFile(file);
                }}
              />
            </label>
          </div>

          {/* ── Manual editor — always available once the template exists ── */}
          <div className="space-y-4">
            {draftFile && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <Sparkles className="w-3.5 h-3.5" />
                {editingVersionId
                  ? `Editing version's structure — sourced from "${draftFile.name}".`
                  : `Draft filled in from "${draftFile.name}" — add, remove, or relabel anything below.`}
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Form title</label>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Intro / scope text (optional)
              </label>
              <textarea
                value={draft.intro ?? ""}
                onChange={(e) => setDraft((prev) => ({ ...prev, intro: e.target.value || null }))}
                rows={2}
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-gray-900">PIP form setup</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Publish one PIP form per position and org placement (same scope as the appraisal
                question set). When a PIP is started, employee details and performance gaps are
                filled from the appraisal.
              </p>
              {draft.sections.length > 0 && !hasGapChain(draft) && (
                <p className="text-[11px] text-amber-800">
                  Include Performance Gaps, Root-Cause Analysis, and Support &amp; Development
                  sections to match the standard PIP document.
                </p>
              )}
            </div>

            {draft.sections.length === 0 ? (
              <p className="text-xs text-gray-400 italic">
                No sections yet — click &quot;Add fields section&quot; or &quot;Add table section&quot; below, or
                prefill from the reference document above.
              </p>
            ) : (
              <div className="space-y-4">
                {draft.sections.map((section) => {
                  const role = detectPipSectionRole(section);
                  const roleLabel = pipSectionRoleLabel(role);
                  return (
                  <div key={section.key} className="rounded-lg border border-gray-200 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {section.kind === "table" ? (
                            <TableIcon className="w-3.5 h-3.5 text-gray-400" />
                          ) : (
                            <ListChecks className="w-3.5 h-3.5 text-gray-400" />
                          )}
                          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                            {section.kind === "table" ? "Table section — title" : "Section — title"}
                          </label>
                          {roleLabel && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                              {roleLabel}
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={section.title}
                          onChange={(e) => updateSectionTitle(section.key, e.target.value)}
                          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                        />
                        <label className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                          Who fills this section
                        </label>
                        <select
                          value={section.audience ?? "all"}
                          onChange={(e) =>
                            updateSection(section.key, (s) => ({
                              ...s,
                              audience: e.target.value as PipSection["audience"],
                            }))
                          }
                          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 bg-white"
                        >
                          {PIP_SECTION_AUDIENCE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSection(section.key)}
                        className="mt-5 p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {section.kind === "fields" ? (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Fields</p>
                        <div className="space-y-2">
                          {section.fields.map((field) =>
                            isSystemField(field) ? (
                              <div
                                key={field.key}
                                className="flex items-center gap-2 border border-gray-100 bg-gray-50 rounded-lg px-3 py-2"
                              >
                                <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <div className="flex-1">
                                  <p className="text-sm text-gray-700">{pipFieldLabel(field)}</p>
                                  <p className="text-[11px] text-gray-400">
                                    Auto-filled from the employee/appraisal record — not editable
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeField(section.key, field.key)}
                                  className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 shrink-0"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div key={field.key} className="flex flex-wrap gap-2 items-start">
                                <input
                                  type="text"
                                  value={field.label}
                                  onChange={(e) => updateField(section.key, field.key, { label: e.target.value })}
                                  placeholder="Field label"
                                  className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                />
                                <select
                                  value={field.type}
                                  onChange={(e) =>
                                    updateField(section.key, field.key, {
                                      type: e.target.value as PipField["type"],
                                    })
                                  }
                                  className="border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-600 bg-white"
                                >
                                  {PIP_FIELD_TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                {field.type === "select" && !isSystemField(field) && (
                                  <CommaSeparatedOptionsInput
                                    options={field.options ?? []}
                                    onChange={(options) =>
                                      updateField(section.key, field.key, { options })
                                    }
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeField(section.key, field.key)}
                                  className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 shrink-0"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ),
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => addField(section.key)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add field
                          </button>
                          {(() => {
                            const usedSources = new Set(
                              section.fields.filter(isSystemField).map((f) => f.systemSource),
                            );
                            const available = PIP_SYSTEM_FIELD_SOURCES.filter((s) => !usedSources.has(s.key));
                            if (available.length === 0) return null;
                            return (
                              <select
                                value=""
                                onChange={(e) => {
                                  const source = e.target.value as PipSystemFieldSourceKey;
                                  if (source) addSystemField(section.key, source);
                                }}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-500 bg-white"
                                title="Add a locked field auto-filled from tracked employee/appraisal data"
                              >
                                <option value="">+ Add tracked field…</option>
                                {available.map((s) => (
                                  <option key={s.key} value={s.key}>
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                            );
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Columns</p>
                        <div className="space-y-2">
                          {section.columns.map((column) => (
                            <div key={column.key} className="flex flex-wrap gap-2 items-start">
                              <div className="flex-1 min-w-[140px]">
                                <input
                                  type="text"
                                  value={column.label}
                                  onChange={(e) => updateColumn(section.key, column.key, { label: e.target.value })}
                                  placeholder="Column label"
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                />
                                {isAutoIncrementColumn(column) && (
                                  <p className="text-[10px] text-gray-500 mt-0.5">
                                    Auto-numbered on the live form
                                  </p>
                                )}
                                {isSupportActionColumn(column) && (
                                  <div className="mt-1 space-y-1">
                                    <p className="text-[10px] text-gray-500">
                                      Prefilled on the live PIP — one default per gap (Training, Coaching, etc.)
                                    </p>
                                    {column.type !== "select" && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateColumn(section.key, column.key, {
                                            type: "select",
                                            options: [...DEFAULT_PIP_SUPPORT_ACTION_OPTIONS],
                                          })
                                        }
                                        className="text-[10px] font-semibold text-red-600 hover:text-red-700"
                                      >
                                        Use default support types
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                              <select
                                value={column.type ?? "text"}
                                onChange={(e) =>
                                  updateColumn(section.key, column.key, {
                                    type: e.target.value as PipTableColumn["type"],
                                  })
                                }
                                className="border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-600 bg-white"
                                title="Column input type on the live PIP form"
                              >
                                {PIP_FIELD_TYPE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              {column.type === "select" && (
                                <CommaSeparatedOptionsInput
                                  options={column.options ?? []}
                                  onChange={(options) =>
                                    updateColumn(section.key, column.key, { options })
                                  }
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => removeColumn(section.key, column.key)}
                                className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => addColumn(section.key)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add column
                          </button>
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
                            Starts with
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={section.minRows}
                              onChange={(e) =>
                                updateMinRows(section.key, Math.max(0, Math.min(20, Number(e.target.value) || 0)))
                              }
                              className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center"
                            />
                            row(s)
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => addSection("fields")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add fields section
              </button>
              <button
                type="button"
                onClick={() => addSection("table")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50"
              >
                <Plus className="w-3.5 h-3.5" /> Add table section
              </button>
            </div>

            <div className="flex items-center gap-2 justify-end pt-2 border-t border-gray-100">
              {(draftSchema || draftFile) && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftSchema(null);
                    setDraftFile(null);
                    setEditingVersionId(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-50"
                >
                  Discard changes
                </button>
              )}
              <button
                type="button"
                disabled={saveMutation.isPending || draft.sections.length === 0}
                onClick={() => saveMutation.mutate(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Save as draft
              </button>
              <button
                type="button"
                disabled={saveMutation.isPending || draft.sections.length === 0}
                onClick={() => saveMutation.mutate(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                {saveMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Publish
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Version history ── */}
      {versions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Version history</p>
          <div className="space-y-1.5">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-xs border border-gray-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 text-gray-600">
                  <span className="font-semibold">v{v.version_number}</span>
                  {v.source_file_url ? (
                    <a href={v.source_file_url} target="_blank" rel="noreferrer" className="hover:underline">
                      {v.source_file_name}
                    </a>
                  ) : (
                    <span className="text-gray-400 italic">Built manually</span>
                  )}
                  {v.id === data?.template.active_version_id ? (
                    <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold">
                      Active
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold">
                      {v.published_at ? "Superseded" : "Draft"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">{new Date(v.created_at).toLocaleDateString()}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openVersionForEditing(v)}
                      className="text-red-600 hover:text-red-700 font-medium"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
