"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  DEFAULT_GRADE_LEVELS,
  DEFAULT_CONSULTANT_GRADES,
  defaultAgeRangeForRank,
  mergeAgeIntoLevels,
  resolveAgeRangeForGrade,
  resolveAllGradeLevels,
  resolveGradeLevels,
  type GradeLevelDef,
} from "@/lib/systemDefinitions/gradeLevelsConfig";
import {
  SALARY_TIER_IDS,
  SALARY_TIER_LABELS,
  formatSalaryTierBand,
  mergeSalaryTiersIntoLevels,
  type GradeSalaryTiers,
  type SalaryTierId,
} from "@/lib/systemDefinitions/salaryRanges";
import {
  RECRUITMENT_JOB_POSTINGS_LIST,
  RECRUITMENT_MODULE_ID,
} from "@/lib/systemDefinitions/recruitmentDefaults";
import { GRADE_LEVELS_CONFIG_QUERY_KEY } from "@/hooks/useGradeLevelsConfig";

type JobPostingRow = {
  id: string;
  label: string;
  legacy_value: string | null;
  is_active: boolean;
  rules: { interviewGuideKey?: string };
};

type GradeLevelsEditorProps = {
  moduleId: string;
  canAdd?: boolean;
  canEdit?: boolean;
};

function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function AgeLimitFields({
  value,
  onChange,
  disabled,
}: {
  value: { min: string; max: string };
  onChange: (field: "min" | "max", nextValue: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2 max-w-xs">
      <label className="flex-1 text-xs">
        <span className="text-gray-500">Min age</span>
        <input
          type="number"
          min={16}
          max={80}
          disabled={disabled}
          className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-xs"
          value={value.min}
          onChange={(e) => onChange("min", e.target.value)}
        />
      </label>
      <label className="flex-1 text-xs">
        <span className="text-gray-500">Max age</span>
        <input
          type="number"
          min={16}
          max={80}
          disabled={disabled}
          className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-xs"
          value={value.max}
          onChange={(e) => onChange("max", e.target.value)}
        />
      </label>
    </div>
  );
}

/** Compact low/mid/high salary inputs — wraps on small screens, never forces horizontal scroll. */
function SalaryTierFields({
  value,
  onChange,
  disabled,
}: {
  value: GradeSalaryTiers;
  onChange: (tier: SalaryTierId, field: "min" | "max", nextValue: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {SALARY_TIER_IDS.map((tier) => (
        <div key={tier} className="space-y-1 rounded-lg border border-gray-200 bg-white p-2">
          <p className="text-[11px] font-medium text-gray-500">{SALARY_TIER_LABELS[tier]}</p>
          <div className="flex gap-1.5">
            <input
              type="text"
              inputMode="decimal"
              disabled={disabled}
              placeholder="Min"
              className="w-1/2 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs"
              value={value?.[tier]?.min ?? ""}
              onChange={(e) => onChange(tier, "min", e.target.value)}
            />
            <input
              type="text"
              inputMode="decimal"
              disabled={disabled}
              placeholder="Max"
              className="w-1/2 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs"
              value={value?.[tier]?.max ?? ""}
              onChange={(e) => onChange(tier, "max", e.target.value)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GradeLevelsEditor({
  moduleId,
  canAdd = true,
  canEdit = true,
}: GradeLevelsEditorProps) {
  const queryClient = useQueryClient();
  const configKey = ["system_module_config", moduleId];

  const [showAdd, setShowAdd] = useState(false);
  const [newId, setNewId] = useState("");
  const [newRank, setNewRank] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newRoleTitle, setNewRoleTitle] = useState("");
  const [newSalaryTiers, setNewSalaryTiers] = useState<GradeSalaryTiers>({});
  const [newAgeMin, setNewAgeMin] = useState("");
  const [newAgeMax, setNewAgeMax] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editRank, setEditRank] = useState("");
  const [salaryByGrade, setSalaryByGrade] = useState<Record<string, GradeSalaryTiers>>({});
  const [ageByGrade, setAgeByGrade] = useState<Record<string, { min: string; max: string }>>({});

  const { data: moduleConfig, isLoading: loadingConfig } = useQuery({
    queryKey: configKey,
    queryFn: async () => {
      const res = await api.get(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
      );
      return (
        (res.data.data as {
          businessLogic?: { gradeLevelsConfig?: { levels?: GradeLevelDef[] } };
        } | undefined) ?? { businessLogic: {} }
      );
    },
    enabled: moduleId === RECRUITMENT_MODULE_ID,
  });

  const { data: jobPostings = [], isLoading: loadingRoles } = useQuery<JobPostingRow[]>({
    queryKey: ["system_options", moduleId, RECRUITMENT_JOB_POSTINGS_LIST],
    queryFn: async () => {
      const res = await api.get("/system-definitions/options", {
        params: {
          module_id: moduleId,
          option_list: RECRUITMENT_JOB_POSTINGS_LIST,
          include_inactive: true,
        },
      });
      return res.data.data as JobPostingRow[];
    },
    enabled: moduleId === RECRUITMENT_MODULE_ID,
  });

  const levels = useMemo(
    () => resolveAllGradeLevels(moduleConfig?.businessLogic?.gradeLevelsConfig),
    [moduleConfig],
  );

  useEffect(() => {
    const nextSalary: Record<string, GradeSalaryTiers> = {};
    const nextAge: Record<string, { min: string; max: string }> = {};
    for (const level of levels) {
      if (level.salaryTiers) nextSalary[level.id] = { ...level.salaryTiers };
      const fallback = defaultAgeRangeForRank(level.rank);
      nextAge[level.id] = {
        min: String(level.ageMin ?? fallback.ageMin),
        max: String(level.ageMax ?? fallback.ageMax),
      };
    }
    setSalaryByGrade(nextSalary);
    setAgeByGrade(nextAge);
  }, [moduleConfig, levels]);

  const rolesByGrade = useMemo(() => {
    const map = new Map<string, JobPostingRow[]>();
    for (const row of jobPostings) {
      if (!row.is_active) continue;
      const guide = row.rules?.interviewGuideKey?.toUpperCase();
      if (!guide) continue;
      const list = map.get(guide) ?? [];
      list.push(row);
      map.set(guide, list);
    }
    return map;
  }, [jobPostings]);

  const saveConfigMutation = useMutation({
    mutationFn: (levelsToSave: GradeLevelDef[]) =>
      api.patch(`/system-definitions/modules/${encodeURIComponent(moduleId)}`, {
        businessLogic: {
          gradeLevelsConfig: { levels: levelsToSave },
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: configKey });
      queryClient.invalidateQueries({ queryKey: [...GRADE_LEVELS_CONFIG_QUERY_KEY] });
      toast.success("Grade levels saved.");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save grade levels.");
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: (payload: {
      label: string;
      legacy_value: string;
      interviewGuideKey: string;
    }) =>
      api.post("/system-definitions/options", {
        module_id: moduleId,
        option_list: RECRUITMENT_JOB_POSTINGS_LIST,
        label: payload.label,
        legacy_value: payload.legacy_value,
        rules: { interviewGuideKey: payload.interviewGuideKey },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["system_options", moduleId, RECRUITMENT_JOB_POSTINGS_LIST],
      });
      queryClient.invalidateQueries({ queryKey: ["careers_job_postings"] });
      queryClient.invalidateQueries({ queryKey: configKey });
      queryClient.invalidateQueries({ queryKey: [...GRADE_LEVELS_CONFIG_QUERY_KEY] });
    },
  });

  const persistLevels = (
    nextLevels: GradeLevelDef[],
    salaryOverrides?: Record<string, GradeSalaryTiers>,
    ageOverrides?: Record<string, { min: string; max: string }>,
  ) => {
    const salaryMap = salaryOverrides
      ? { ...salaryByGrade, ...salaryOverrides }
      : salaryByGrade;
    const ageMap = ageOverrides ? { ...ageByGrade, ...ageOverrides } : ageByGrade;
    const withSalary = mergeSalaryTiersIntoLevels(nextLevels, salaryMap);
    const withAge = mergeAgeIntoLevels(withSalary, ageMap);
    saveConfigMutation.mutate(withAge);
  };

  const patchAgeCell = (gradeId: string, field: "min" | "max", value: string) => {
    setAgeByGrade((prev) => ({
      ...prev,
      [gradeId]: {
        min: field === "min" ? value : prev[gradeId]?.min ?? "",
        max: field === "max" ? value : prev[gradeId]?.max ?? "",
      },
    }));
  };

  const patchSalaryCell = (
    gradeId: string,
    tier: SalaryTierId,
    field: "min" | "max",
    value: string,
  ) => {
    setSalaryByGrade((prev) => ({
      ...prev,
      [gradeId]: {
        ...prev[gradeId],
        [tier]: {
          ...prev[gradeId]?.[tier],
          [field]: value,
        },
      },
    }));
  };

  const patchNewSalaryTier = (tier: SalaryTierId, field: "min" | "max", value: string) => {
    setNewSalaryTiers((prev) => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [field]: value,
      },
    }));
  };

  const handleAdd = async () => {
    const id = newId.trim().toUpperCase();
    const rank = Number(newRank);
    const label = newLabel.trim();
    const roleTitle = newRoleTitle.trim();

    if (!/^L\d+$/.test(id)) {
      toast.error("Grade ID must look like L8, L9, etc.");
      return;
    }
    if (!Number.isFinite(rank) || rank < 1) {
      toast.error("Enter a valid rank number.");
      return;
    }
    if (!label) {
      toast.error("Enter a grade label.");
      return;
    }
    if (!roleTitle) {
      toast.error("Enter a role title — each new grade must have a linked job posting role.");
      return;
    }
    if (levels.some((l) => l.id === id)) {
      toast.error(`${id} already exists.`);
      return;
    }

    const roleKey = slugifyKey(roleTitle);
    if (!roleKey) {
      toast.error("Could not derive a role key from the title.");
      return;
    }

    try {
      await createRoleMutation.mutateAsync({
        label: roleTitle.includes(`(${id})`) ? roleTitle : `${roleTitle} (${id})`,
        legacy_value: roleKey,
        interviewGuideKey: id,
      });

      const newLevel: GradeLevelDef = { id, rank, label, roleKey, builtIn: false };
      const nextLevels: GradeLevelDef[] = moduleConfig?.businessLogic?.gradeLevelsConfig?.levels
        ?.length
        ? [...moduleConfig.businessLogic.gradeLevelsConfig.levels, newLevel]
        : [...DEFAULT_GRADE_LEVELS.map((l) => ({ ...l })), newLevel];

      const ageDefaults = defaultAgeRangeForRank(rank);
      persistLevels(nextLevels, { [id]: newSalaryTiers }, {
        [id]: {
          min: newAgeMin.trim() || String(ageDefaults.ageMin),
          max: newAgeMax.trim() || String(ageDefaults.ageMax),
        },
      });

      setShowAdd(false);
      setNewId("");
      setNewRank("");
      setNewLabel("");
      setNewRoleTitle("");
      setNewSalaryTiers({});
      setNewAgeMin("");
      setNewAgeMax("");
    } catch {
      toast.error("Could not create linked role for this grade.");
    }
  };

  const startEdit = (level: GradeLevelDef) => {
    setEditingId(level.id);
    setEditLabel(level.label);
    setEditRank(String(level.rank));
  };

  const saveEdit = (level: GradeLevelDef) => {
    const label = editLabel.trim();
    const rank = Number(editRank);
    if (!label || !Number.isFinite(rank) || rank < 1) {
      toast.error("Label and rank are required.");
      return;
    }

    const base = moduleConfig?.businessLogic?.gradeLevelsConfig?.levels?.length
      ? [...(moduleConfig.businessLogic.gradeLevelsConfig.levels ?? [])]
      : DEFAULT_GRADE_LEVELS.map((l) => ({ ...l }));

    const next = base.map((row) =>
      row.id === level.id ? { ...row, label, rank: Math.round(rank) } : row,
    );
    persistLevels(next);
    setEditingId(null);
  };

  const removeCustomGrade = (level: GradeLevelDef) => {
    if (level.builtIn !== false && DEFAULT_GRADE_LEVELS.some((d) => d.id === level.id)) {
      toast.error("Built-in grades L1–L7 cannot be removed.");
      return;
    }
    const base = moduleConfig?.businessLogic?.gradeLevelsConfig?.levels ?? [];
    persistLevels(base.filter((row) => row.id !== level.id));
  };

  if (loadingConfig || loadingRoles) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading grade levels…
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <p className="text-xs text-gray-500">
        L1–L7 and Consultant are built in. Add L8 or higher with a linked job posting role, or
        add another consultant grade (no numeric level — for part-time HR and similar roles).
      </p>

      <div className="w-full max-w-full overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 font-semibold text-gray-600">Grade</th>
              <th className="px-3 py-2 font-semibold text-gray-600">Label</th>
              <th className="px-3 py-2 font-semibold text-gray-600">Rank</th>
              <th className="px-3 py-2 font-semibold text-gray-600">Linked role(s)</th>
              {canEdit && <th className="px-3 py-2 font-semibold text-gray-600 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {levels.map((level) => {
              const linked = rolesByGrade.get(level.id) ?? [];
              const isEditing = editingId === level.id;
              const isBuiltIn =
                DEFAULT_GRADE_LEVELS.some((d) => d.id === level.id) ||
                DEFAULT_CONSULTANT_GRADES.some((d) => d.id === level.id);
              const isConsultant = level.roleKind === "consultant";
              const midSummary = formatSalaryTierBand(level.salaryTiers?.mid);
              const ageBand = resolveAgeRangeForGrade(
                level.id,
                moduleConfig?.businessLogic?.gradeLevelsConfig,
              );
              const colSpan = canEdit ? 5 : 4;

              return (
                <Fragment key={level.id}>
                  <tr className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs align-top">
                      {level.id}
                      {isConsultant && (
                        <span className="block text-[10px] text-gray-400 font-sans">consultant</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isEditing ? (
                        <input
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                        />
                      ) : (
                        <div>
                          <p>{level.label}</p>
                          {midSummary && (
                            <p className="text-[11px] text-gray-400 mt-0.5">Mid: {midSummary}</p>
                          )}
                          {ageBand && (
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              Age: {ageBand.ageMin}–{ageBand.ageMax}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isConsultant ? (
                        <span className="text-gray-400">—</span>
                      ) : isEditing ? (
                        <input
                          type="number"
                          min={1}
                          className="w-20 border border-gray-200 rounded px-2 py-1 text-sm"
                          value={editRank}
                          onChange={(e) => setEditRank(e.target.value)}
                        />
                      ) : (
                        level.rank
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 align-top">
                      {linked.length > 0
                        ? linked.map((r) => r.label).join(", ")
                        : level.roleKey
                          ? level.roleKey
                          : "—"}
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2 text-right align-top">
                        {isEditing ? (
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => saveEdit(level)}
                              className="p-1.5 rounded hover:bg-green-50 text-green-700"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded hover:bg-gray-100"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(level)}
                              className="p-1.5 rounded hover:bg-gray-100"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {!isBuiltIn && (
                              <button
                                type="button"
                                onClick={() => removeCustomGrade(level)}
                                className="p-1.5 rounded hover:bg-red-50 text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                  {isEditing && (
                    <tr className="border-b border-gray-100 last:border-0">
                      <td colSpan={colSpan} className="px-3 pb-3 bg-gray-50/70">
                        <p className="text-[11px] font-semibold text-gray-600 mb-2">
                          Salary bands (GHS)
                        </p>
                        <SalaryTierFields
                          value={salaryByGrade[level.id] ?? {}}
                          onChange={(tier, field, value) =>
                            patchSalaryCell(level.id, tier, field, value)
                          }
                          disabled={!canEdit}
                        />
                        <p className="text-[11px] font-semibold text-gray-600 mt-4 mb-2">
                          Age band (shortlisting cutoff)
                        </p>
                        <AgeLimitFields
                          value={
                            ageByGrade[level.id] ?? {
                              min: String(defaultAgeRangeForRank(level.rank).ageMin),
                              max: String(defaultAgeRangeForRank(level.rank).ageMax),
                            }
                          }
                          onChange={(field, value) => patchAgeCell(level.id, field, value)}
                          disabled={!canEdit}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {canAdd && (
        <>
          {!showAdd ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:text-red-800"
            >
              <Plus className="w-4 h-4" />
              Add grade level
            </button>
          ) : (
            <div className="border border-dashed border-gray-300 rounded-xl p-4 space-y-3 bg-gray-50/50 max-w-full">
              <p className="text-xs font-semibold text-gray-700">New grade (L8+)</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block text-xs">
                  <span className="text-gray-500">Grade ID</span>
                  <input
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="L8"
                    value={newId}
                    onChange={(e) => setNewId(e.target.value.toUpperCase())}
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-gray-500">Rank (for employee ID WF8-001)</span>
                  <input
                    type="number"
                    min={8}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="8"
                    value={newRank}
                    onChange={(e) => setNewRank(e.target.value)}
                  />
                </label>
                <label className="block text-xs sm:col-span-2">
                  <span className="text-gray-500">Grade label</span>
                  <input
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Executive (8)"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                </label>
                <label className="block text-xs sm:col-span-2">
                  <span className="text-gray-500">Linked role title (creates job posting role)</span>
                  <input
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Regional Operations Director (L8)"
                    value={newRoleTitle}
                    onChange={(e) => setNewRoleTitle(e.target.value)}
                  />
                </label>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1.5">Salary bands (GHS, optional)</p>
                <SalaryTierFields
                  value={newSalaryTiers}
                  onChange={patchNewSalaryTier}
                  disabled={!canAdd}
                />
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1.5">Age band (optional)</p>
                <AgeLimitFields
                  value={{
                    min: newAgeMin || (newRank ? String(defaultAgeRangeForRank(Number(newRank)).ageMin) : ""),
                    max: newAgeMax || (newRank ? String(defaultAgeRangeForRank(Number(newRank)).ageMax) : ""),
                  }}
                  onChange={(field, value) => {
                    if (field === "min") setNewAgeMin(value);
                    else setNewAgeMax(value);
                  }}
                  disabled={!canAdd}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleAdd()}
                  disabled={saveConfigMutation.isPending || createRoleMutation.isPending}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-60"
                >
                  {saveConfigMutation.isPending || createRoleMutation.isPending
                    ? "Saving…"
                    : "Create grade & role"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
