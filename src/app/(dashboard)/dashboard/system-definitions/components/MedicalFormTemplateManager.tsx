"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  createBlankMedicalField,
  createBlankMedicalSection,
  getInvestigationDefs,
  setInvestigationDefs,
  type MedicalFormSchema,
  type MedicalFormTemplate,
  type MedicalFormTemplateVersion,
  type MedicalSection,
  MEDICAL_FIELD_TYPE_OPTIONS,
} from "@/lib/medical/medicalFormSchema";
import { getDefaultMedicalFormSchema } from "@/lib/medical/medicalFormDefaults";
import { isSystemField } from "@/lib/appraisal/pipFormSchema";
import type { PipField } from "@/lib/appraisal/pipFormSchema";
import MedicalInvestigationDefsEditor from "./MedicalInvestigationDefsEditor";

type Props = { canEdit: boolean };

function parseOptionsList(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Comma-separated options — parses on blur so typing "Pass, Fail" doesn't eat the comma mid-keystroke. */
function CommaSeparatedOptionsInput({
  options,
  onChange,
  placeholder,
  className,
  readOnly,
}: {
  options: string[];
  onChange: (options: string[]) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const committed = options.join(", ");

  useEffect(() => {
    setDraft(null);
  }, [committed]);

  return (
    <div className="w-full">
      <input
        type="text"
        readOnly={readOnly}
        value={draft ?? committed}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (readOnly) return;
          const raw = draft ?? committed;
          onChange(parseOptionsList(raw));
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        placeholder={placeholder ?? "Pass, Fail  or  Normal, Abnormal, N/A"}
        className={className}
      />
      {!readOnly ? (
        <p className="text-[10px] text-gray-400 mt-0.5">
          Separate choices with commas. Press Enter or click away to apply.
        </p>
      ) : null}
    </div>
  );
}

export default function MedicalFormTemplateManager({ canEdit }: Props) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["medical_form_template"],
    queryFn: async () => {
      const res = await api.get("/careers/medical-form-templates");
      return res.data.data as {
        template: MedicalFormTemplate;
        versions: MedicalFormTemplateVersion[];
      };
    },
  });

  const versions = data?.versions ?? [];
  const activeVersion = versions.find((v) => v.id === data?.template.active_version_id) ?? versions[0];
  const [draftSchema, setDraftSchema] = useState<MedicalFormSchema | null>(null);
  const [draggingSectionKey, setDraggingSectionKey] = useState<string | null>(null);
  const [draggingField, setDraggingField] = useState<{
    sectionKey: string;
    fieldKey: string;
  } | null>(null);

  const draft = draftSchema ?? activeVersion?.form_schema ?? getDefaultMedicalFormSchema();

  const saveMutation = useMutation({
    mutationFn: async (publish: boolean) => {
      const res = await api.post("/careers/medical-form-templates/versions", {
        schema: draft,
        publish,
      });
      return res.data.data as MedicalFormTemplateVersion;
    },
    onSuccess: (_v, publish) => {
      toast.success(publish ? "Medical form published." : "Draft saved.");
      setDraftSchema(null);
      void queryClient.invalidateQueries({ queryKey: ["medical_form_template"] });
    },
    onError: (err: unknown) => {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Could not save.",
      );
    },
  });

  const setDraft = (updater: (prev: MedicalFormSchema) => MedicalFormSchema) =>
    setDraftSchema((prev) => updater(prev ?? draft));

  const updateSection = (key: string, updater: (s: MedicalSection) => MedicalSection) =>
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.key === key ? updater(s) : s)),
    }));

  const removeField = (sectionKey: string, fieldKey: string) =>
    updateSection(sectionKey, (s) =>
      s.kind === "fields" ? { ...s, fields: s.fields.filter((f) => f.key !== fieldKey) } : s,
    );

  const reorderSectionFields = (sectionKey: string, dragIndex: number, targetIndex: number) => {
    if (dragIndex === targetIndex) return;
    updateSection(sectionKey, (s) => {
      if (s.kind !== "fields") return s;
      const next = [...s.fields];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return { ...s, fields: next };
    });
  };

  const reorderSections = (dragIndex: number, targetIndex: number) => {
    if (dragIndex === targetIndex) return;
    setDraft((prev) => {
      const next = [...prev.sections];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return { ...prev, sections: next };
    });
  };

  const handleSectionDrop = (targetIndex: number) => {
    if (!draggingSectionKey) return;
    const dragIndex = draft.sections.findIndex((s) => s.key === draggingSectionKey);
    setDraggingSectionKey(null);
    if (dragIndex === -1 || dragIndex === targetIndex) return;
    reorderSections(dragIndex, targetIndex);
  };

  const handleFieldDrop = (sectionKey: string, targetIndex: number) => {
    if (!draggingField || draggingField.sectionKey !== sectionKey) return;
    const section = draft.sections.find((s) => s.key === sectionKey);
    if (!section || section.kind !== "fields") return;
    const dragIndex = section.fields.findIndex((f) => f.key === draggingField.fieldKey);
    setDraggingField(null);
    if (dragIndex === -1 || dragIndex === targetIndex) return;
    reorderSectionFields(sectionKey, dragIndex, targetIndex);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          Published version{" "}
          {activeVersion ? `v${activeVersion.version_number}` : "—"}. Changes apply to new hospital
          links only; submitted examinations keep their original form until HR resends.
        </p>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDraftSchema(getDefaultMedicalFormSchema())}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Reset to reference layout
            </button>
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(false)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" /> Save draft
            </button>
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Publish
            </button>
          </div>
        )}
      </div>

      <label className="block text-xs">
        <span className="text-gray-500">Form title</span>
        <input
          type="text"
          readOnly={!canEdit}
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          value={draft.title}
          onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
        />
      </label>

      <label className="block text-xs">
        <span className="text-gray-500">Introduction</span>
        <textarea
          readOnly={!canEdit}
          className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[72px]"
          value={draft.intro ?? ""}
          onChange={(e) => setDraft((p) => ({ ...p, intro: e.target.value }))}
        />
      </label>

      {canEdit && draft.sections.length > 1 && (
        <p className="text-xs text-gray-400">
          Drag <GripVertical className="w-3 h-3 inline-block -mt-0.5" /> on a section title to reorder
          parts of the form. Drag fields within a section to change the order on the hospital form.
        </p>
      )}

      <div className="space-y-3">
        {draft.sections.map((section, sectionIndex) => {
          const editableFields =
            section.kind === "fields" ? section.fields.filter((f) => !isSystemField(f)) : [];

          return (
          <div
            key={section.key}
            className={`border border-gray-200 rounded-xl overflow-hidden ${
              draggingSectionKey === section.key ? "opacity-60" : ""
            }`}
            onDragOver={(e) => {
              if (canEdit && draggingSectionKey) e.preventDefault();
            }}
            onDrop={() => canEdit && draggingSectionKey && handleSectionDrop(sectionIndex)}
          >
            <div className="px-3 py-2 bg-gray-50 flex items-center gap-2">
              {canEdit && (
                <div
                  draggable
                  onDragStart={() => setDraggingSectionKey(section.key)}
                  onDragEnd={() => setDraggingSectionKey(null)}
                  className="flex items-center text-gray-300 cursor-grab active:cursor-grabbing shrink-0"
                  title="Drag to reorder section"
                >
                  <GripVertical className="w-4 h-4" />
                </div>
              )}
              <input
                type="text"
                readOnly={!canEdit}
                className="flex-1 text-sm font-semibold bg-transparent border-none focus:outline-none"
                value={section.title}
                onChange={(e) => updateSection(section.key, (s) => ({ ...s, title: e.target.value }))}
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      sections: p.sections.filter((s) => s.key !== section.key),
                    }))
                  }
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                  title="Remove section"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="p-3 space-y-2">
              {section.kind === "fields" && section.key === "investigations" ? (
                <>
                  <div className="rounded-lg border border-dashed border-teal-200 bg-teal-50/50 p-3 text-xs text-teal-900 leading-relaxed mb-2">
                    <p className="font-semibold mb-1">Document uploads are built into Part 4</p>
                    <p>
                      Hospital staff can attach X-ray images and laboratory reports (JPEG, PNG, or
                      PDF) below the investigations table on the hospital form.
                    </p>
                  </div>
                  <MedicalInvestigationDefsEditor
                    defs={getInvestigationDefs(draft)}
                    onChange={(defs) => setDraftSchema(setInvestigationDefs(draft, defs) as MedicalFormSchema)}
                    canEdit={canEdit}
                  />
                </>
              ) : section.kind === "fields" && section.key === "supporting_documents" ? null : section.kind === "fields" && section.key === "clinical_vitals" ? (
                <div className="rounded-lg border border-dashed border-teal-200 bg-teal-50/50 p-3 text-xs text-teal-900 leading-relaxed mb-2">
                  <p className="font-semibold mb-1">Height, weight, BMI, blood pressure, pulse, visual acuity and hearing are built-in</p>
                  <p>
                    Blood pressure is grouped as systolic/diastolic (mmHg). Visual acuity and hearing
                    are Pass/Fail per eye/ear — if Fail is selected on the hospital form, a reason
                    textarea appears and is required. BMI is calculated automatically. You can still
                    edit labels, choice lists, or add extra fields below.
                  </p>
                </div>
              ) : null}
              {section.kind !== "fields" ? (
                <div className="space-y-1">
                  {section.columns.map((col) => (
                    <div key={col.key} className="flex gap-2 text-xs">
                      <span className="text-gray-400 w-24">{col.label}</span>
                      <span className="text-gray-600">{col.type ?? "text"}</span>
                    </div>
                  ))}
                  <p className="text-[10px] text-gray-400">Min rows: {section.minRows}</p>
                </div>
              ) : section.key === "investigations" || section.key === "supporting_documents" ? null : (
                <>
                  {canEdit && editableFields.length > 1 && (
                    <p className="text-[10px] text-gray-400 mb-1">
                      Drag <GripVertical className="w-3 h-3 inline-block -mt-0.5" /> to reorder fields
                      in this section.
                    </p>
                  )}
                  {section.fields.map((field, fieldIndex) =>
                    isSystemField(field) ? null : (
                      <div
                        key={field.key}
                        className={`space-y-2 border-b border-gray-50 pb-2 ${
                          draggingField?.fieldKey === field.key ? "opacity-40" : ""
                        }`}
                        onDragOver={(e) => {
                          if (canEdit && draggingField?.sectionKey === section.key) {
                            e.preventDefault();
                          }
                        }}
                        onDrop={() => canEdit && handleFieldDrop(section.key, fieldIndex)}
                      >
                        <div className="flex flex-wrap gap-2 items-end">
                          {canEdit && (
                            <div
                              draggable
                              onDragStart={() =>
                                setDraggingField({ sectionKey: section.key, fieldKey: field.key })
                              }
                              onDragEnd={() => setDraggingField(null)}
                              className="flex items-center pb-1 text-gray-300 cursor-grab active:cursor-grabbing shrink-0"
                              title="Drag to reorder field"
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>
                          )}
                          <input
                            type="text"
                            readOnly={!canEdit}
                            className="flex-1 min-w-[140px] border border-gray-200 rounded px-2 py-1 text-xs"
                            value={field.label}
                            onChange={(e) =>
                              updateSection(section.key, (s) =>
                                s.kind === "fields"
                                  ? {
                                      ...s,
                                      fields: s.fields.map((f) =>
                                        f.key === field.key && !isSystemField(f)
                                          ? { ...f, label: e.target.value }
                                          : f,
                                      ),
                                    }
                                  : s,
                              )
                            }
                          />
                          <select
                            disabled={!canEdit}
                            className="border border-gray-200 rounded px-2 py-1 text-xs"
                            value={field.type}
                            onChange={(e) =>
                              updateSection(section.key, (s) =>
                                s.kind === "fields"
                                  ? {
                                      ...s,
                                      fields: s.fields.map((f) => {
                                        if (f.key !== field.key || isSystemField(f)) return f;
                                        const nextType = e.target.value as PipField["type"];
                                        return {
                                          ...f,
                                          type: nextType,
                                          ...(nextType === "select" ? { options: f.options ?? [] } : {}),
                                        } as PipField;
                                      }),
                                    }
                                  : s,
                              )
                            }
                          >
                            {MEDICAL_FIELD_TYPE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <label className="text-xs flex items-center gap-1">
                            <input
                              type="checkbox"
                              disabled={!canEdit}
                              checked={field.required === true}
                              onChange={(e) =>
                                updateSection(section.key, (s) =>
                                  s.kind === "fields"
                                    ? {
                                        ...s,
                                        fields: s.fields.map((f) =>
                                          f.key === field.key && !isSystemField(f)
                                            ? { ...f, required: e.target.checked }
                                            : f,
                                        ),
                                      }
                                    : s,
                                )
                              }
                            />
                            Required
                          </label>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => removeField(section.key, field.key)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded shrink-0"
                              title="Remove field"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {field.type === "select" ? (
                          <CommaSeparatedOptionsInput
                            readOnly={!canEdit}
                            options={field.options ?? []}
                            onChange={(options) =>
                              updateSection(section.key, (s) =>
                                s.kind === "fields"
                                  ? {
                                      ...s,
                                      fields: s.fields.map((f) =>
                                        f.key === field.key && !isSystemField(f)
                                          ? { ...f, options }
                                          : f,
                                      ),
                                    }
                                  : s,
                              )
                            }
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                          />
                        ) : null}
                      </div>
                    ),
                  )}
                </>
              )}
              {canEdit &&
                section.kind === "fields" &&
                section.key !== "investigations" &&
                section.key !== "supporting_documents" && (
                <button
                  type="button"
                  onClick={() =>
                    updateSection(section.key, (s) =>
                      s.kind === "fields"
                        ? { ...s, fields: [...s.fields, createBlankMedicalField()] }
                        : s,
                    )
                  }
                  className="text-xs text-red-700 font-medium"
                >
                  + Add field
                </button>
              )}
            </div>
          </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              setDraft((p) => ({
                ...p,
                sections: [...p.sections, createBlankMedicalSection("fields")],
              }))
            }
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium border border-dashed border-gray-300 rounded-lg hover:border-red-300"
          >
            <Plus className="w-3.5 h-3.5" /> Add field section
          </button>
          <button
            type="button"
            onClick={() =>
              setDraft((p) => ({
                ...p,
                sections: [...p.sections, createBlankMedicalSection("table")],
              }))
            }
            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium border border-dashed border-gray-300 rounded-lg hover:border-red-300"
          >
            <Plus className="w-3.5 h-3.5" /> Add table section
          </button>
        </div>
      )}

      {draft.sections.length === 0 && (
        <p className="text-xs text-gray-400">No sections — add one or reset to the reference layout.</p>
      )}
    </div>
  );
}
