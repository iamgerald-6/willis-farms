"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
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

      <div className="space-y-3">
        {draft.sections.map((section) => (
          <div key={section.key} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 flex items-center gap-2">
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
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="p-3 space-y-2">
              {section.kind === "fields" && section.key === "investigations" ? (
                <MedicalInvestigationDefsEditor
                  defs={getInvestigationDefs(draft)}
                  onChange={(defs) => setDraftSchema(setInvestigationDefs(draft, defs) as MedicalFormSchema)}
                  canEdit={canEdit}
                />
              ) : section.kind === "fields" && section.key === "clinical_vitals" ? (
                <div className="rounded-lg border border-dashed border-teal-200 bg-teal-50/50 p-3 text-xs text-teal-900 leading-relaxed mb-2">
                  <p className="font-semibold mb-1">Height, weight, BMI, blood pressure, pulse, visual acuity and hearing are built-in</p>
                  <p>
                    Blood pressure is grouped as systolic/diastolic (mmHg), hearing is Pass/Fail per
                    ear, and BMI is calculated automatically. You can still edit labels or add extra
                    fields below if needed.
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
              ) : section.key === "investigations" ? null : (
                section.fields.map((field) =>
                  isSystemField(field) ? null : (
                    <div key={field.key} className="flex flex-wrap gap-2 items-end border-b border-gray-50 pb-2">
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
                                  fields: s.fields.map((f) =>
                                    f.key === field.key && !isSystemField(f)
                                      ? ({ ...f, type: e.target.value as PipField["type"] } as PipField)
                                      : f,
                                  ),
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
                    </div>
                  ),
                )
              )}
              {canEdit && section.kind === "fields" && section.key !== "investigations" && (
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
        ))}
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
