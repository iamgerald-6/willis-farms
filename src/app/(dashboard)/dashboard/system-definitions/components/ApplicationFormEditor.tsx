"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { ModuleBusinessLogic, SystemOption } from "@/lib/systemDefinitions";
import {
  parseApplicationFieldRules,
  type ApplicationFieldStep,
  type ApplicationFieldType,
} from "@/lib/careers/applicationFormSchema";
import {
  BUILTIN_APPLICATION_FORM_STEPS,
  DEFAULT_REQUIRED_REFEREE_COUNT,
  MAX_REFEREE_COUNT,
  isRefereeSystemOption,
  REFEREE_CONTACT_PARTS,
  normalizeApplicationFormConfig,
  resolveApplicationFormSteps,
  resolveRequiredRefereeCount,
  type ApplicationFormConfig,
  type ApplicationFormStepDef,
} from "@/lib/systemDefinitions/applicationFormConfig";
import {
  RECRUITMENT_APPLICATION_FIELDS_LIST,
  RECRUITMENT_MODULE_ID,
} from "@/lib/systemDefinitions/recruitmentDefaults";

async function fetchModuleConfigApi(moduleId: string) {
  const res = await api.get(
    `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
  );
  return res.data.data as { businessLogic: ModuleBusinessLogic };
}

function slugifyFieldKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

function slugifyStepId(label: string): string {
  return slugifyFieldKey(label).slice(0, 32);
}

type ApplicationFormEditorProps = {
  moduleId: string;
  canAdd?: boolean;
  canEdit?: boolean;
};

const FIELD_TYPES: ApplicationFieldType[] = [
  "text",
  "email",
  "phone",
  "date",
  "select",
  "textarea",
  "file",
  "ghana_card",
  "work_history",
  "work_fields",
  "education_history",
  "education_fields",
];

type DraftRules = {
  step: ApplicationFieldStep;
  fieldKey: string;
  fieldType: ApplicationFieldType;
  required: boolean;
  options: string;
  showWhenField: string;
  showWhenMode: "equals" | "notEquals";
  showWhenValue: string;
  accept: string;
  multiple: boolean;
};

function rulesToDraft(rules: ReturnType<typeof parseApplicationFieldRules>): DraftRules {
  return {
    step: rules.step,
    fieldKey: rules.fieldKey,
    fieldType: rules.fieldType,
    required: rules.required ?? false,
    options: (rules.options ?? []).join(", "),
    showWhenField: rules.showWhen?.field ?? "",
    showWhenMode: rules.showWhen?.notEquals !== undefined ? "notEquals" : "equals",
    showWhenValue: rules.showWhen?.notEquals ?? rules.showWhen?.equals ?? "",
    accept: rules.accept ?? "",
    multiple: rules.multiple ?? false,
  };
}

/**
 * Builds the rules object to save. `base` should be the field's raw,
 * unparsed rules from the database (or {} when creating a new field) —
 * everything in it is preserved except the specific keys this form
 * actually manages. This form only surfaces a subset of possible rules
 * properties, so rebuilding from scratch on every save silently dropped
 * anything it didn't know about (e.g. this used to always lose "multiple"
 * and "notEquals"-based showWhen conditions on any edit, even unrelated
 * ones like a label change).
 */
function draftToRules(
  draft: DraftRules,
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  const rules: Record<string, unknown> = {
    ...base,
    step: draft.step,
    fieldKey: draft.fieldKey.trim(),
    fieldType: draft.fieldType,
    required: draft.required,
  };
  if (draft.fieldType === "select" && draft.options.trim()) {
    rules.options = draft.options.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (draft.showWhenField.trim() && draft.showWhenValue.trim()) {
    rules.showWhen = {
      field: draft.showWhenField.trim(),
      ...(draft.showWhenMode === "notEquals"
        ? { notEquals: draft.showWhenValue.trim() }
        : { equals: draft.showWhenValue.trim() }),
    };
  } else if (!draft.showWhenField.trim()) {
    delete rules.showWhen;
  }
  if (draft.fieldType === "file" && draft.accept.trim()) {
    rules.accept = draft.accept.trim();
  }
  if (draft.fieldType === "file" && draft.multiple) {
    rules.multiple = true;
  } else {
    delete rules.multiple;
  }
  return rules;
}

export default function ApplicationFormEditor({
  moduleId,
  canAdd = true,
  canEdit = true,
}: ApplicationFormEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["system_options", moduleId, RECRUITMENT_APPLICATION_FIELDS_LIST];
  const moduleQueryKey = ["system_module_config", moduleId];

  const [layoutDraft, setLayoutDraft] = useState<ApplicationFormConfig>({});
  const [newStepLabel, setNewStepLabel] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDraft, setNewDraft] = useState<DraftRules>({
    step: "personal",
    fieldKey: "",
    fieldType: "text",
    required: false,
    options: "",
    showWhenField: "",
    showWhenMode: "equals",
    showWhenValue: "",
    accept: "",
    multiple: false,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDraft, setEditDraft] = useState<DraftRules | null>(null);

  const { data: options = [], isLoading } = useQuery<SystemOption[]>({
    queryKey,
    queryFn: async () => {
      const res = await api.get("/system-definitions/options", {
        params: {
          module_id: moduleId,
          option_list: RECRUITMENT_APPLICATION_FIELDS_LIST,
          include_inactive: true,
        },
      });
      return res.data.data as SystemOption[];
    },
    enabled: moduleId === RECRUITMENT_MODULE_ID,
  });

  const { data: businessLogic, isLoading: configLoading } = useQuery({
    queryKey: moduleQueryKey,
    queryFn: () => fetchModuleConfigApi(moduleId),
    select: (data) => data.businessLogic,
    enabled: moduleId === RECRUITMENT_MODULE_ID,
  });

  useEffect(() => {
    const saved = businessLogic?.applicationFormConfig;
    if (saved) {
      setLayoutDraft(normalizeApplicationFormConfig(saved));
    } else {
      setLayoutDraft({
        requiredRefereeCount: DEFAULT_REQUIRED_REFEREE_COUNT,
        steps: BUILTIN_APPLICATION_FORM_STEPS.map((s) => ({ ...s })),
      });
    }
  }, [businessLogic]);

  const editorSteps = useMemo(
    () => resolveApplicationFormSteps(layoutDraft),
    [layoutDraft],
  );

  const saveLayoutMutation = useMutation({
    mutationFn: async (payload: ApplicationFormConfig) => {
      const current = (await fetchModuleConfigApi(moduleId)).businessLogic;
      return api.patch(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
        {
          business_logic: {
            ...current,
            applicationFormConfig: payload,
          },
        },
      );
    },
    onSuccess: () => {
      toast.success("Application form layout saved.");
      queryClient.invalidateQueries({ queryKey: moduleQueryKey });
    },
    onError: () => toast.error("Could not save form layout."),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: (payload: {
      module_id: string;
      option_list: string;
      label: string;
      legacy_value: string;
      rules: Record<string, unknown>;
    }) => api.post("/system-definitions/options", payload),
    onSuccess: () => {
      toast.success("Field added.");
      setShowAdd(false);
      setNewLabel("");
      invalidate();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not add field.");
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Record<string, unknown>;
    }) => api.patch(`/system-definitions/options/${encodeURIComponent(id)}`, patch),
    onSuccess: () => {
      toast.success("Field updated.");
      setEditingId(null);
      invalidate();
    },
    onError: () => toast.error("Could not save field."),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/system-definitions/options/${encodeURIComponent(id)}`, {
        is_active: false,
      }),
    onSuccess: () => {
      toast.success("Field removed.");
      invalidate();
    },
    onError: () => toast.error("Could not remove field."),
  });

  const orphanRefereeOptions = useMemo(
    () => options.filter((o) => o.is_active && isRefereeSystemOption(o)),
    [options],
  );

  const cleanupRefereeOptionsMutation = useMutation({
    mutationFn: async (rows: SystemOption[]) => {
      await Promise.all(
        rows.map((row) =>
          api.patch(`/system-definitions/options/${encodeURIComponent(row.id)}`, {
            is_active: false,
          }),
        ),
      );
    },
    onSuccess: () => {
      toast.success("Stray referee fields removed.");
      invalidate();
    },
    onError: () => toast.error("Could not remove stray referee fields."),
  });

  if (moduleId !== RECRUITMENT_MODULE_ID) return null;

  const requiredRefereeCount = resolveRequiredRefereeCount(layoutDraft);

  const editableOptions = options.filter((o) => !isRefereeSystemOption(o));

  const grouped = editorSteps.map((stepDef) => ({
    step: stepDef.id,
    label: stepDef.label,
    fields: editableOptions
      .filter(
        (o) =>
          parseApplicationFieldRules(o.rules as Record<string, unknown>).step === stepDef.id,
      )
      .sort((a, b) => a.sort_order - b.sort_order),
  }));

  const allStepOptions = [
    ...editorSteps.map((s) => ({ id: s.id, label: s.label })),
    ...BUILTIN_APPLICATION_FORM_STEPS.filter(
      (b) => !editorSteps.some((s) => s.id === b.id),
    ).map((b) => ({ id: b.id, label: b.label })),
  ];

  const updateLayoutStep = (stepId: string, patch: Partial<ApplicationFormStepDef>) => {
    setLayoutDraft((prev) => {
      const steps = prev.steps?.length
        ? prev.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s))
        : BUILTIN_APPLICATION_FORM_STEPS.map((s) => ({ ...s }));
      return { ...prev, steps };
    });
  };

  const removeCustomStep = (stepId: string) => {
    const step = layoutDraft.steps?.find((s) => s.id === stepId);
    if (step?.builtIn) return;
    setLayoutDraft((prev) => ({
      ...prev,
      steps: (prev.steps ?? BUILTIN_APPLICATION_FORM_STEPS).filter((s) => s.id !== stepId),
    }));
  };

  const addCustomStep = () => {
    const label = newStepLabel.trim();
    if (!label) {
      toast.error("Section name is required.");
      return;
    }
    const baseId = slugifyStepId(label) || "custom_section";
    const steps = layoutDraft.steps?.length
      ? [...layoutDraft.steps]
      : BUILTIN_APPLICATION_FORM_STEPS.map((s) => ({ ...s }));
    let id = baseId;
    let n = 2;
    while (steps.some((s) => s.id === id)) {
      id = `${baseId}_${n++}`;
    }
    steps.push({ id, label, builtIn: false });
    setLayoutDraft((prev) => ({ ...prev, steps }));
    setNewStepLabel("");
  };

  return (
    <div className="space-y-4">
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-700">Form layout</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Changes apply to new applications only. Drafts and submitted applications keep the
            form they started with.
          </p>
        </div>
        <div className="p-3 space-y-4">
          <label className="block max-w-xs">
            <span className="text-xs text-gray-500">Required referees per applicant</span>
            <select
              className="mt-1 w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
              value={resolveRequiredRefereeCount(layoutDraft)}
              disabled={!canEdit}
              onChange={(e) =>
                setLayoutDraft((prev) => ({
                  ...prev,
                  requiredRefereeCount: Number(e.target.value),
                }))
              }
            >
              {Array.from({ length: MAX_REFEREE_COUNT }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "referee" : "referees"}
                  {n === DEFAULT_REQUIRED_REFEREE_COUNT ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Sections</p>
            <ul className="space-y-2">
              {(layoutDraft.steps ?? BUILTIN_APPLICATION_FORM_STEPS).map((stepDef) => (
                <li
                  key={stepDef.id}
                  className="flex flex-wrap items-center gap-2 border border-gray-100 rounded-lg px-2.5 py-2"
                >
                  <input
                    className="flex-1 min-w-[140px] border border-gray-200 rounded-lg px-2 py-1 text-sm"
                    value={stepDef.label}
                    disabled={!canEdit}
                    onChange={(e) => updateLayoutStep(stepDef.id, { label: e.target.value })}
                  />
                  <span className="text-[11px] text-gray-400">{stepDef.id}</span>
                  {stepDef.builtIn ? (
                    <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={stepDef.hidden === true}
                        disabled={!canEdit}
                        onChange={(e) =>
                          updateLayoutStep(stepDef.id, { hidden: e.target.checked })
                        }
                      />
                      Hidden
                    </label>
                  ) : (
                    canEdit && (
                      <button
                        type="button"
                        onClick={() => removeCustomStep(stepDef.id)}
                        className="p-1 rounded hover:bg-red-50"
                        title="Remove section"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
            {canAdd && (
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
                  placeholder="New section name"
                  value={newStepLabel}
                  onChange={(e) => setNewStepLabel(e.target.value)}
                />
                <button
                  type="button"
                  onClick={addCustomStep}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add section
                </button>
              </div>
            )}
          </div>

          {canEdit && (
            <button
              type="button"
              disabled={saveLayoutMutation.isPending || configLoading}
              onClick={() =>
                saveLayoutMutation.mutate(
                  normalizeApplicationFormConfig({
                    ...layoutDraft,
                    steps: layoutDraft.steps ?? BUILTIN_APPLICATION_FORM_STEPS,
                  }),
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-60"
            >
              {saveLayoutMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Save layout
            </button>
          )}

          <p className="text-[11px] text-gray-500">
            Referee contact fields are generated automatically from the referee count above. They
            appear under the Referees section only — not Personal information.
          </p>
        </div>
      </div>

      {orphanRefereeOptions.length > 0 && canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs text-amber-950">
            Found {orphanRefereeOptions.length} stray referee field
            {orphanRefereeOptions.length === 1 ? "" : "s"} saved under the wrong section (often
            Personal information). Remove them — referee fields are controlled by the count above.
          </p>
          <button
            type="button"
            disabled={cleanupRefereeOptionsMutation.isPending}
            onClick={() => cleanupRefereeOptionsMutation.mutate(orphanRefereeOptions)}
            className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-800 text-white hover:bg-amber-900 disabled:opacity-60"
          >
            {cleanupRefereeOptionsMutation.isPending ? "Removing…" : "Remove stray fields"}
          </button>
        </div>
      )}

      {canAdd && (
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <Plus className="w-3.5 h-3.5" />
          Add field
        </button>
      )}

      {showAdd && canAdd && (
        <FieldDraftForm
          label={newLabel}
          draft={newDraft}
          onLabelChange={setNewLabel}
          onDraftChange={setNewDraft}
          onCancel={() => setShowAdd(false)}
          onSave={() => {
            if (!newLabel.trim() || !newDraft.fieldKey.trim()) {
              toast.error("Label and field key are required.");
              return;
            }
            const rules = draftToRules(newDraft);
            if (
              isRefereeSystemOption({
                label: newLabel.trim(),
                legacy_value: newDraft.fieldKey.trim(),
                rules,
              })
            ) {
              toast.error(
                "Referee fields are auto-generated. Set the referee count in Form layout instead.",
              );
              return;
            }
            createMutation.mutate({
              module_id: moduleId,
              option_list: RECRUITMENT_APPLICATION_FIELDS_LIST,
              label: newLabel.trim(),
              legacy_value: newDraft.fieldKey.trim(),
              rules: draftToRules(newDraft),
            });
          }}
          saving={createMutation.isPending}
          stepOptions={allStepOptions}
        />
      )}

      {isLoading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : (
        grouped.map(({ step, label, fields }) => (
          <div key={step} className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-700">
              {label}
            </div>
            {step === "references" && (
              <div className="px-3 py-4 border-b border-gray-100 bg-blue-50/50">
                <p className="text-xs font-semibold text-gray-900">
                  {requiredRefereeCount}{" "}
                  {requiredRefereeCount === 1 ? "referee" : "referees"} — auto-generated
                </p>
                <p className="text-[11px] text-gray-600 mt-1">
                  Applicants fill in contact details for each referee on this step. Change the count
                  in Form layout above — you do not add these as individual fields.
                </p>
                <ul className="mt-3 space-y-2">
                  {Array.from({ length: requiredRefereeCount }, (_, index) => (
                    <li
                      key={index}
                      className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-[11px] text-gray-700"
                    >
                      <span className="font-medium text-gray-900">
                        Referee {index + 1}
                      </span>
                      <span className="text-gray-400 mx-1">·</span>
                      {REFEREE_CONTACT_PARTS.join(" · ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {fields.length === 0 && step !== "references" ? (
              <p className="text-xs text-gray-400 italic px-3 py-4">No fields in this step.</p>
            ) : fields.length === 0 ? null : (
              <ul className="divide-y divide-gray-100">
                {fields.map((option) => {
                  const rules = parseApplicationFieldRules(
                    option.rules as Record<string, unknown>,
                  );
                  const isEditing = editingId === option.id;

                  return (
                    <li key={option.id} className="px-3 py-3">
                      {isEditing && editDraft && canEdit ? (
                        <FieldDraftForm
                          label={editLabel}
                          draft={editDraft}
                          onLabelChange={setEditLabel}
                          onDraftChange={setEditDraft}
                          onCancel={() => setEditingId(null)}
                          onSave={() => {
                            if (!editLabel.trim() || !editDraft.fieldKey.trim()) {
                              toast.error(
                                "Label and field key are required — a blank field key hides this field from the form entirely.",
                              );
                              return;
                            }
                            const rules = draftToRules(
                              editDraft,
                              option.rules as Record<string, unknown>,
                            );
                            if (
                              isRefereeSystemOption({
                                label: editLabel.trim(),
                                legacy_value: editDraft.fieldKey.trim(),
                                rules,
                              })
                            ) {
                              toast.error(
                                "Referee fields are auto-generated. Set the referee count in Form layout instead.",
                              );
                              return;
                            }
                            patchMutation.mutate({
                              id: option.id,
                              patch: {
                                label: editLabel.trim(),
                                legacy_value: editDraft.fieldKey.trim(),
                                rules: draftToRules(
                                  editDraft,
                                  option.rules as Record<string, unknown>,
                                ),
                              },
                            });
                          }}
                          saving={patchMutation.isPending}
                          stepOptions={allStepOptions}
                        />
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {option.label}
                              {!option.is_active && (
                                <span className="ml-2 text-xs text-gray-400">(inactive)</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Key: {rules.fieldKey} · Type: {rules.fieldType}
                              {rules.required ? " · Required" : ""}
                              {rules.showWhen
                                ? ` · Shows when ${rules.showWhen.field} = ${rules.showWhen.equals}`
                                : ""}
                            </p>
                          </div>
                          {canEdit && option.is_active && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(option.id);
                                  setEditLabel(option.label);
                                  setEditDraft(rulesToDraft(rules));
                                }}
                                className="p-1.5 rounded-lg hover:bg-gray-100"
                              >
                                <Pencil className="w-3.5 h-3.5 text-gray-500" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deactivateMutation.mutate(option.id)}
                                className="p-1.5 rounded-lg hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function FieldDraftForm({
  label,
  draft,
  onLabelChange,
  onDraftChange,
  onCancel,
  onSave,
  saving,
  stepOptions,
}: {
  label: string;
  draft: DraftRules;
  onLabelChange: (v: string) => void;
  onDraftChange: (v: DraftRules) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  stepOptions: { id: string; label: string }[];
}) {
  const inputClass =
    "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm";

  return (
    <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="block sm:col-span-2">
          <span className="text-xs text-gray-500">Label</span>
          <input className={inputClass} value={label} onChange={(e) => {
            const nextLabel = e.target.value;
            onLabelChange(nextLabel);
            if (!draft.fieldKey.trim() || draft.fieldKey === slugifyFieldKey(label)) {
              onDraftChange({ ...draft, fieldKey: slugifyFieldKey(nextLabel) });
            }
          }} />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Field key</span>
          <input
            className={inputClass}
            value={draft.fieldKey}
            onChange={(e) => onDraftChange({ ...draft, fieldKey: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Step</span>
          <select
            className={inputClass}
            value={draft.step}
            onChange={(e) =>
              onDraftChange({ ...draft, step: e.target.value as ApplicationFieldStep })
            }
          >
            {stepOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Type</span>
          <select
            className={inputClass}
            value={draft.fieldType}
            onChange={(e) =>
              onDraftChange({ ...draft, fieldType: e.target.value as ApplicationFieldType })
            }
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 pt-5">
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(e) => onDraftChange({ ...draft, required: e.target.checked })}
          />
          Required
        </label>
      </div>

      {draft.fieldType === "select" && (
        <label className="block">
          <span className="text-xs text-gray-500">Options (comma-separated)</span>
          <input
            className={inputClass}
            value={draft.options}
            onChange={(e) => onDraftChange({ ...draft, options: e.target.value })}
          />
        </label>
      )}

      {draft.fieldType === "file" && (
        <>
          <label className="block">
            <span className="text-xs text-gray-500">Accepted file types</span>
            <input
              className={inputClass}
              placeholder="image/jpeg,image/png,.jpg,.jpeg,.png"
              value={draft.accept}
              onChange={(e) => onDraftChange({ ...draft, accept: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draft.multiple}
              onChange={(e) => onDraftChange({ ...draft, multiple: e.target.checked })}
            />
            Allow multiple files
          </label>
        </>
      )}

      <div className="grid sm:grid-cols-3 gap-2">
        <label className="block">
          <span className="text-xs text-gray-500">Show when field (optional)</span>
          <input
            className={inputClass}
            value={draft.showWhenField}
            onChange={(e) => onDraftChange({ ...draft, showWhenField: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Condition</span>
          <select
            className={inputClass}
            value={draft.showWhenMode}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                showWhenMode: e.target.value as "equals" | "notEquals",
              })
            }
          >
            <option value="equals">Equals</option>
            <option value="notEquals">Not equals</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Value</span>
          <input
            className={inputClass}
            value={draft.showWhenValue}
            onChange={(e) => onDraftChange({ ...draft, showWhenValue: e.target.value })}
          />
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-200">
          <X className="w-4 h-4 text-gray-500" />
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>
    </div>
  );
}
