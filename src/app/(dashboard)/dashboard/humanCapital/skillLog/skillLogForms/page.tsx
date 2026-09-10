"use client";

import { Suspense, useMemo, useEffect } from "react";
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
  getModuleRoute,
  SKILL_LOG_FORM_COPY,
} from "@/lib/moduleRegistry";
import { useGradeLevelsConfig } from "@/hooks/useGradeLevelsConfig";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canFillSkillLog } from "@/lib/skillLogAccess";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import {
  canParticipateAsProgramSubject,
  consultantSelfServiceBlockedMessage,
  isConsultantEmployee,
} from "@/lib/consultantPrograms";
import {
  SKILL_LOG_MODULE_ID,
  SKILL_LOG_TIER_AUTH_LIST,
  type SystemOption,
} from "@/lib/systemDefinitions";
import type {
  SkillLogTemplateSection,
  SkillLogTemplateVariant,
} from "@/lib/skillLog/templates";
import {
  hasCompleteSkillLogPlacement,
  resolveSkillLogTemplateVariants,
  sectionsForSkillVariant,
} from "@/lib/skillLog/templates";

const BRAND = "#C62828";
const BRAND_LIGHT = "#FFEBEE";
const SKILL_LOG_ROUTE =
  getModuleRoute("mod:skill-log") ?? "/dashboard/humanCapital/skillLog";

function optionValue(opt: SystemOption): string {
  return opt.legacy_value ?? opt.label;
}

interface UserProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  grade_level: string;
  role?: string;
  user_role_label?: string | null;
  supervisor_id?: string | null;
  site_id?: string | null;
  business_unit_id?: string | null;
  department_id?: string | null;
  section_id?: string | null;
  position_id?: string | null;
  grade_level_id?: string | null;
}

// Competency rows come from the Skill log scope template that matches the
// selected employee's org placement (System Definitions > Skill Log).
// ─── Review date helper ─────────────────────────────────────────────────────
// review_period is still stored as a plain string (no schema change), but the
// UI now captures it as a single calendar date (YYYY-MM-DD, matching what a
// native <input type="date"> reads and writes) instead of a Quarter dropdown.
// Older logs may still hold a legacy "Q1 2026"-style value — ISO_DATE_RE lets
// us tell those apart so we don't try to display them inside the date input.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  employee_id: z.string().min(1, "Select an employee"),
  log_type: z.string().min(1, "Select a skill"),
  review_period: z.string().min(1, "Date is required"),
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
        className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:bg-gray-50 ${error ? "border-red-400" : "border-gray-200"}`}
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
        <option value="" disabled hidden>
          Select
        </option>
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
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;

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
  const accessProfile = resolveAccessProfile(supervisor, sessionRole);
  const { data: groupPresetData } = useGroupPresets();
  const { config: gradeLevelsConfig } = useGradeLevelsConfig();
  const isConsultantSupervisor = isConsultantEmployee(
    supervisor?.grade_level,
    gradeLevelsConfig,
  );
  const canFill = accessProfile
    ? canFillSkillLog(accessProfile, groupPresetData?.presets, sessionRole)
    : false;

  useEffect(() => {
    if (allUsers.length > 0 && supervisorId && !supervisor) return; // still loading
    if (!isEditMode && supervisor && (isConsultantSupervisor || !canFill)) {
      router.replace(SKILL_LOG_ROUTE);
    }
  }, [
    supervisor,
    router,
    allUsers.length,
    supervisorId,
    isConsultantSupervisor,
    canFill,
    isEditMode,
  ]);

  const getAuthHeaders = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchOptions = async (optionList: string) => {
    const res = await api.get("/system-definitions/options", {
      params: {
        module_id: SKILL_LOG_MODULE_ID,
        option_list: optionList,
      },
    });
    return res.data.data as SystemOption[];
  };

  const { data: tierAuthOptions = [], isLoading: loadingTierAuth } = useQuery({
    queryKey: ["skill_log_options", SKILL_LOG_TIER_AUTH_LIST],
    queryFn: () => fetchOptions(SKILL_LOG_TIER_AUTH_LIST),
  });

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

  const watchedEmployeeId = watch("employee_id");

  const directReports = useMemo(
    () =>
      allUsers.filter(
        (u) =>
          u.supervisor_id === supervisorId &&
          canParticipateAsProgramSubject(u.grade_level, gradeLevelsConfig),
      ),
    [allUsers, supervisorId, gradeLevelsConfig],
  );

  const selectedEmployee = useMemo(
    () => allUsers.find((u) => u.user_id === watchedEmployeeId) ?? null,
    [allUsers, watchedEmployeeId],
  );

  const employeeOrgPlacement = useMemo(
    () => ({
      site_id: selectedEmployee?.site_id ?? null,
      business_unit_id: selectedEmployee?.business_unit_id ?? null,
      department_id: selectedEmployee?.department_id ?? null,
      section_id: selectedEmployee?.section_id ?? null,
      position_id: selectedEmployee?.position_id ?? null,
      grade_level_id: selectedEmployee?.grade_level_id ?? null,
    }),
    [selectedEmployee],
  );
  const hasCompleteOrgPlacement = hasCompleteSkillLogPlacement(employeeOrgPlacement);

  const { data: skillLogTemplate, isLoading: loadingTemplate } = useQuery<{
    id: string | null;
    sections: SkillLogTemplateSection[];
    skill_variants?: SkillLogTemplateVariant[];
    skill_options?: string[];
    tier_auth_options?: string[];
    section_label: string | null;
    position_label: string | null;
  } | null>({
    queryKey: ["skill_log_template", employeeOrgPlacement],
    queryFn: async () => {
      const res = await api.get("/skillLog/template", {
        params: employeeOrgPlacement,
      });
      return res.data.data;
    },
    enabled: !!selectedEmployee,
  });

  const templateSkillVariants = useMemo(
    () =>
      skillLogTemplate
        ? resolveSkillLogTemplateVariants({
            sections: skillLogTemplate.sections ?? [],
            skill_variants: skillLogTemplate.skill_variants ?? [],
          })
        : [],
    [skillLogTemplate],
  );

  const skillOptions = useMemo(() => {
    if (skillLogTemplate?.skill_options?.length) {
      return skillLogTemplate.skill_options;
    }
    return templateSkillVariants.map((v) => v.name).filter(Boolean);
  }, [skillLogTemplate, templateSkillVariants]);

  const skillOptionMeta = useMemo(() => {
    const map = new Map<string, { sections: number; items: number }>();
    for (const variant of templateSkillVariants) {
      const sections = variant.sections.filter((s) => s.skills.length > 0);
      map.set(variant.name, {
        sections: sections.length,
        items: sections.reduce((total, s) => total + s.skills.length, 0),
      });
    }
    return map;
  }, [templateSkillVariants]);

  const watchedLogType = watch("log_type");

  const matchedTemplateSections = useMemo(() => {
    if (!skillLogTemplate?.id || templateSkillVariants.length === 0) return [];
    return sectionsForSkillVariant(templateSkillVariants, watchedLogType).filter(
      (s) => s.skills.length > 0,
    );
  }, [skillLogTemplate?.id, templateSkillVariants, watchedLogType]);

  const hasMatchedTemplate = templateSkillVariants.length > 0;

  const templateTierOptions = useMemo(() => {
    const fromTemplate = (skillLogTemplate?.tier_auth_options ?? [])
      .map((label) => label.trim())
      .filter(Boolean);
    if (fromTemplate.length > 0) return fromTemplate;
    return tierAuthOptions.map((opt) => optionValue(opt)).filter(Boolean);
  }, [skillLogTemplate, tierAuthOptions]);

  const watchedReviewPeriod = watch("review_period");

  useEffect(() => {
    if (isEditMode) return;
    if (!selectedEmployee) {
      replace([]);
      setValue("section", "");
      setValue("log_type", "");
      return;
    }
    if (skillLogTemplate?.section_label) {
      setValue("section", skillLogTemplate.section_label);
    }
    if (!hasMatchedTemplate) {
      replace([]);
      setValue("log_type", "");
      return;
    }
    if (!watchedLogType && skillOptions.length === 1) {
      setValue("log_type", skillOptions[0]);
    }
  }, [
    isEditMode,
    selectedEmployee,
    hasMatchedTemplate,
    skillLogTemplate,
    skillOptions,
    watchedLogType,
    replace,
    setValue,
  ]);

  useEffect(() => {
    if (isEditMode) return;
    if (!selectedEmployee || !watchedLogType || matchedTemplateSections.length === 0) {
      if (!isEditMode && selectedEmployee && !watchedLogType) {
        replace([]);
      }
      return;
    }
    replace(
      matchedTemplateSections.flatMap((section) =>
        section.skills.map((skill) => ({
          skill,
          observed: null,
          performed_under_supervision: null,
          performed_consistently: null,
          rating: null,
          comments: "",
        })),
      ),
    );
  }, [
    isEditMode,
    selectedEmployee,
    watchedLogType,
    matchedTemplateSections,
    replace,
  ]);

  // Populate form in edit mode
  // Populate form in edit mode
  useEffect(() => {
    if (!existingLog) return;
    const comp = existingLog.skill_log_competencies ?? [];

    // Only pre-fill the date input when the existing value is already in
    // the YYYY-MM-DD shape it expects. A legacy value (e.g. a pre-date-picker
    // "Q1 2026" string) leaves the picker blank and is shown as a reference
    // caption instead.
    const existingReviewPeriod = ISO_DATE_RE.test(existingLog.review_period)
      ? existingLog.review_period
      : "";

    reset({
      employee_id: existingLog.employee_id ?? "",
      log_type: existingLog.log_type ?? "",
      review_period: existingReviewPeriod,
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

  const logSections = useMemo(() => {
    if (isEditMode && fields.length > 0) {
      const savedSkills = fields.map((f) => f.skill);
      if (!hasMatchedTemplate) {
        return [{ key: "existing", title: "Competencies", skills: savedSkills }];
      }
      const saved = new Set(savedSkills);
      const grouped = matchedTemplateSections
        .map((s) => ({ ...s, skills: s.skills.filter((sk) => saved.has(sk)) }))
        .filter((s) => s.skills.length > 0);
      const groupedSkills = new Set(grouped.flatMap((s) => s.skills));
      const leftovers = savedSkills.filter((sk) => !groupedSkills.has(sk));
      if (leftovers.length > 0) {
        return [...grouped, { key: "other", title: "Competencies", skills: leftovers }];
      }
      return grouped.length > 0
        ? grouped
        : [{ key: "existing", title: "Competencies", skills: savedSkills }];
    }
    if (hasMatchedTemplate) return matchedTemplateSections;
    return [];
  }, [hasMatchedTemplate, matchedTemplateSections, isEditMode, fields]);

  const optionsLoading = loadingTierAuth;

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
            <Controller
              control={control}
              name="employee_id"
              render={({ field }) => (
                <FormSelect
                  label="Employee"
                  error={errors.employee_id?.message}
                  disabled={isEditMode}
                  {...field}
                >
                  <option value="">
                    {directReports.length === 0
                      ? "No direct reports assigned to you"
                      : "— Select employee —"}
                  </option>
                  {directReports.map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.first_name} {u.last_name}
                      {u.grade_level ? ` (${u.grade_level})` : ""}
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

            <Controller
              control={control}
              name="log_type"
              render={({ field }) => (
                <div>
                  <FormSelect
                    label="Skill"
                    error={errors.log_type?.message}
                    disabled={
                      isEditMode ||
                      !watchedEmployeeId ||
                      (loadingTemplate && skillOptions.length === 0)
                    }
                    {...field}
                  >
                    <option value="">
                      {!watchedEmployeeId
                        ? "Select an employee first"
                        : skillOptions.length === 0
                          ? "No skills configured for this role"
                          : "— Choose which skill log to fill —"}
                    </option>
                    {skillOptions.map((label) => {
                      const meta = skillOptionMeta.get(label);
                      const suffix =
                        meta && meta.items > 0
                          ? ` (${meta.sections} sections, ${meta.items} items)`
                          : "";
                      return (
                        <option key={label} value={label}>
                          {label}
                          {suffix}
                        </option>
                      );
                    })}
                    {isEditMode &&
                      existingLog?.log_type &&
                      !skillOptions.includes(existingLog.log_type) && (
                        <option value={existingLog.log_type}>
                          {existingLog.log_type}
                        </option>
                      )}
                  </FormSelect>
                  {watchedEmployeeId &&
                    skillOptions.length > 1 &&
                    !watchedLogType &&
                    !isEditMode && (
                      <p className="text-xs text-amber-700 mt-1.5 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                        This role has {skillOptions.length} skill logs — pick the
                        one you are assessing today (e.g. breeding vs feed prep).
                      </p>
                    )}
                </div>
              )}
            />

            <FormInput
              label="Section"
              readOnly
              disabled
              value={watch("section") || "—"}
            />
            <input type="hidden" {...register("section")} />

            <Controller
              control={control}
              name="tier_auth"
              render={({ field }) => (
                <FormSelect
                  label="Tier Authorisation"
                  error={errors.tier_auth?.message}
                  disabled={optionsLoading && templateTierOptions.length === 0}
                  {...field}
                >
                  <option value="">— Select tier —</option>
                  {templateTierOptions.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                  {isEditMode &&
                    existingLog?.tier_auth &&
                    !templateTierOptions.includes(existingLog.tier_auth) && (
                      <option value={existingLog.tier_auth}>
                        {existingLog.tier_auth}
                      </option>
                    )}
                </FormSelect>
              )}
            />

            <div>
              <FormInput
                label="Date"
                type="date"
                error={errors.review_period?.message}
                {...register("review_period")}
              />
              {isEditMode &&
                existingLog?.review_period &&
                !ISO_DATE_RE.test(existingLog.review_period) &&
                !watchedReviewPeriod && (
                  <p className="text-xs text-gray-400 mt-1">
                    Currently: {existingLog.review_period} — pick a new date
                    to replace this.
                  </p>
                )}
            </div>

          </div>
        </div>

        {!isEditMode && logSections.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl bg-white">
            {loadingTemplate && selectedEmployee ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading this employee&apos;s skill log form…
              </span>
            ) : !watchedEmployeeId ? (
              "Select an employee above to load the skill log form"
            ) : !hasCompleteOrgPlacement ? (
              "This employee's org placement (Site/Business unit/Department/Section/Position/Grade level) isn't fully set up yet — ask HR to complete it in Manage User before a skill log can be filled."
            ) : !hasMatchedTemplate ? (
              "No skill log form has been configured yet for this employee's exact Site/Business unit/Department/Section/Position/Grade level combination — ask HR to set one up under Manage skill logs."
            ) : !watchedLogType ? (
              "Select a skill above to load the competency checklist for this employee."
            ) : (
              "This skill has no competency lines configured yet — ask HR to complete the setup under Manage skill logs."
            )}
          </div>
        )}

        {/* Competency Table */}
        {logSections.length > 0 && fields.length > 0 && (
          <div className="space-y-3">
            {watchedLogType && (
              <div
                className="rounded-xl border px-4 py-3 flex items-center gap-3"
                style={{ borderColor: BRAND, background: BRAND_LIGHT }}
              >
                <ClipboardList className="w-5 h-5 flex-shrink-0" style={{ color: BRAND }} />
                <div>
                  <p
                    className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: BRAND }}
                  >
                    Filling skill log
                  </p>
                  <p className="text-sm font-bold text-gray-900">{watchedLogType}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {logSections.length} section{logSections.length !== 1 ? "s" : ""} ·{" "}
                    {fields.length} competenc{fields.length !== 1 ? "ies" : "y"}
                  </p>
                </div>
              </div>
            )}

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
