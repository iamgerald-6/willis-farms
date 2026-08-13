"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppNavigation } from "@/lib/navigation/appNavigation";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import {
  ChevronLeft,
  ChevronDown,
  Save,
  Send,
  User,
  ClipboardList,
  Loader2,
} from "lucide-react";
import { FormPageSkeleton } from "@/components/skeletons/PageSkeletons";
import {
  buildSkillLogCompetencyRows,
  getModuleRoute,
  getSkillLogGradeLevels,
  getSkillLogSectionsForType,
  getSkillLogTypeLegacyValues,
  parseSkillLogGradeLevel,
  SKILL_LOG_FORM_COPY,
  SKILL_LOG_MIN_FILLER_GRADE,
} from "@/lib/moduleRegistry";

const BRAND = "#C62828";
const BRAND_LIGHT = "#FFEBEE";
const SKILL_LOG_ROUTE =
  getModuleRoute("mod:skill-log") ?? "/dashboard/humanCapital/skillLog";
const LOG_TYPE_OPTIONS = getSkillLogTypeLegacyValues() as unknown as [
  string,
  ...string[],
];
const ALL_GRADES = getSkillLogGradeLevels();

interface UserProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  grade_level: string;
}

// ─── Zod schema ───────────────────────────────────────────────────────────────
const competencySchema = z.object({
  skill: z.string(),
  observed: z.string().nullable(),
  performed_under_supervision: z.string().nullable(),
  performed_consistently: z.string().nullable(),
  rating: z.number().min(1).max(5).nullable(),
  comments: z.string(),
});

const skillLogSchema = z.object({
  employee_grade: z.string().min(1, "Select a grade"),
  employee_id: z.string().min(1, "Select an employee"),
  log_type: z.enum(LOG_TYPE_OPTIONS, { error: "Select a log type" }),
  review_period: z.string().min(1, "Review period is required"),
  section: z.string().optional(),
  tier_auth: z.string().optional(),
  strengths_observed: z.string().optional(),
  development_gaps: z.string().optional(),
  competencies: z.array(competencySchema),
});

type SkillLogFormValues = z.infer<typeof skillLogSchema>;

// ─── Shared form controls ─────────────────────────────────────────────────────
function FormSelect({
  label,
  error,
  children,
  disabled,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      <div className="relative">
        <select
          disabled={disabled}
          className={`w-full appearance-none border rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${error ? "border-red-400" : "border-gray-200"}`}
          style={{ "--tw-ring-color": BRAND } as any}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function FormInput({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      <input
        className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${error ? "border-red-400" : "border-gray-200"}`}
        style={{ "--tw-ring-color": BRAND } as any}
        {...props}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ─── Yes/No Dropdown ──────────────────────────────────────────────────────────
function YesNoDropdown({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative w-[88px]">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none border rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 text-center pr-5"
        style={
          value === "yes"
            ? ({
                borderColor: "#86efac",
                background: "#dcfce7",
                color: "#15803d",
                "--tw-ring-color": "#86efac",
              } as any)
            : value === "no"
              ? ({
                  borderColor: "#fca5a5",
                  background: "#fee2e2",
                  color: "#dc2626",
                  "--tw-ring-color": "#fca5a5",
                } as any)
              : ({ borderColor: "#e5e7eb", "--tw-ring-color": BRAND } as any)
        }
      >
        <option value="">—</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ─── Rating Picker ────────────────────────────────────────────────────────────
function RatingPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className="w-6 h-6 rounded text-xs font-bold border transition-all"
          style={
            value === n
              ? { background: BRAND, color: "#fff", borderColor: BRAND }
              : { background: "#fff", color: "#9ca3af", borderColor: "#e5e7eb" }
          }
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function SkillLogFormPageContent() {
  const router = useRouter();
  const { goBack } = useAppNavigation();
  const searchParams = useSearchParams();
  const editId = searchParams?.get("edit");
  const isEditMode = !!editId;

  // ── Auth ──
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });
  const supervisorId = session?.user?.id ?? "";

  // ── All users via API (bypasses RLS) ──
  const { data: allUsers = [] } = useQuery<UserProfile[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data as UserProfile[];
    },
  });

  // Derive supervisor profile from the already-fetched list
  const supervisor = allUsers.find((u) => u.user_id === supervisorId) ?? null;

  const supervisorGradeLevel = parseSkillLogGradeLevel(
    supervisor?.grade_level ?? "L1",
  );

  useEffect(() => {
    if (allUsers.length > 0 && supervisorId && !supervisor) return; // still loading
    if (supervisor && supervisorGradeLevel < SKILL_LOG_MIN_FILLER_GRADE) {
      router.replace(SKILL_LOG_ROUTE);
    }
  }, [
    supervisor,
    supervisorGradeLevel,
    router,
    allUsers.length,
    supervisorId,
  ]);

  // ── Auth headers helper (Bearer token for routes that require it) ──
  const getAuthHeaders = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // ── Load existing log for edit ──
  const { data: existingLog, isLoading: loadingExisting } = useQuery({
    queryKey: ["skill_log", editId],
    enabled: isEditMode,
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await api.get(`/skillLog/${editId}`, { headers });
      return res.data.data;
    },
  });

  // ── React Hook Form ──
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SkillLogFormValues>({
    resolver: zodResolver(skillLogSchema),
    defaultValues: {
      employee_grade: "",
      employee_id: "",
      log_type: "",
      review_period: "",
      section: "",
      tier_auth: "",
      strengths_observed: "",
      development_gaps: "",
      competencies: [],
    },
  });

  const { fields, replace } = useFieldArray({ control, name: "competencies" });

  const watchedGrade = watch("employee_grade");
  const watchedLogType = watch("log_type");
  const watchedEmployeeId = watch("employee_id");

  const assessableGrades = useMemo(
    () =>
      ALL_GRADES.filter(
        (g) => parseSkillLogGradeLevel(g) < supervisorGradeLevel,
      ),
    [supervisorGradeLevel],
  );

  const employeesForGrade = useMemo(() => {
    if (!watchedGrade) return [];
    return allUsers.filter(
      (u) => u.grade_level === watchedGrade && u.user_id !== supervisorId,
    );
  }, [allUsers, watchedGrade, supervisorId]);

  // Reset employee on grade change
  useEffect(() => {
    if (isEditMode) return;
    setValue("employee_id", "");
  }, [watchedGrade, setValue, isEditMode]);

  // Rebuild competency rows on log type change
  // Rebuild competency rows on log type change — skip in edit mode
  useEffect(() => {
    if (isEditMode) return; // ← don't rebuild when editing, reset() handles it
    if (!watchedLogType) {
      replace([]);
      return;
    }
    replace(buildSkillLogCompetencyRows(watchedLogType));
  }, [watchedLogType, replace, isEditMode]);

  // Populate form in edit mode
  // Populate form in edit mode
  useEffect(() => {
    if (!existingLog) return;
    const comp = existingLog.skill_log_competencies ?? [];

    // employee_grade may come from the joined employee object
    const employeeGrade =
      existingLog.employee_grade ?? existingLog.employee?.grade_level ?? "";

    reset({
      employee_grade: employeeGrade,
      employee_id: existingLog.employee_id ?? "",
      log_type: existingLog.log_type ?? "",
      review_period: existingLog.review_period ?? "",
      section: existingLog.section ?? "",
      tier_auth: existingLog.tier_auth ?? "",
      strengths_observed: existingLog.strengths_observed ?? "",
      development_gaps: existingLog.development_gaps ?? "",
      competencies: comp.map((c: any) => ({
        skill: c.skill,
        observed: c.observed ?? null,
        performed_under_supervision: c.performed_under_supervision ?? null,
        performed_consistently: c.performed_consistently ?? null,
        rating: c.rating ?? null,
        comments: c.comments ?? "",
      })),
    });
  }, [existingLog, reset]);
  // ── Mutations ──
  const { mutateAsync: createLog } = useMutation({
    mutationFn: async (payload: any) => {
      const headers = await getAuthHeaders();
      const res = await api.post("/skillLog/create_skillLog", payload, {
        headers,
      });
      return res.data;
    },
  });

  const { mutateAsync: updateLog } = useMutation({
    mutationFn: async (payload: any) => {
      const headers = await getAuthHeaders();
      const res = await api.patch(`/skillLog/${editId}`, payload, { headers });
      return res.data;
    },
  });

  const onSubmit = async (values: SkillLogFormValues, asDraft: boolean) => {
    const selectedEmployee = allUsers.find(
      (u) => u.user_id === values.employee_id,
    );
    const payload = {
      ...values,
      supervisor_id: supervisorId,
      employee_name: selectedEmployee
        ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}`
        : "",
      status: asDraft ? "draft" : "submitted",
      competencies: values.competencies.map((c) => ({
        ...c,
        observed: c.observed || null,
        performed_under_supervision: c.performed_under_supervision || null,
        performed_consistently: c.performed_consistently || null,
      })),
    };
    console.log(
      "PAYLOAD COMPETENCIES:",
      JSON.stringify(payload.competencies.slice(0, 3), null, 2),
    );
    if (isEditMode) {
      await updateLog(payload);
    } else {
      await createLog(payload);
    }
    router.push(SKILL_LOG_ROUTE);
  };

  // Map skill name to field array index for rendering
  const skillIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    fields.forEach((f, i) => {
      map[f.skill] = i;
    });
    return map;
  }, [fields]);

  const logSections = watchedLogType
    ? getSkillLogSectionsForType(watchedLogType)
    : [];

  if (isEditMode && loadingExisting) {
    return <FormPageSkeleton />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => goBack(SKILL_LOG_ROUTE)}
          className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditMode
                ? SKILL_LOG_FORM_COPY.editTitle
                : SKILL_LOG_FORM_COPY.createTitle}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isEditMode
                ? SKILL_LOG_FORM_COPY.editingPrefix
                : SKILL_LOG_FORM_COPY.fillingAsPrefix}
              <span className="font-semibold text-gray-700">
                {supervisor
                  ? `${supervisor.first_name} ${supervisor.last_name}`
                  : "…"}{" "}
                ({supervisor?.grade_level})
              </span>
            </p>
          </div>
        </div>
      </div>

      <form className="w-full max-w-7xl space-y-6">
        {/* Employee Details */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <User className="w-4 h-4" style={{ color: BRAND }} />
            Employee Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Grade */}
            <Controller
              control={control}
              name="employee_grade"
              render={({ field }) => (
                <FormSelect
                  label="Select Grade"
                  error={errors.employee_grade?.message}
                  disabled={isEditMode}
                  {...field}
                >
                  <option value="">— Select grade —</option>
                  {assessableGrades.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </FormSelect>
              )}
            />

            {/* Employee */}
            <Controller
              control={control}
              name="employee_id"
              render={({ field }) => (
                <FormSelect
                  label="Employee"
                  error={errors.employee_id?.message}
                  disabled={!watchedGrade || isEditMode}
                  {...field}
                >
                  <option value="">
                    {watchedGrade
                      ? employeesForGrade.length === 0
                        ? `No ${watchedGrade} employees found`
                        : "— Select employee —"
                      : "Select a grade first"}
                  </option>
                  {employeesForGrade.map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.first_name} {u.last_name}
                    </option>
                  ))}
                  {isEditMode && existingLog && (
                    <option value={existingLog.employee_id}>
                      {existingLog.employee_name}
                    </option>
                  )}
                </FormSelect>
              )}
            />

            <FormInput
              label="Section"
              placeholder="e.g. Breeding, Farrowing…"
              error={errors.section?.message}
              {...register("section")}
            />

            <FormInput
              label="Tier Authorisation"
              placeholder="GP / PS / external GGP semen handling"
              error={errors.tier_auth?.message}
              {...register("tier_auth")}
            />

            <FormInput
              label="Review Period"
              placeholder="e.g. Jan–Mar 2026"
              error={errors.review_period?.message}
              {...register("review_period")}
            />

            {/* Log Type */}
            <Controller
              control={control}
              name="log_type"
              render={({ field }) => (
                <FormSelect
                  label="Skills Log Type"
                  error={errors.log_type?.message}
                  {...field}
                >
                  <option value="">— Select log type —</option>
                  {LOG_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </FormSelect>
              )}
            />
          </div>
        </div>

        {/* Competency Table */}
        {logSections.length > 0 && fields.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" style={{ color: BRAND }} />
              <h2 className="text-sm font-bold text-gray-800">
                Competency Assessment
              </h2>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
              <div className="min-w-[1100px]">
                {/* Table header */}
                <div
                  className="grid px-5 py-3 text-xs font-bold text-white uppercase tracking-wider"
                  style={{
                    background: BRAND,
                    gridTemplateColumns: "1fr 100px 120px 140px 100px 1fr",
                  }}
                >
                  <span>Skill / Competency</span>
                  <span className="text-center">Observed</span>
                  <span className="text-center">Under Supervision</span>
                  <span className="text-center">Consistently to Standards</span>
                  <span className="text-center">Rating</span>
                  <span className="text-center">Comments</span>
                </div>

                {logSections.map((sec, si) => (
                  <div key={si}>
                    <div
                      className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider"
                      style={{ background: BRAND_LIGHT, color: BRAND }}
                    >
                      {sec.title}
                    </div>

                    {sec.skills.map((skill) => {
                      const idx = skillIndexMap[skill];
                      if (idx === undefined) return null;
                      return (
                        <div
                          key={skill}
                          className="grid items-center px-5 py-3 border-b border-gray-100 last:border-0 gap-3"
                          style={{
                            gridTemplateColumns:
                              "1fr 100px 120px 130px 120px 1fr",
                          }}
                        >
                          <p className="text-sm text-gray-700 leading-snug">
                            {skill}
                          </p>

                          {/* Observed */}
                          <div className="flex justify-center">
                            <Controller
                              control={control}
                              name={`competencies.${idx}.observed`}
                              render={({ field }) => (
                                <YesNoDropdown
                                  value={field.value as string | null}
                                  onChange={field.onChange}
                                />
                              )}
                            />
                          </div>

                          {/* Under Supervision */}
                          <div className="flex justify-center">
                            <Controller
                              control={control}
                              name={`competencies.${idx}.performed_under_supervision`}
                              render={({ field }) => (
                                <YesNoDropdown
                                  value={field.value as string | null}
                                  onChange={field.onChange}
                                />
                              )}
                            />
                          </div>

                          {/* Consistently to Standard */}
                          <div className="flex justify-center">
                            <Controller
                              control={control}
                              name={`competencies.${idx}.performed_consistently`}
                              render={({ field }) => (
                                <YesNoDropdown
                                  value={field.value as string | null}
                                  onChange={field.onChange}
                                />
                              )}
                            />
                          </div>

                          {/* Rating */}
                          <div className="flex justify-center">
                            <Controller
                              control={control}
                              name={`competencies.${idx}.rating`}
                              render={({ field }) => (
                                <RatingPicker
                                  value={field.value}
                                  onChange={field.onChange}
                                />
                              )}
                            />
                          </div>

                          {/* Comments */}
                          <input
                            type="text"
                            placeholder="Add comment…"
                            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1"
                            style={{ "--tw-ring-color": BRAND } as any}
                            {...register(`competencies.${idx}.comments`)}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Readiness Summary */}
        {logSections.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-sm font-bold text-gray-800 mb-4">
              Section Readiness Summary
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Strengths Observed
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe observed strengths…"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": BRAND } as any}
                  {...register("strengths_observed")}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Development Gaps
                </label>
                <textarea
                  rows={3}
                  placeholder="Note any development gaps…"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": BRAND } as any}
                  {...register("development_gaps")}
                />
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        {logSections.length > 0 && (
          <div className="flex items-center justify-between pb-8">
            <p className="text-xs text-gray-400">
              {SKILL_LOG_FORM_COPY.submitHint}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmit((v) => onSubmit(v, true))}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {isEditMode
                  ? SKILL_LOG_FORM_COPY.updateDraft
                  : SKILL_LOG_FORM_COPY.saveDraft}
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmit((v) => onSubmit(v, false))}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm hover:opacity-90 transition disabled:opacity-50"
                style={{ background: BRAND }}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {SKILL_LOG_FORM_COPY.submitForSignOff}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

export default function SkillLogFormPage() {
  return (
    <Suspense
      fallback={<FormPageSkeleton />}
    >
      <SkillLogFormPageContent />
    </Suspense>
  );
}
