"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { SystemOption } from "@/lib/systemDefinitions";
import {
  ONBOARDING_STEP_LABELS,
  ONBOARDING_STEPS,
  parseOnboardingFieldRules,
  type OnboardingFieldStep,
  type OnboardingFieldType,
} from "@/lib/careers/onboardingFormSchema";
import {
  ONBOARDING_FIELDS_LIST,
  RECRUITMENT_MODULE_ID,
} from "@/lib/systemDefinitions/onboardingDefaults";

type OnboardingFormEditorProps = {
  moduleId: string;
  canAdd?: boolean;
  canEdit?: boolean;
};

const FIELD_TYPES: OnboardingFieldType[] = [
  "text",
  "email",
  "phone",
  "ghana_card",
  "date",
  "select",
  "textarea",
  "file",
  "number",
  "gps",
  "bank_account",
  "qualifications_list",
  "certifications_list",
  "work_experience_list",
  "application_certificates_view",
  "referee_submissions_view",
];

type DraftRules = {
  step: OnboardingFieldStep;
  section: string;
  fieldKey: string;
  fieldType: OnboardingFieldType;
  required: boolean;
  options: string;
  showWhenField: string;
  showWhenMode: "equals" | "notEquals";
  showWhenValue: string;
  accept: string;
  colSpan: "half" | "full";
};

function rulesToDraft(rules: ReturnType<typeof parseOnboardingFieldRules>): DraftRules {
  return {
    step: rules.step,
    section: rules.section ?? "",
    fieldKey: rules.fieldKey,
    fieldType: rules.fieldType,
    required: rules.required ?? false,
    options: (rules.options ?? []).join(", "),
    showWhenField: rules.showWhen?.field ?? "",
    showWhenMode: rules.showWhen?.notEquals !== undefined ? "notEquals" : "equals",
    showWhenValue: rules.showWhen?.notEquals ?? rules.showWhen?.equals ?? "",
    accept: rules.accept ?? "",
    colSpan: rules.colSpan ?? "full",
  };
}

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
    colSpan: draft.colSpan,
  };
  if (draft.section.trim()) rules.section = draft.section.trim();
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
  return rules;
}

export default function OnboardingFormEditor({
  moduleId,
  canAdd = true,
  canEdit = true,
}: OnboardingFormEditorProps) {
  const queryClient = useQueryClient();
  const queryKey = ["system_options", moduleId, ONBOARDING_FIELDS_LIST];

  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDraft, setNewDraft] = useState<DraftRules>({
    step: "personal",
    section: "",
    fieldKey: "",
    fieldType: "text",
    required: false,
    options: "",
    showWhenField: "",
    showWhenMode: "equals",
    showWhenValue: "",
    accept: "",
    colSpan: "full",
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
          option_list: ONBOARDING_FIELDS_LIST,
          include_inactive: true,
        },
      });
      return res.data.data as SystemOption[];
    },
    enabled: moduleId === RECRUITMENT_MODULE_ID,
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
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/system-definitions/options/${encodeURIComponent(id)}`, patch),
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

  if (moduleId !== RECRUITMENT_MODULE_ID) return null;

  const grouped = ONBOARDING_STEPS.map((step) => ({
    step,
    fields: options
      .filter(
        (o) =>
          parseOnboardingFieldRules(o.rules as Record<string, unknown>).step === step,
      )
      .sort((a, b) => a.sort_order - b.sort_order),
  }));

  return (
    <div className="space-y-4">
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
            createMutation.mutate({
              module_id: moduleId,
              option_list: ONBOARDING_FIELDS_LIST,
              label: newLabel.trim(),
              legacy_value: newDraft.fieldKey.trim(),
              rules: draftToRules(newDraft),
            });
          }}
          saving={createMutation.isPending}
        />
      )}

      {isLoading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : (
        grouped.map(({ step, fields }) => (
          <div key={step} className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-700">
              {ONBOARDING_STEP_LABELS[step]}
            </div>
            {fields.length === 0 ? (
              <p className="text-xs text-gray-400 italic px-3 py-4">No fields in this step.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {fields.map((option) => {
                  const rules = parseOnboardingFieldRules(
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
                              toast.error("Label and field key are required.");
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
                              {rules.section ? `${rules.section} · ` : ""}
                              Key: {rules.fieldKey} · Type: {rules.fieldType}
                              {rules.required ? " · Required" : ""}
                              {rules.colSpan === "half" ? " · Half width" : ""}
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
}: {
  label: string;
  draft: DraftRules;
  onLabelChange: (v: string) => void;
  onDraftChange: (v: DraftRules) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const inputClass =
    "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm";

  return (
    <div className="space-y-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="block sm:col-span-2">
          <span className="text-xs text-gray-500">Label</span>
          <input className={inputClass} value={label} onChange={(e) => onLabelChange(e.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs text-gray-500">Section heading (optional)</span>
          <input
            className={inputClass}
            placeholder="e.g. A. Personal information"
            value={draft.section}
            onChange={(e) => onDraftChange({ ...draft, section: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Field key (dot path)</span>
          <input
            className={inputClass}
            placeholder="personal.mobile"
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
              onDraftChange({ ...draft, step: e.target.value as OnboardingFieldStep })
            }
          >
            {ONBOARDING_STEPS.map((s) => (
              <option key={s} value={s}>
                {ONBOARDING_STEP_LABELS[s]}
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
              onDraftChange({ ...draft, fieldType: e.target.value as OnboardingFieldType })
            }
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Width</span>
          <select
            className={inputClass}
            value={draft.colSpan}
            onChange={(e) =>
              onDraftChange({ ...draft, colSpan: e.target.value as "half" | "full" })
            }
          >
            <option value="full">Full row</option>
            <option value="half">Half row</option>
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
        <label className="block">
          <span className="text-xs text-gray-500">Accepted file types</span>
          <input
            className={inputClass}
            placeholder="image/*,.pdf"
            value={draft.accept}
            onChange={(e) => onDraftChange({ ...draft, accept: e.target.value })}
          />
        </label>
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
