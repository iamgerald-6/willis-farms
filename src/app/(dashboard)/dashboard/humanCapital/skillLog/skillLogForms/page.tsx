"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
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

const BRAND = "#C62828";
const BRAND_LIGHT = "#FFEBEE";

interface UserProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  grade_level: string;
}

interface SkillSection {
  title: string;
  skills: string[];
}

const LOG_TYPES: Record<string, SkillSection[]> = {
  "GP Breeding & Farrowing (Integrated)": [
    {
      title: "Animal Identification and Section Basics",
      skills: [
        "Identifies sows correctly",
        "Identifies gilts correctly",
        "Recognises section groupings and pen layout",
        "Handles movement within section correctly",
        "Maintains calm animal-handling discipline",
        "Respects genetic-tier handling rules",
      ],
    },
    {
      title: "Heat Detection and Breeding Support",
      skills: [
        "Supports boar exposure routine correctly",
        "Observes and reports heat signs accurately",
        "Identifies sow/gilt readiness for service",
        "Prepares breeding/service area correctly",
        "Maintains breeding-area hygiene",
        "Assists AI process only within authorised scope",
        "Escalates irregular reproductive observations promptly",
      ],
    },
    {
      title: "Artificial Insemination (AI) Competence",
      skills: [
        "Understands AI timing and breeding workflow discipline",
        "Understands role limits in AI activities",
        "Prepares AI area and equipment correctly",
        "Maintains AI hygiene and contamination-control standards",
        "Confirms identification of breeding females correctly",
        "Supports proper restraint and handling for AI procedures",
        "Supports AI process in correct sequence",
        "Performs AI only within trained and authorised scope",
        "Maintains discipline in timing and service flow",
        "Completes AI records accurately and promptly",
        "Reports returns, irregular discharge, poor response, or abnormalities promptly",
        "Maintains biosecurity, tier-discipline, and PPE compliance during AI routines",
        "Reinforces AI standards among junior staff",
        "Identifies AI workflow problems and escalates them appropriately",
      ],
    },
    {
      title: "Gilt Development Support",
      skills: [
        "Supports gilt acclimatisation routines correctly",
        "Monitors gilt growth, conformation, and underline correctly",
        "Supports boar-exposure programme for gilts",
        "Records heat events for individual gilts accurately",
        "Identifies gilts approaching first service correctly",
        "Recognises gilts to be culled and reports appropriately",
      ],
    },
    {
      title: "Gestation and Sow Management",
      skills: [
        "Observes appetite and feeding response correctly",
        "Observes body condition appropriately",
        "Reports lameness, weakness, or distress promptly",
        "Monitors water access and reports issues",
        "Supports section movement and grouping discipline",
        "Maintains barn cleanliness and order",
        "Supports pregnancy-confirmation routines correctly",
      ],
    },
    {
      title: "Records and Compliance",
      skills: [
        "Completes routine section records accurately",
        "Records observations clearly and legibly",
        "Reports missing or unusual data promptly",
        "Follows SOPs consistently",
        "Complies with PPE requirements",
        "Maintains strict biosecurity discipline",
        "Maintains strict genetic-tier discipline",
      ],
    },
    {
      title: "Farrowing Room Preparation",
      skills: [
        "Prepares farrowing space correctly",
        "Maintains room hygiene standards",
        "Ensures equipment and materials are ready",
        "Supports sow readiness checks correctly",
        "Maintains orderly and clean farrowing workflow",
      ],
    },
    {
      title: "Sow and Piglet Observation",
      skills: [
        "Observes sow behaviour and readiness signs",
        "Identifies sow distress and reports promptly",
        "Identifies weak or chilled piglets",
        "Observes piglet vitality correctly",
        "Reports litter abnormalities promptly",
        "Identifies crushing risk situations",
        "Recognises mastitis, metritis, and agalactia signs and reports promptly",
      ],
    },
    {
      title: "Piglet Care",
      skills: [
        "Supports piglet-care protocols correctly",
        "Handles piglets carefully and correctly",
        "Supports colostrum management correctly",
        "Supports litter checks consistently",
        "Supports cross-fostering activities correctly where instructed",
        "Maintains piglet-care hygiene standards",
        "Escalates piglet mortality or welfare concerns promptly",
      ],
    },
    {
      title: "Farrowing Records and Compliance",
      skills: [
        "Records litter and piglet-care events accurately",
        "Completes farrowing checklists correctly",
        "Maintains farrowing-room records on time",
        "Follows farrowing SOPs consistently",
        "Complies with PPE requirements",
        "Maintains strict biosecurity discipline",
        "Maintains strict tier-discipline (litter-to-sow-to-tier linkage)",
      ],
    },
  ],
  "Feed Preparation (L1-L3 Duty)": [
    {
      title: "Ingredient Receipt and Quality Control",
      skills: [
        "Receives ingredients against supplier documentation correctly",
        "Performs visual quality and weighing checks correctly",
        "Submits mycotoxin samples per the Veterinarian's protocol",
        "Records ingredient batch IDs in the goods-received register",
        "Recognises and rejects out-of-spec ingredients",
      ],
    },
    {
      title: "Ingredient Storage",
      skills: [
        "Applies first-in / first-out rotation correctly",
        "Maintains moisture and pest control in the ingredient store",
        "Separates ingredient categories correctly",
        "Conducts weekly stock checks and reports low cover promptly",
      ],
    },
    {
      title: "Milling and Mixing",
      skills: [
        "Operates the mill safely (PPE, lockout, safety guards)",
        "Achieves target particle size (70% in 0.4-1.1 mm; minimal less than 0.2 mm)",
        "Mixes batches strictly to the veterinary-approved formulation",
        "Executes mill cleaning between rations correctly",
        "Identifies and escalates mixing or milling faults promptly",
      ],
    },
    {
      title: "Bagging, Dispatch, and Handling",
      skills: [
        "Bags finished feed in 50 kg sacks accurately",
        "Labels sacks correctly (ration, date, batch ID)",
        "Places sacks at the dispatch pad per the handover protocol",
        "Safely lifts and carries 50 kg sacks using correct manual-handling technique",
        "Coordinates two-person handling for awkward loads where required",
      ],
    },
    {
      title: "Mill Biosecurity and Records",
      skills: [
        "Wears designated mill-day PPE; observes the mill-zone discipline",
        "Showers and changes correctly before re-entering the GP barn after a milling shift",
        "Completes batch records fully",
        "Completes the daily handoff log at the dispatch pad",
        "Escalates ingredient quality, formulation, or biosecurity concerns immediately",
      ],
    },
  ],
  "Daily Barn Cleaning and Sanitation": [
    {
      title: "Daily Cleaning Routines",
      skills: [
        "Performs daily pen cleaning correctly",
        "Cleans feeders and drinkers daily; checks drinker flow",
        "Sweeps and washes passageways, anterooms, and equipment storage",
        "Maintains section-specific tool discipline",
        "Wears clean PPE at shift start; bags soiled PPE for laundry per protocol",
      ],
    },
    {
      title: "Wet-and-Dry Cleaning and Disinfection (Between Batches)",
      skills: [
        "Executes complete wash, disinfection, and drying of farrowing crates and rooms",
        "Selects and applies the correct disinfectant at the correct concentration",
        "Confirms dry time before re-stocking",
        "Cleans cleaning equipment after use",
      ],
    },
    {
      title: "Manure Handling and Records",
      skills: [
        "Collects manure and transports to the designated pit correctly",
        "Disinfects manure-handling equipment after each use",
        "Completes the daily cleaning log accurately",
        "Submits the log for weekly audit by the L4 Herd Supervisor/Manager",
      ],
    },
  ],
  "Incoming Semen Receiving (Multiplication Farm)": [
    {
      title: "Receipt, Inspection, and Storage",
      skills: [
        "Verifies supplier documentation on each delivery",
        "Checks transport temperature, packaging integrity, and labelling on receipt",
        "Performs incoming-dose visual and motility acceptance check per the receiving SOP",
        "Records each accepted dose against supplier batch and intended service group",
        "Stores received doses correctly (temperature, rotation, shelf-life)",
        "Rejects and escalates any out-of-specification semen per the SOP",
      ],
    },
  ],
  "Grower-Finisher (Multiplication Farm Output)": [
    {
      title: "Weaner, Grower, and Finisher Husbandry",
      skills: [
        "Identifies animals by class correctly",
        "Follows phase-feeding programme correctly",
        "Checks feeders and water access correctly",
        "Maintains pen cleanliness and order",
        "Maintains correct stocking density",
        "Observes appetite, behaviour, and welfare correctly",
        "Recognises and reports lameness, tail-biting, skin issues, respiratory signs promptly",
      ],
    },
    {
      title: "Growth Monitoring",
      skills: [
        "Supports weighing protocols correctly",
        "Records pen and batch weights accurately",
        "Calculates batch ADG correctly (L3+)",
        "Identifies under-performing animals or pens and reports",
        "Identifies dispatch-ready animals against weight targets",
      ],
    },
    {
      title: "Mortality and Welfare",
      skills: [
        "Records mortality daily with cause-of-death note",
        "Supports post-mortem activities under veterinary direction",
        "Handles welfare interventions per SOP and veterinary instruction",
        "Manages sick pens and recovery animals correctly",
        "Escalates unusual mortality patterns immediately",
      ],
    },
    {
      title: "Dispatch Preparation and Loading",
      skills: [
        "Confirms dispatch readiness against weight band",
        "Confirms withdrawal-period clearance with the Veterinarian",
        "Confirms animal ID against dispatch list",
        "Loads animals calmly and safely; uses correct ramp angle and gates",
        "Refuses dispatch of welfare- or health-compromised animals",
        "Completes dispatch documentation correctly",
        "Maintains transport biosecurity (vehicle cleaned, driver briefed)",
      ],
    },
    {
      title: "Biosecurity, Hygiene, and Records",
      skills: [
        "Maintains separation between grower-finisher and breeding-side flows",
        "Performs end-of-batch cleaning and disinfection correctly",
        "Records all feed deliveries, mortality, treatments, and dispatch movements accurately",
        "Complies with PPE requirements",
        "Maintains strict biosecurity discipline",
      ],
    },
  ],
};

const LOG_TYPE_OPTIONS = Object.keys(LOG_TYPES);
const ALL_GRADES = ["L1", "L2", "L3", "L4", "L5", "L6"];

function gradeLevel(grade: string) {
  return parseInt(grade.replace(/\D/g, ""), 10) || 0;
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
  log_type: z.string().min(1, "Select a log type"),
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

  const supervisorGradeLevel = gradeLevel(supervisor?.grade_level ?? "L1");

  useEffect(() => {
    if (allUsers.length > 0 && supervisorId && !supervisor) return; // still loading
    if (supervisor && supervisorGradeLevel < 4) {
      router.replace("/dashboard/humanCapital/skillLog");
    }
  }, [supervisor, supervisorGradeLevel, router, allUsers.length, supervisorId]);

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
    () => ALL_GRADES.filter((g) => gradeLevel(g) < supervisorGradeLevel),
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
    const sections = LOG_TYPES[watchedLogType] ?? [];
    replace(
      sections.flatMap((sec) =>
        sec.skills.map((skill) => ({
          skill,
          observed: null,
          performed_under_supervision: null,
          performed_consistently: null,
          rating: null,
          comments: "",
        })),
      ),
    );
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
    router.push("/dashboard/humanCapital/skillLog");
  };

  // Map skill name to field array index for rendering
  const skillIndexMap = useMemo(() => {
    const map: Record<string, number> = {};
    fields.forEach((f, i) => {
      map[f.skill] = i;
    });
    return map;
  }, [fields]);

  const logSections = watchedLogType ? (LOG_TYPES[watchedLogType] ?? []) : [];

  if (isEditMode && loadingExisting) {
    return <FormPageSkeleton />;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditMode ? "Edit Skills Log" : "Fill Skills Log"}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {isEditMode ? "Editing draft — " : "Filling as "}
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
              Higher-manager sign-off happens after submission
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
                {isEditMode ? "Update Draft" : "Save Draft"}
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
                Submit for Sign-Off
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
