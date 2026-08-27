"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { User } from "@/types";
import api from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import {
  ChevronDown,
  ClipboardList,
  CalendarRange,
  Loader2,
  CheckCircle2,
  User as UserIcon,
  AlertCircle,
  Info,
  Award,
  Lock,
  CalendarClock,
} from "lucide-react";
import {
  Ratings,
  SectionRatings,
  computeWeightedScore,
  ITEM_RATING_MIN,
  ITEM_RATING_MAX,
} from "@/lib/appraisal/scoring";
import {
  Quarter,
  canRate,
  canAppraiseOthers,
  supervisableGradeBands,
  sectionsFor,
} from "@/lib/appraisal/sections";
import { useGradeLevelsConfig } from "@/hooks/useGradeLevelsConfig";
import { useAppraisalScopeConfig } from "@/hooks/useAppraisalScopeConfig";
import { resolveAppraisalFormKey } from "@/lib/systemDefinitions/appraisalScopeConfig";
import { resolveAppraisalSupervisorFields } from "@/lib/appraisal/supervisorDisplay";
import { isOwnAppraisal } from "@/lib/appraisal/roles";
import { isSuperAdmin as checkIsSuperAdmin } from "@/lib/accessControl";
import {
  computeDeadline,
  getActiveAppraisalPeriod,
  isPeriodAlreadyAppraised,
  isPeriodOpenForNewAppraisal,
  periodLabel as appraisalPeriodLabel,
} from "@/lib/appraisal/deadlines";
import { DeadlineBanner } from "./DeadlineBanner";
import { FormPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { getPromotionReadinessOptions } from "@/lib/moduleRegistry";
import {
  APPRAISAL_MODULE_ID_CONST,
  APPRAISAL_SECTION_AUTH_LIST,
  applySectionBaseWeights,
  applySectionContentOverrides,
  applySectionWeightRules,
  type ModuleBusinessLogic,
  type SystemOption,
} from "@/lib/systemDefinitions";
import { useAppraisalFormProgress } from "@/lib/appraisal/appraisalFormProgress";

// Shape of an existing appraisal fetched from the API
interface ExistingAppraisal {
  id: string;
  company_id: string;
  employee_name: string;
  job_title: string;
  current_grade: string;
  grade_band: string;
  cycle: "quarterly" | "annual";
  review_quarter: Quarter;
  review_year: number;
  immediate_supervisor: string;
  supervisor_email?: string | null;
  supervisor_id?: string | null;
  employee_email?: string | null;
  reviewing_manager?: string | null;
  period_covered?: string | null;
  section_authorisations_held?: string | null;
  employee_user_id?: string | null;
  submitted_by?: "employee" | "supervisor" | "both";
  employee_ratings?: Ratings | null;
  supervisor_ratings?: Ratings | null;
  status?: string;
  deadline_at?: string | null;
  reopened_deadline_at?: string | null;
  locked_reason?: "employee_incomplete" | "supervisor_incomplete" | "reopen_incomplete" | null;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function inputCls(hasError?: boolean) {
  return [
    "w-full border rounded-lg px-3 py-2 text-sm text-gray-900 transition",
    "focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent",
    "placeholder:text-gray-400",
    hasError ? "border-red-300 bg-red-50" : "border-gray-200 bg-white",
  ].join(" ");
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
        {label}
        <Lock className="inline w-3 h-3 ml-1 text-gray-300" />
      </label>
      <div className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-700 bg-gray-50 min-h-[38px]">
        {value || <span className="text-gray-300">—</span>}
      </div>
    </div>
  );
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
}

// ─── Rating Selector (1–5) ────────────────────────────────────────────────────
function RatingSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 w-full sm:w-auto">
      {Array.from(
        { length: ITEM_RATING_MAX - ITEM_RATING_MIN + 1 },
        (_, i) => ITEM_RATING_MIN + i,
      ).map((n) => {
        const selected = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`Rate ${n} out of 5`}
            className={`w-7 h-7 rounded-lg text-xs font-bold border transition-colors ${
              selected
                ? "bg-[#1e3a5f] text-white border-transparent"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

// ─── Section Block ────────────────────────────────────────────────────────────
function SectionBlock({
  section,
  ratings,
  onRatingChange,
  onCommentChange,
}: {
  section: { key: string; title: string; weight: number; items: string[] };
  ratings: SectionRatings;
  onRatingChange: (item: string, rating: number) => void;
  onCommentChange: (item: string, comment: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#1e3a5f] text-white text-sm font-semibold"
      >
        <div className="flex items-center gap-3">
          <span>
            {section.key}. {section.title}
          </span>
          <span className="text-xs bg-white/15 px-2 py-0.5 rounded-full text-white/70">
            Weight: {Math.round(section.weight * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ChevronDown
            className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      {expanded && (
        <div className="divide-y divide-gray-100">
          <div className="grid grid-cols-[1fr_auto_240px] gap-3 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <span>Review Area</span>
            <span>Rating (1–5)</span>
            <span>Comments</span>
          </div>
          {section.items.map((item) => {
            const row = ratings[item] ?? { rating: null, comment: "" };
            return (
              <div
                key={item}
                className="grid grid-cols-1 sm:grid-cols-[1fr_auto_240px] gap-3 items-center px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm text-gray-700 leading-snug">
                  {item}
                </span>
                <RatingSelector
                  value={row.rating}
                  onChange={(v) => onRatingChange(item, v)}
                />
                <input
                  type="text"
                  placeholder="Add comment..."
                  value={row.comment ?? ""}
                  onChange={(e) => onCommentChange(item, e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PROMOTION_OPTIONS = getPromotionReadinessOptions();

// ─── Main Form ────────────────────────────────────────────────────────────────
interface AppraisalFormProps {
  /** grade_level of the person currently logged in, e.g. "L4". Used only as a
   *  fallback until their profile loads — which side of the form they fill is
   *  decided by who the appraisal is for, not by their grade. */
  viewerGradeLevel?: string | null;
  /** If set, the form is in "second-party fill" mode:
   *  it fetches this appraisal, pre-fills read-only fields,
   *  and PATCHes on submit instead of POSTing. */
  existingAppraisalId?: string | null;
  /** Quarter / year for a fresh appraisal. Always the single active period
   *  (grace-aware). Ignored once an existing appraisal is loaded. */
  defaultQuarter?: Quarter;
  defaultYear?: number;
  onSuccess?: () => void;
}

export default function AppraisalForm({
  viewerGradeLevel = null,
  existingAppraisalId = null,
  defaultQuarter,
  defaultYear,
  onSuccess,
}: AppraisalFormProps) {
  const { setCompletionPct } = useAppraisalFormProgress();
  const activePeriod = getActiveAppraisalPeriod();
  const lockedQuarter = defaultQuarter ?? activePeriod.quarter;
  const lockedYear = defaultYear ?? activePeriod.year;
  const { config: gradeConfig } = useGradeLevelsConfig();
  const {
    scopeConfig,
    formOptions: appraisalFormOptions,
    formKeyCovers: appraisalFormKeyCovers,
  } = useAppraisalScopeConfig();
  // ── Auth ──
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });
  const userId = session?.user?.id;

  // ── Fetch existing appraisal if id provided ──
  const { data: existingAppraisal, isLoading: loadingExisting } =
    useQuery<ExistingAppraisal>({
      queryKey: ["appraisal", existingAppraisalId],
      queryFn: async () => {
        const res = await api.get(`/appraisal/${existingAppraisalId}`);
        return res.data.data;
      },
      enabled: !!existingAppraisalId,
    });

  // ── Is this the second party filling? ──
  const isFillingSecond = !!existingAppraisalId && !!existingAppraisal;
  const isLocked = existingAppraisal?.status === "locked";

  // ── Local state ──
  const [gradeBand, setGradeBand] = useState<string>("L1");
  // Fresh fills are locked to the single active period — never free-picked.
  const [quarter, setQuarter] = useState<Quarter>(lockedQuarter);
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  /** Fresh fills only: is this my own appraisal, or one I supervise? */
  const [fillTarget, setFillTarget] = useState<"self" | "other">("self");
  const [ratings, setRatings] = useState<Ratings>({});
  const [promotionReadiness, setPromotionReadiness] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [reviewDate, setReviewDate] = useState("");
  /** Which user_id is picked in the "Immediate Supervisor" dropdown — the
   * name and email that actually get submitted are looked up from this and
   * written via setValue (see handleSupervisorSelect), so there's no way to
   * pick a supervisor's name without their email coming along with it. */
  const [selectedSupervisorId, setSelectedSupervisorId] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      section_authorisations_held: "",
      immediate_supervisor: "",
      supervisor_email: "",
      employee_email: "",
      review_year: lockedYear,
      reviewing_manager: "",
      period_covered: "",
      strengths_observed: "",
      improvement_areas: "",
      agreed_actions: "",
      employee_comments: "",
      most_significant_achievement: "",
      development_plan_next_year: "",
      promotion_readiness_assessment: "",
      compensation_review_input: "",
    },
  });

  // ── Fetch all users ──
  const { data: usersData } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const { data: sectionAuthOptions = [] } = useQuery<SystemOption[]>({
    queryKey: ["appraisal_section_authorisations"],
    queryFn: async () => {
      const res = await api.get("/system-definitions/options", {
        params: {
          module_id: APPRAISAL_MODULE_ID_CONST,
          option_list: APPRAISAL_SECTION_AUTH_LIST,
        },
      });
      return res.data.data as SystemOption[];
    },
  });

  const { data: moduleConfig } = useQuery<{
    businessLogic: ModuleBusinessLogic;
  }>({
    queryKey: ["appraisal_module_config"],
    queryFn: async () => {
      const res = await api.get(
        `/system-definitions/modules/${encodeURIComponent(APPRAISAL_MODULE_ID_CONST)}`,
      );
      return {
        businessLogic: (res.data.data?.businessLogic ??
          {}) as ModuleBusinessLogic,
      };
    },
  });

  const weightRules = moduleConfig?.businessLogic?.sectionWeightRules ?? [];
  const globalSectionWeights =
    moduleConfig?.businessLogic?.globalSectionWeights;
  const sectionBaseWeights = moduleConfig?.businessLogic?.sectionBaseWeights;
  const sectionContentOverrides =
    moduleConfig?.businessLogic?.sectionContentOverrides;
  const allUsers = usersData ?? [];

  // ── Current viewer profile ──
  const currentUserProfile = useMemo(
    () => allUsers.find((u) => u.user_id === userId),
    [allUsers, userId],
  );
  const currentUserGrade =
    currentUserProfile?.grade_level ?? viewerGradeLevel ?? null;
  const isSuperAdmin = checkIsSuperAdmin(currentUserProfile?.role);

  // ── Which side of the form am I filling? ──
  // Everyone — supervisors included — completes their own self-assessment, so
  // this depends on WHO the appraisal is for, never on the viewer's own grade.
  const viewer = useMemo(
    () => ({
      userId,
      role: currentUserProfile?.role,
      gradeLevel: currentUserGrade,
      companyId: currentUserProfile?.company_id,
    }),
    [userId, currentUserProfile, currentUserGrade],
  );

  const subject = isFillingSecond
    ? {
        employee_user_id: existingAppraisal?.employee_user_id,
        company_id: existingAppraisal?.company_id,
        current_grade: existingAppraisal?.current_grade,
      }
    : {
        employee_user_id: selectedEmployee?.user_id,
        company_id: selectedEmployee?.company_id,
        current_grade: selectedEmployee?.grade_level,
      };

  const hasSubject = isFillingSecond || !!selectedEmployee;
  const supervisorMode = hasSubject && !isOwnAppraisal(viewer, subject);
  const selfAppraisalMode = hasSubject && !supervisorMode;

  // Can this viewer appraise anyone other than themselves at all? (L4+)
  const canSelectForOthers =
    !isFillingSecond && (canAppraiseOthers(currentUserGrade) || isSuperAdmin);

  const watchedSupervisorName = watch("immediate_supervisor");
  const watchedSupervisorEmail = watch("supervisor_email");

  const displaySupervisorName =
    watchedSupervisorName || existingAppraisal?.immediate_supervisor;
  const displaySupervisorEmail =
    watchedSupervisorEmail || existingAppraisal?.supervisor_email;
  const watchedReviewYear = watch("review_year");
  const effectiveReviewYear =
    existingAppraisal?.review_year ?? Number(watchedReviewYear) ?? new Date().getFullYear();

  const showDeadlineBanner =
    !isLocked &&
    existingAppraisal?.status !== "final_reviewed" &&
    (existingAppraisal?.status === "reopened" ||
      !isFillingSecond ||
      (selfAppraisalMode &&
        existingAppraisal?.submitted_by !== "employee" &&
        existingAppraisal?.submitted_by !== "both") ||
      (supervisorMode &&
        isFillingSecond &&
        existingAppraisal?.submitted_by !== "both" &&
        existingAppraisal?.status !== "final_reviewed"));

  const allowedGradeBands = useMemo(
    () =>
      isSuperAdmin
        ? appraisalFormOptions
        : supervisableGradeBands(currentUserGrade, gradeConfig, scopeConfig),
    [
      currentUserGrade,
      gradeConfig,
      scopeConfig,
      appraisalFormOptions,
      isSuperAdmin,
    ],
  );

  const ownGradeBand = resolveAppraisalFormKey(
    currentUserGrade,
    gradeConfig,
    scopeConfig,
  );
  const fillingForSelf = !isFillingSecond && fillTarget === "self";

  // ── Pre-fill from existing appraisal when continuing a record ──
  useEffect(() => {
    if (!existingAppraisal) return;

    setGradeBand(existingAppraisal.grade_band);
    setQuarter(existingAppraisal.review_quarter);

    const emp =
      allUsers.find((u) => u.user_id === existingAppraisal.employee_user_id) ??
      allUsers.find((u) => u.company_id === existingAppraisal.company_id);
    if (emp) setSelectedEmployee(emp);

    const resolved = resolveAppraisalSupervisorFields(
      existingAppraisal,
      emp,
      allUsers,
    );

    setValue("immediate_supervisor", resolved.immediate_supervisor);
    setValue("supervisor_email", resolved.supervisor_email);
    setValue("employee_email", existingAppraisal.employee_email ?? "");
    setValue(
      "section_authorisations_held",
      existingAppraisal.section_authorisations_held ?? "",
    );
    setValue("review_year", existingAppraisal.review_year);
    setValue("reviewing_manager", existingAppraisal.reviewing_manager ?? "");
    setValue("period_covered", existingAppraisal.period_covered ?? "");

    if (resolved.supervisor_user_id) {
      setSelectedSupervisorId(resolved.supervisor_user_id);
    } else if (resolved.supervisor_email) {
      const sup = allUsers.find(
        (u) =>
          u.email?.toLowerCase() === resolved.supervisor_email.toLowerCase(),
      );
      if (sup) setSelectedSupervisorId(sup.user_id);
    }
  }, [existingAppraisal, allUsers, setValue]);

  // ── Immediate Supervisor dropdown — every user eligible to rate the
  // employee actually being appraised (self, or whoever's picked in "Select
  // Employee" below), same L4+/strictly-senior rule the rest of the
  // appraisal system already uses (canRate). Picking a name here writes
  // BOTH immediate_supervisor and supervisor_email together (see
  // handleSupervisorSelect) — there's no longer a way to attach a
  // supervisor's name without their email coming along with it, which is
  // what actually routes the "please complete your evaluation" notification. ──
  const employeeGradeForSupervisorList = fillingForSelf
    ? currentUserGrade
    : selectedEmployee?.grade_level;
  const eligibleSupervisors = useMemo(() => {
    if (isFillingSecond || !employeeGradeForSupervisorList) return [];
    const employeeId = fillingForSelf ? userId : selectedEmployee?.user_id;
    return allUsers.filter(
      (u) =>
        u.user_id !== employeeId &&
        canRate(u.grade_level, employeeGradeForSupervisorList),
    );
  }, [
    allUsers,
    isFillingSecond,
    employeeGradeForSupervisorList,
    fillingForSelf,
    userId,
    selectedEmployee,
  ]);

  const assignedSupervisor = useMemo(() => {
    const id = currentUserProfile?.supervisor_id;
    if (!id) return null;
    return allUsers.find((u) => u.user_id === id) ?? null;
  }, [allUsers, currentUserProfile?.supervisor_id]);

  const hasAssignedSupervisor = !!assignedSupervisor;

  const handleSupervisorSelect = (supervisorUserId: string) => {
    setSelectedSupervisorId(supervisorUserId);
    const sup = eligibleSupervisors.find((u) => u.user_id === supervisorUserId);
    setValue(
      "immediate_supervisor",
      sup ? `${sup.first_name} ${sup.last_name}` : "",
    );
    setValue("supervisor_email", sup?.email ?? "");
  };

  // Filling for someone I supervise — lock to my own name+email.
  // Self-appraisal: use assigned supervisor from User Management when set.
  useEffect(() => {
    if (isFillingSecond) return;
    if (!fillingForSelf && currentUserProfile) {
      setSelectedSupervisorId(currentUserProfile.user_id);
      setValue(
        "immediate_supervisor",
        `${currentUserProfile.first_name} ${currentUserProfile.last_name}`,
      );
      setValue("supervisor_email", currentUserProfile.email ?? "");
      return;
    }
    if (assignedSupervisor) {
      setSelectedSupervisorId(assignedSupervisor.user_id);
      setValue(
        "immediate_supervisor",
        `${assignedSupervisor.first_name} ${assignedSupervisor.last_name}`,
      );
      setValue("supervisor_email", assignedSupervisor.email ?? "");
      return;
    }
    setSelectedSupervisorId("");
    setValue("immediate_supervisor", "");
    setValue("supervisor_email", "");
  }, [
    fillingForSelf,
    selectedEmployee?.user_id,
    isFillingSecond,
    currentUserProfile,
    assignedSupervisor,
    setValue,
  ]);

  // ── Filter employees for a fresh supervisor fill ──
  const filteredEmployees = useMemo(() => {
    if (isFillingSecond || fillingForSelf) return [];
    const allowedGrades = new Set<string>();
    for (const band of allowedGradeBands) {
      for (const grade of appraisalFormKeyCovers[band.value] ?? []) {
        allowedGrades.add(grade);
      }
    }
    return allUsers.filter((u) => {
      if (!u.grade_level || !allowedGrades.has(u.grade_level)) return false;
      if (u.user_id === userId) return false;
      return isSuperAdmin || canRate(currentUserGrade, u.grade_level);
    });
  }, [
    allUsers,
    allowedGradeBands,
    appraisalFormKeyCovers,
    userId,
    currentUserGrade,
    isSuperAdmin,
    fillingForSelf,
    isFillingSecond,
  ]);

  const sections = useMemo(() => {
    const base = sectionsFor(gradeBand, quarter);
    const withContent = applySectionContentOverrides(
      base,
      gradeBand,
      quarter,
      sectionContentOverrides,
    );
    const withBaseWeights = applySectionBaseWeights(
      withContent,
      gradeBand,
      quarter,
      globalSectionWeights,
      sectionBaseWeights,
    );
    return applySectionWeightRules(
      withBaseWeights,
      selectedEmployee?.grade_level ?? currentUserGrade,
      weightRules,
    );
  }, [
    gradeBand,
    quarter,
    selectedEmployee?.grade_level,
    currentUserGrade,
    weightRules,
    globalSectionWeights,
    sectionBaseWeights,
    sectionContentOverrides,
  ]);

  const visibleSections =
    !isFillingSecond && !fillingForSelf && !selectedEmployee ? [] : sections;

  // Nobody to supervise → the only appraisal available is your own
  useEffect(() => {
    if (!canSelectForOthers && fillTarget === "other") setFillTarget("self");
  }, [canSelectForOthers, fillTarget]);

  // Keep fresh fills pinned to the active period (grace-aware).
  useEffect(() => {
    if (isFillingSecond) return;
    setQuarter(lockedQuarter);
    setValue("review_year", lockedYear);
  }, [isFillingSecond, lockedQuarter, lockedYear, setValue]);

  // Keep the grade band valid: your own band for a self-appraisal, otherwise
  // one of the bands you are senior enough to rate.
  useEffect(() => {
    if (isFillingSecond) return;
    if (fillingForSelf) {
      setGradeBand(ownGradeBand);
      return;
    }
    if (
      allowedGradeBands.length > 0 &&
      !allowedGradeBands.some((b) => b.value === gradeBand)
    ) {
      setGradeBand(allowedGradeBands[0].value);
    }
  }, [
    allowedGradeBands,
    gradeBand,
    isFillingSecond,
    fillingForSelf,
    ownGradeBand,
  ]);

  // Self-appraisal: lock the subject to yourself and pre-fill your email
  useEffect(() => {
    if (!fillingForSelf || !currentUserProfile) return;
    setSelectedEmployee(currentUserProfile);
    if (currentUserProfile.email) {
      setValue("employee_email", currentUserProfile.email);
    }
  }, [fillingForSelf, currentUserProfile, setValue]);

  // Supervisor fill: derive the form band from the selected employee's grade.
  useEffect(() => {
    if (isFillingSecond || fillingForSelf || !selectedEmployee?.grade_level) return;
    setGradeBand(
      resolveAppraisalFormKey(
        selectedEmployee.grade_level,
        gradeConfig,
        scopeConfig,
      ),
    );
  }, [
    isFillingSecond,
    fillingForSelf,
    selectedEmployee,
    gradeConfig,
    scopeConfig,
  ]);

  // Detect a prior self-submission for the active period (supervisors using
  // "Myself" after already filing — pure employees are gated on the page).
  const { data: ownPeriodAppraisal } = useQuery<{
    id: string | number;
    status?: string | null;
    submitted_by?: string | null;
  } | null>({
    queryKey: [
      "appraisal-own-period",
      currentUserProfile?.company_id,
      lockedQuarter,
      lockedYear,
    ],
    enabled:
      fillingForSelf && !isFillingSecond && !!currentUserProfile?.company_id,
    queryFn: async () => {
      const params = new URLSearchParams({
        company_id: currentUserProfile!.company_id!,
        review_quarter: lockedQuarter,
        review_year: String(lockedYear),
        archived: "all",
      });
      const res = await api.get(`/appraisal/get_appraisal?${params}`);
      const rows = (res.data.data ?? []) as Array<{
        id: string | number;
        status?: string | null;
        submitted_by?: string | null;
        employee_user_id?: string | null;
      }>;
      return (
        rows.find((r) => r.employee_user_id === userId) ?? rows[0] ?? null
      );
    },
  });

  const selfAlreadyFiled =
    fillingForSelf &&
    !isFillingSecond &&
    !!ownPeriodAppraisal &&
    (isPeriodAlreadyAppraised(ownPeriodAppraisal.status) ||
      ownPeriodAppraisal.submitted_by === "employee" ||
      ownPeriodAppraisal.submitted_by === "both");

  // Reset ratings when the section set changes (fresh fill only)
  useEffect(() => {
    if (isFillingSecond) return;
    setRatings({});
    if (!fillingForSelf) setSelectedEmployee(null);
  }, [gradeBand, quarter, fillTarget]);

  // ── Live score ──
  const { weightedScore, completionPct } = useMemo(
    () => computeWeightedScore(ratings, visibleSections),
    [ratings, visibleSections],
  );

  const showingFillForm =
    !loadingExisting && !selfAlreadyFiled && !isLocked;

  useEffect(() => {
    if (!showingFillForm) {
      setCompletionPct(null);
      return;
    }
    setCompletionPct(completionPct);
    return () => setCompletionPct(null);
  }, [showingFillForm, completionPct, setCompletionPct]);

  const handleRatingChange = (
    sectionKey: string,
    item: string,
    rating: number,
  ) => {
    setRatings((prev) => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        [item]: { comment: prev[sectionKey]?.[item]?.comment ?? "", rating },
      },
    }));
  };

  const handleCommentChange = (
    sectionKey: string,
    item: string,
    comment: string,
  ) => {
    setRatings((prev) => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        [item]: { rating: prev[sectionKey]?.[item]?.rating ?? null, comment },
      },
    }));
  };

  // ── Validation ──
  const validateForm = () => {
    const errs: Record<string, string> = {};

    if (!selectedEmployee) {
      errs.employee = "Please select an employee";
      toast.error("Please select an employee");
    }

    if (quarter === "Q4" && !promotionReadiness) {
      errs.promotionReadiness = "Please select a promotion readiness status";
      toast.error("Please select a promotion readiness status");
    }

    if (supervisorMode && !reviewDate) {
      errs.reviewDate = "Please schedule a final review date";
      toast.error("Please schedule a final review date");
    }

    let missingRatings = false;
    for (const section of visibleSections) {
      for (const item of section.items) {
        if (ratings[section.key]?.[item]?.rating == null) {
          missingRatings = true;
          break;
        }
      }
      if (missingRatings) break;
    }

    if (missingRatings) {
      errs.ratings = "Please complete all ratings before submitting";
      toast.error("Please complete all ratings before submitting");
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Mutation ──
  const { mutate, isPending } = useMutation({
    mutationFn: async (payload: any) => {
      if (isFillingSecond && existingAppraisalId) {
        const res = await api.patch(
          `/appraisal/${existingAppraisalId}`,
          payload,
        );
        return res.data;
      }
      const res = await api.post("/appraisal/upload_appraisal", payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success(
        supervisorMode
          ? `Supervisor review submitted. Review date scheduled for ${reviewDate}.`
          : "Self-appraisal submitted successfully! Your supervisor has been notified by email.",
      );
      reset();
      setSelectedEmployee(null);
      setRatings({});
      setPromotionReadiness("");
      setFormErrors({});
      setReviewDate("");
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.error ??
          "Failed to save appraisal. Please try again.",
      );
    },
  });

  const onSubmit = (formData: any) => {
    if (!validateForm()) return;

    // Fresh fills can only target the single active period. Continuing an
    // existing record (second-party fill) is allowed regardless of calendar.
    if (
      !isFillingSecond &&
      !isPeriodOpenForNewAppraisal(quarter, lockedYear)
    ) {
      toast.error(
        `${appraisalPeriodLabel(quarter, lockedYear)} is not the open appraisal period right now.`,
      );
      return;
    }

    mutate({
      company_id: selectedEmployee!.company_id,
      employee_name: `${selectedEmployee!.first_name} ${selectedEmployee!.last_name}`,
      job_title: selectedEmployee!.job_position ?? "",
      current_grade: selectedEmployee!.grade_level ?? gradeBand,
      section_authorisations_held: formData.section_authorisations_held || null,
      immediate_supervisor: formData.immediate_supervisor,
      supervisor_email: formData.supervisor_email || null,
      supervisor_id: selectedSupervisorId || null,
      employee_email: formData.employee_email || null,
      grade_band: gradeBand,
      review_quarter: quarter,
      review_year: isFillingSecond
        ? Number(formData.review_year)
        : lockedYear,
      reviewing_manager: formData.reviewing_manager || null,
      period_covered: formData.period_covered || null,
      ...(supervisorMode
        ? {
            supervisor_ratings: ratings,
            supervisor_weighted_score: weightedScore,
            final_review_date: reviewDate,
            supervisor_user_id: userId,
          }
        : {
            employee_ratings: ratings,
            employee_weighted_score: weightedScore,
          }),
      submitted_by: supervisorMode ? "supervisor" : "employee",
      employee_user_id: selectedEmployee!.user_id,
      ...(quarter === "Q4" && promotionReadiness
        ? { promotion_readiness: promotionReadiness }
        : {}),
      strengths_observed: formData.strengths_observed || null,
      improvement_areas: formData.improvement_areas || null,
      agreed_actions: formData.agreed_actions || null,
      employee_comments: formData.employee_comments || null,
      most_significant_achievement: formData.most_significant_achievement || null,
      development_plan_next_year: formData.development_plan_next_year || null,
      promotion_readiness_assessment: formData.promotion_readiness_assessment || null,
      compensation_review_input: formData.compensation_review_input || null,
    });
  };

  // ── Grade warning ──
  const gradeWarning = !currentUserGrade
    ? fillingForSelf
      ? "Your grade level is not set in your profile, so the correct rating sections cannot be loaded. Please contact HR."
      : "Your grade level is not set in your profile. Please contact HR to set your grade before rating employees."
    : null;

  if (loadingExisting) {
    return <FormPageSkeleton />;
  }

  const fillTargetToggle = canSelectForOthers ? (
    <div className="mb-4">
      <FieldLabel required>Who is this appraisal for?</FieldLabel>
      <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1 w-fit mt-1">
        {(
          [
            { value: "self", label: "Myself" },
            { value: "other", label: "Someone I supervise" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFillTarget(opt.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              fillTarget === opt.value
                ? "bg-red-600 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  if (selfAlreadyFiled && ownPeriodAppraisal) {
    return (
      <div className="space-y-4">
        {fillTargetToggle}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-gray-800">
            You have already submitted{" "}
            {appraisalPeriodLabel(lockedQuarter, lockedYear)}
          </p>
          <p className="text-xs text-gray-500 mt-1.5 max-w-md mx-auto">
            Each quarter can only be appraised once.
            {canSelectForOthers
              ? ' Switch to "Someone I supervise" to evaluate others for this period, or open your existing record.'
              : " Open the existing record to track progress — the next period opens after this one's completion window closes."}
          </p>
          <a
            href={`/dashboard/humanCapital/appraisal/${ownPeriodAppraisal.id}`}
            className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition"
          >
            View my appraisal
          </a>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <Lock className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <p className="text-sm font-bold text-red-700">
          This appraisal is locked
        </p>
        <p className="text-xs text-red-500 mt-1 max-w-md mx-auto">
          {existingAppraisal?.locked_reason === "supervisor_incomplete"
            ? "The supervisor evaluation deadline was missed. A Justification Form must be submitted and approved before this can be edited again."
            : "The self-assessment deadline was missed. This quarter's appraisal can no longer be edited."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 px-5 py-5">
      {/* ── Mode Banner ── */}
      <div
        className={`rounded-xl px-4 py-3 flex items-center gap-2 text-sm font-medium ${
          supervisorMode
            ? "bg-blue-50 border border-blue-200 text-blue-700"
            : "bg-amber-50 border border-amber-200 text-amber-700"
        }`}
      >
        <Info className="w-4 h-4 flex-shrink-0" />
        {isFillingSecond
          ? supervisorMode
            ? "Completing your supervisor evaluation. Employee details and review period are locked from the original submission."
            : "Completing your self-appraisal. Details from your supervisor's submission are pre-filled and locked."
          : fillingForSelf
            ? `Self-appraisal for your own ${currentUserGrade ?? ""} record. Once you submit, your supervisor is notified by email and your ratings stay hidden from them until they submit theirs.`
            : supervisorMode
              ? `Supervisor evaluation for ${selectedEmployee?.first_name} ${selectedEmployee?.last_name} (${selectedEmployee?.grade_level}).`
              : `As ${currentUserGrade}, choose an employee below your level to appraise.`}
      </div>

      {existingAppraisal?.status === "reopened" && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm bg-purple-50 border border-purple-200 text-purple-700">
          <CalendarClock className="w-4 h-4 flex-shrink-0" />
          This appraisal was reopened following an approved justification. Complete
          the supervisor evaluation and final review before the date below.
        </div>
      )}

      {showDeadlineBanner && (
        <DeadlineBanner
          reviewQuarter={existingAppraisal?.review_quarter ?? quarter}
          reviewYear={effectiveReviewYear}
          status={existingAppraisal?.status ?? "open"}
          deadlineAt={
            existingAppraisal?.deadline_at ??
            computeDeadline(quarter, effectiveReviewYear).toISOString()
          }
          reopenedDeadlineAt={existingAppraisal?.reopened_deadline_at}
        />
      )}

      {/* ── Grade warning ── */}
      {gradeWarning && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm bg-red-50 border border-red-200 text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {gradeWarning}
        </div>
      )}

      {/* ── Employee Details ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-red-500" />
          Employee Details
          {isFillingSecond && (
            <span className="ml-auto flex items-center gap-1 text-xs text-gray-400 font-normal">
              <Lock className="w-3 h-3" /> Locked from original submission
            </span>
          )}
        </h3>

        {fillTargetToggle}

        {!isFillingSecond && !fillingForSelf && (
          <div className="mb-4">
            <FieldLabel required>Select Employee</FieldLabel>
            <select
              className={inputCls(!!formErrors.employee)}
              value={selectedEmployee?.company_id ?? ""}
              onChange={(e) => {
                const emp = filteredEmployees.find(
                  (u) => u.company_id === e.target.value,
                );
                setSelectedEmployee(emp ?? null);
                setFormErrors((prev) => ({ ...prev, employee: "" }));
              }}
            >
              <option value="">
                {filteredEmployees.length === 0
                  ? "No eligible employees found"
                  : "Choose employee"}
              </option>
              {filteredEmployees.map((emp) => (
                <option key={emp.company_id} value={emp.company_id}>
                  {emp.first_name} {emp.last_name} — {emp.grade_level ?? "?"} (
                  {emp.company_id})
                </option>
              ))}
            </select>
            {formErrors.employee && (
              <p className="text-red-500 text-xs mt-1">{formErrors.employee}</p>
            )}
          </div>
        )}

        {selectedEmployee && (
          <div className="grid grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div>
              <p className="text-xs text-gray-400 mb-0.5 uppercase tracking-wide font-semibold">
                Name
              </p>
              <p className="text-sm font-semibold text-gray-800">
                {selectedEmployee.first_name} {selectedEmployee.last_name}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5 uppercase tracking-wide font-semibold">
                Job Position
              </p>
              <p className="text-sm text-gray-700">
                {selectedEmployee.job_position || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5 uppercase tracking-wide font-semibold">
                Grade / Company ID
              </p>
              <p className="text-sm text-gray-700">
                {selectedEmployee.grade_level ?? "—"}{" "}
                <span className="font-mono text-gray-400 text-xs">
                  · {selectedEmployee.company_id}
                </span>
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            {isFillingSecond ? (
              <ReadOnlyField
                label="Section Authorisations Held"
                value={existingAppraisal?.section_authorisations_held}
              />
            ) : (
              <>
                <FieldLabel>Section Authorisations Held</FieldLabel>
                <select
                  {...register("section_authorisations_held")}
                  className={inputCls()}
                >
                  <option value="">Select section authorisation</option>
                  {sectionAuthOptions.map((opt) => (
                    <option
                      key={opt.id}
                      value={opt.legacy_value ?? opt.label}
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
          <div>
            {isFillingSecond ? (
              <ReadOnlyField
                label="Supervisor's Name"
                value={displaySupervisorName}
              />
            ) : !fillingForSelf ? (
              // Filling for someone I supervise — I AM their supervisor for
              // this appraisal by definition, so this is locked to my own
              // name rather than offering a choice (see the effect that
              // sets immediate_supervisor/supervisor_email to my own
              // profile whenever fillingForSelf is false). Same bordered
              // read-only look as the Quarter field in Review Period below.
              <div>
                <ReadOnlyField
                  label="Supervisor's Name"
                  value={
                    currentUserProfile
                      ? `${currentUserProfile.first_name} ${currentUserProfile.last_name}`
                      : null
                  }
                />
                <input
                  type="hidden"
                  {...register("immediate_supervisor", { required: true })}
                />
                <input
                  type="hidden"
                  {...register("supervisor_email", { required: true })}
                />
              </div>
            ) : hasAssignedSupervisor ? (
              <div>
                <ReadOnlyField
                  label="Supervisor's Name"
                  value={`${assignedSupervisor!.first_name} ${assignedSupervisor!.last_name}`}
                />
                <input
                  type="hidden"
                  {...register("immediate_supervisor", { required: true })}
                />
                <input
                  type="hidden"
                  {...register("supervisor_email", { required: true })}
                />
              </div>
            ) : (
              <div>
                <FieldLabel required>Supervisor&apos;s Name</FieldLabel>
                <select
                  value={selectedSupervisorId}
                  onChange={(e) => handleSupervisorSelect(e.target.value)}
                  className={inputCls(!!errors.immediate_supervisor)}
                >
                  <option value="">
                    {eligibleSupervisors.length === 0
                      ? "No eligible supervisors found"
                      : "Select supervisor's name"}
                  </option>
                  {eligibleSupervisors.map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      {u.first_name} {u.last_name} ({u.grade_level ?? "?"})
                    </option>
                  ))}
                </select>
                <input
                  type="hidden"
                  {...register("immediate_supervisor", { required: true })}
                />
                <input
                  type="hidden"
                  {...register("supervisor_email", { required: true })}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Review Period ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          <CalendarRange className="w-4 h-4 text-red-500" />
          Review Period
          {isFillingSecond && (
            <span className="ml-auto flex items-center gap-1 text-xs text-gray-400 font-normal">
              <Lock className="w-3 h-3" /> Locked from original submission
            </span>
          )}
        </h3>

        {isFillingSecond ? (
          <div className="grid grid-cols-3 gap-4">
            <ReadOnlyField label="Quarter" value={existingAppraisal?.review_quarter} />
            <ReadOnlyField
              label="Year"
              value={String(existingAppraisal?.review_year ?? "")}
            />
            {existingAppraisal?.review_quarter === "Q4" && (
              <>
                <ReadOnlyField
                  label="Reviewing Manager"
                  value={existingAppraisal?.reviewing_manager}
                />
                <ReadOnlyField
                  label="Period Covered"
                  value={existingAppraisal?.period_covered}
                />
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {/* Only the single active period is available — no free picker. */}
            <ReadOnlyField
              label="Quarter"
              value={quarter === "Q4" ? "Annual" : quarter}
            />
            <ReadOnlyField label="Year" value={String(lockedYear)} />
            {quarter === "Q4" && (
              <>
                <div>
                  <FieldLabel>Reviewing Manager</FieldLabel>
                  <input
                    type="text"
                    placeholder="Manager name"
                    {...register("reviewing_manager")}
                    className={inputCls()}
                  />
                </div>
                <div>
                  <FieldLabel>Period Covered</FieldLabel>
                  <input
                    type="text"
                    placeholder="e.g. Jan–Dec 2025"
                    {...register("period_covered")}
                    className={inputCls()}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {quarter === "Q4" && (
          <div className="mt-4 flex items-start gap-2 bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-700">
            <Award className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>This appraisal covers the employee's entire year of
              performance.</strong> This is the Annual appraisal — there is no
              separate annual form.
            </span>
          </div>
        )}

        {supervisorMode && (
          <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
            <FieldLabel required>Final Review Date</FieldLabel>
            <p className="text-xs text-gray-400 mb-2">
              Schedule the date for the final in-person appraisal meeting.
            </p>
            <input
              type="date"
              value={reviewDate}
              onChange={(e) => {
                setReviewDate(e.target.value);
                setFormErrors((prev) => ({ ...prev, reviewDate: "" }));
              }}
              min={new Date().toISOString().split("T")[0]}
              className={inputCls(!!formErrors.reviewDate)}
            />
            {formErrors.reviewDate && (
              <p className="text-red-500 text-xs mt-1">
                {formErrors.reviewDate}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Ratings ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-red-500" />
          Performance Ratings
        </h3>

        <p className="text-[11px] text-gray-400">
          Rate each item 1–5 based on performance. Scores are calculated after
          both parties submit and are reviewed together at the final meeting.
        </p>

        {formErrors.ratings && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {formErrors.ratings}
          </div>
        )}

        {visibleSections.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
            Select an employee above to load the rating sections
          </div>
        )}

        {visibleSections.map((section) => (
          <SectionBlock
            key={section.key}
            section={section}
            ratings={ratings[section.key] ?? {}}
            onRatingChange={(item, rating) =>
              handleRatingChange(section.key, item, rating)
            }
            onCommentChange={(item, comment) =>
              handleCommentChange(section.key, item, comment)
            }
          />
        ))}
      </div>

      {/* ── Promotion Readiness (Annual only) ── */}
      {quarter === "Q4" && (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-1">
          Promotion Readiness Notes
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          A discussion/development note only — it does not determine
          promotion eligibility. Eligibility is calculated automatically
          from the Final Score once the Annual review locks (≥ 70% required).
        </p>
        <div className="space-y-2">
          {PROMOTION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                promotionReadiness === opt.value
                  ? "border-[#1e3a5f] bg-blue-50"
                  : "border-gray-100 hover:border-gray-200"
              }`}
            >
              <input
                type="radio"
                name="promotion_readiness"
                value={opt.value}
                checked={promotionReadiness === opt.value}
                onChange={() => {
                  setPromotionReadiness(opt.value);
                  setFormErrors((prev) => ({
                    ...prev,
                    promotionReadiness: "",
                  }));
                }}
                className="accent-red-600"
              />
              <span className="text-sm text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
        {formErrors.promotionReadiness && (
          <p className="text-red-500 text-xs mt-2">
            {formErrors.promotionReadiness}
          </p>
        )}
      </div>
      )}

      {/* ── Comments — supervisor only ── */}
      {supervisorMode && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4">
            Supervisor Comments &amp; Development Actions
          </h3>
          <div className="space-y-4">
            <div>
              <FieldLabel>Strengths Observed</FieldLabel>
              <textarea
                rows={2}
                placeholder="Describe key strengths..."
                {...register("strengths_observed")}
                className={`${inputCls()} resize-none`}
              />
            </div>
            <div>
              <FieldLabel>Improvement Areas</FieldLabel>
              <textarea
                rows={2}
                placeholder="Areas requiring development..."
                {...register("improvement_areas")}
                className={`${inputCls()} resize-none`}
              />
            </div>
            <div>
              <FieldLabel>
                Agreed Actions for {quarter === "Q4" ? "Next Year" : "Next Quarter"}
              </FieldLabel>
              <textarea
                rows={2}
                placeholder="Specific agreed actions and timelines..."
                {...register("agreed_actions")}
                className={`${inputCls()} resize-none`}
              />
            </div>
            <div>
              <FieldLabel>Employee Comments</FieldLabel>
              <p className="text-xs text-gray-400 -mt-0.5 mb-1.5">
                Visible to the employee afterwards — use this to support
                them in improving, not just to record a score.
              </p>
              <textarea
                rows={2}
                placeholder="Employee's own comments on the review..."
                {...register("employee_comments")}
                className={`${inputCls()} resize-none`}
              />
            </div>

            {quarter === "Q4" && (
              <div className="border-t border-dashed border-gray-200 pt-4 space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Year-End Development Plan
                </p>
                <div>
                  <FieldLabel>
                    Most Significant Achievement of the Year
                  </FieldLabel>
                  <textarea
                    rows={2}
                    placeholder="Highlight the single most impactful contribution..."
                    {...register("most_significant_achievement")}
                    className={`${inputCls()} resize-none`}
                  />
                </div>
                <div>
                  <FieldLabel>Development Plan for the Coming Year</FieldLabel>
                  <textarea
                    rows={2}
                    placeholder="Training, sign-offs, section authorisations..."
                    {...register("development_plan_next_year")}
                    className={`${inputCls()} resize-none`}
                  />
                </div>
                <div>
                  <FieldLabel>Promotion-Readiness Assessment</FieldLabel>
                  <textarea
                    rows={2}
                    placeholder="Detailed assessment narrative..."
                    {...register("promotion_readiness_assessment")}
                    className={`${inputCls()} resize-none`}
                  />
                </div>
                <div>
                  <FieldLabel>Compensation Review Input</FieldLabel>
                  <textarea
                    rows={2}
                    placeholder="To be acted on by HR / Executive Leadership..."
                    {...register("compensation_review_input")}
                    className={`${inputCls()} resize-none`}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Submit ── */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => {
            if (isFillingSecond) return;
            reset();
            setSelectedEmployee(null);
            setRatings({});
            setPromotionReadiness("");
            setFormErrors({});
            setReviewDate("");
          }}
          disabled={isFillingSecond}
          className="px-5 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Clear Form
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-60 flex items-center gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              {supervisorMode
                ? "Submit Supervisor Evaluation"
                : "Submit Self-Assessment"}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
