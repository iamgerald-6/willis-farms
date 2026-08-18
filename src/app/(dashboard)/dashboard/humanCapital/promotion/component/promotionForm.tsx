"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  User,
  ClipboardList,
  Award,
  ChevronDown,
  Info,
  MessageSquare,
  FileText,
} from "lucide-react";
import {
  FINAL_DECISIONS,
  GRADE_ORDER,
  RATING_LABELS,
  computeReadinessSummary,
  getFormConfig,
  getPromotionStep,
  getProposedGrade,
  type PromotionFormConfig,
  type SkillSignoffStage,
} from "./promotionFormConfigs";

interface Appraisal {
  id: number;
  company_id: string;
  employee_name: string;
  job_title: string;
  current_grade: string;
  grade_band: string;
  cycle: string;
  review_quarter?: string;
  review_year: number;
  immediate_supervisor: string;
  section_authorisations_held?: string;
  promotion_readiness: string;
  submitted_by: string;
  employee_weighted_score?: number;
  supervisor_weighted_score?: number;
  employee_ratings?: Record<
    string,
    Record<string, { rating: number; comment?: string }>
  >;
  supervisor_ratings?: unknown;
  created_at: string;
}

interface UserProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  company_id: string;
  grade_level: string;
  job_position: string;
}

type EligibilityAnswer = "yes" | "no" | "";

const RATING_COLORS: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-400",
  3: "bg-amber-400",
  4: "bg-green-400",
  5: "bg-emerald-500",
};

const SKILL_STAGES: { value: SkillSignoffStage; label: string }[] = [
  { value: "observed", label: "Observed" },
  { value: "supervised", label: "Under Supervision" },
  { value: "consistent", label: "Consistent to Standard" },
];

function gradeIndex(g: string | null | undefined) {
  if (!g) return -1;
  const clean = g.replace("_", "/").split("/")[0].trim();
  return GRADE_ORDER.indexOf(clean as (typeof GRADE_ORDER)[number]);
}

function inputCls(hasError?: boolean) {
  return [
    "w-full border rounded-lg px-3 py-2 text-sm text-gray-900 transition",
    "focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent placeholder:text-gray-400",
    hasError ? "border-red-300 bg-red-50" : "border-gray-200 bg-white",
  ].join(" ");
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

function AppraisalSummaryCard({ appraisal }: { appraisal: Appraisal }) {
  const [expanded, setExpanded] = useState(false);
  const empScore = appraisal.employee_weighted_score;
  const supScore = appraisal.supervisor_weighted_score;
  const finalAvg =
    empScore && supScore ? ((empScore + supScore) / 2).toFixed(2) : null;

  return (
    <div className="bg-[#1e3a5f] rounded-2xl p-5 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">
            Triggering Appraisal —{" "}
            {appraisal.cycle === "quarterly"
              ? `${appraisal.review_quarter} `
              : ""}
            {appraisal.review_year}
          </p>
          <h3 className="text-xl font-bold">{appraisal.employee_name}</h3>
          <p className="text-white/60 text-sm mt-0.5">
            {appraisal.job_title || "No title set"} · {appraisal.current_grade}
          </p>
        </div>
        <div className="flex gap-4 bg-white/10 rounded-xl px-5 py-3">
          {empScore != null && (
            <div className="text-center">
              <p className="text-xs text-white/50 mb-1">Employee</p>
              <p className="text-xl font-black text-green-300">
                {empScore.toFixed(2)}
              </p>
            </div>
          )}
          {supScore != null && (
            <>
              <div className="w-px bg-white/10" />
              <div className="text-center">
                <p className="text-xs text-white/50 mb-1">Supervisor</p>
                <p className="text-xl font-black text-emerald-300">
                  {supScore.toFixed(2)}
                </p>
              </div>
            </>
          )}
          {finalAvg && (
            <>
              <div className="w-px bg-white/10" />
              <div className="text-center">
                <p className="text-xs text-white/50 mb-1">Final Avg</p>
                <p className="text-xl font-black text-white">{finalAvg}</p>
              </div>
            </>
          )}
        </div>
      </div>
      {appraisal.employee_ratings && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="mt-3 text-xs text-white/50 hover:text-white/80 flex items-center gap-1"
          >
            {expanded ? "Hide" : "Show"} appraisal ratings
            <ChevronDown
              className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
          {expanded && (
            <div className="mt-3 bg-white/5 rounded-xl p-4 max-h-64 overflow-y-auto">
              {Object.entries(appraisal.employee_ratings).map(
                ([sectionKey, items]) => (
                  <div key={sectionKey} className="mb-2">
                    <p className="text-xs font-semibold text-white/40 uppercase">
                      Section {sectionKey}
                    </p>
                    {Object.entries(items).map(([item, val]) => (
                      <div
                        key={item}
                        className="flex justify-between py-0.5 text-xs text-white/60"
                      >
                        <span className="truncate flex-1 pr-4">{item}</span>
                        <span>{val.rating}</span>
                      </div>
                    ))}
                  </div>
                ),
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RatingSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          title={RATING_LABELS[n]}
          className={`w-8 h-8 rounded-lg text-xs font-bold border-2 transition-all ${
            value === n
              ? `${RATING_COLORS[n]} text-white border-transparent`
              : "bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function resetFormState(config: PromotionFormConfig | null) {
  return {
    eligibility: {} as Record<
      string,
      { answer: EligibilityAnswer; comment: string }
    >,
    disqualifying: {} as Record<string, { present: "yes" | "no" | "" }>,
    documentedEvidence: {} as Record<
      string,
      { rating: number | null; comment: string }
    >,
    skillsLog: {} as Record<
      string,
      { stage: SkillSignoffStage; verifier: string; date: string }
    >,
    interview: {} as Record<string, { rating: number | null; notes: string }>,
    signOffs: {} as Record<string, { name: string; date: string }>,
    developmentPlan: {
      strengths: "",
      gaps: "",
      agreed_actions: "",
      next_review_date: "",
    },
    proposedJobTitle: config?.toTitle ?? "",
    proposedGrade: config?.toGrade ?? "",
  };
}

export default function PromotionFormPage({ onBack }: { onBack?: () => void }) {
  const [selectedAppraisal, setSelectedAppraisal] = useState<Appraisal | null>(
    null,
  );
  const [eligibility, setEligibility] = useState<
    Record<string, { answer: EligibilityAnswer; comment: string }>
  >({});
  const [disqualifying, setDisqualifying] = useState<
    Record<string, { present: "yes" | "no" | "" }>
  >({});
  const [documentedEvidence, setDocumentedEvidence] = useState<
    Record<string, { rating: number | null; comment: string }>
  >({});
  const [skillsLog, setSkillsLog] = useState<
    Record<string, { stage: SkillSignoffStage; verifier: string; date: string }>
  >({});
  const [interview, setInterview] = useState<
    Record<string, { rating: number | null; notes: string }>
  >({});
  const [signOffs, setSignOffs] = useState<
    Record<string, { name: string; date: string }>
  >({});
  const [developmentPlan, setDevelopmentPlan] = useState({
    strengths: "",
    gaps: "",
    agreed_actions: "",
    next_review_date: "",
  });
  const [finalDecision, setFinalDecision] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const formConfig = useMemo(
    () =>
      selectedAppraisal
        ? getFormConfig(selectedAppraisal.current_grade)
        : null,
    [selectedAppraisal],
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      proposed_job_title: "",
      proposed_grade: "",
      reviewing_manager: "",
      tier_authorisation: "",
      time_in_current_role: "",
      business_need_confirmed: "",
      decision_comments: "",
      conditions: "",
    },
  });

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });
  const userId = session?.user?.id ?? "";

  const { data: allUsers = [] } = useQuery<UserProfile[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data as UserProfile[];
    },
  });

  const currentUserProfile = useMemo(
    () => allUsers.find((u) => u.user_id === userId),
    [allUsers, userId],
  );
  const currentUserGrade = currentUserProfile?.grade_level ?? null;
  const canFillPromotion = gradeIndex(currentUserGrade) >= gradeIndex("L4");

  const { data: promotionAppraisals = [], isLoading } = useQuery<Appraisal[]>({
    queryKey: ["promotion_appraisals"],
    queryFn: async () => {
      const res = await api.get("/promotion/get_pending");
      return res.data?.data ?? [];
    },
  });

  const eligibleAppraisals = useMemo(
    () =>
      promotionAppraisals.filter(
        (a) =>
          a.company_id !== currentUserProfile?.company_id &&
          getFormConfig(a.current_grade) != null,
      ),
    [promotionAppraisals, currentUserProfile],
  );

  useEffect(() => {
    if (!selectedAppraisal || !formConfig) return;
    const fresh = resetFormState(formConfig);
    setEligibility(fresh.eligibility);
    setDisqualifying(fresh.disqualifying);
    setDocumentedEvidence(fresh.documentedEvidence);
    setSkillsLog(fresh.skillsLog);
    setInterview(fresh.interview);
    setSignOffs(
      Object.fromEntries(formConfig.signOffRoles.map((r) => [r, { name: "", date: "" }])),
    );
    setDevelopmentPlan(fresh.developmentPlan);
    setFinalDecision("");
    setValue("proposed_job_title", formConfig.toTitle);
    setValue("proposed_grade", formConfig.toGrade);
    setValue("tier_authorisation", selectedAppraisal.section_authorisations_held ?? "");
  }, [selectedAppraisal, formConfig, setValue]);

  const readinessSummary = useMemo(() => {
    if (!formConfig) return null;
    return computeReadinessSummary(
      formConfig,
      documentedEvidence,
      skillsLog,
      interview,
    );
  }, [formConfig, documentedEvidence, skillsLog, interview]);

  const { mutate, isPending } = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post("/promotion/post_promotions", payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Promotion assessment submitted successfully!");
      reset();
      setSelectedAppraisal(null);
      onBack?.();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(
        error?.response?.data?.error ?? "Failed to submit. Please try again.",
      );
    },
  });

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!selectedAppraisal || !formConfig) {
      errs.appraisal = "Please select an appraisal";
      toast.error("Please select an appraisal");
      return false;
    }
    if (
      selectedAppraisal.company_id === currentUserProfile?.company_id
    ) {
      toast.error("You cannot submit a promotion assessment for yourself.");
      return false;
    }
    if (!finalDecision) {
      errs.decision = "Please select a final decision";
      toast.error("Please select a final decision");
    }
    const missingEvidence = formConfig.documentedEvidence.some(
      (k) => !documentedEvidence[k]?.rating,
    );
    if (missingEvidence) {
      errs.evidence = "Please complete all Section B evidence ratings";
      toast.error(errs.evidence);
    }
    const missingInterview = formConfig.interviewQuestions.some(
      (q) => !interview[q.id]?.rating,
    );
    if (missingInterview) {
      errs.interview = "Please complete all Section D interview ratings";
      toast.error(errs.interview);
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = (formData: {
    proposed_job_title: string;
    proposed_grade: string;
    reviewing_manager: string;
    tier_authorisation: string;
    time_in_current_role: string;
    business_need_confirmed: string;
    decision_comments: string;
    conditions: string;
  }) => {
    if (!validateForm() || !selectedAppraisal || !formConfig) return;

    const promotionStep = getPromotionStep(selectedAppraisal.current_grade)!;
    const form_data = {
      disqualifying_factors: disqualifying,
      documented_evidence: documentedEvidence,
      skills_log_signoff: skillsLog,
      interview_responses: interview,
      readiness_summary: readinessSummary,
      development_plan: developmentPlan,
      sign_offs: signOffs,
    };

    mutate({
      appraisal_id: selectedAppraisal.id,
      company_id: selectedAppraisal.company_id,
      employee_name: selectedAppraisal.employee_name,
      current_grade: selectedAppraisal.current_grade,
      current_job_title: selectedAppraisal.job_title,
      proposed_job_title: formData.proposed_job_title,
      proposed_grade: formData.proposed_grade || getProposedGrade(selectedAppraisal.current_grade),
      immediate_supervisor: selectedAppraisal.immediate_supervisor,
      reviewing_manager: formData.reviewing_manager,
      tier_authorisation: formData.tier_authorisation,
      section_unit: selectedAppraisal.section_authorisations_held,
      triggering_review: `${selectedAppraisal.cycle === "quarterly" ? selectedAppraisal.review_quarter + " " : ""}${selectedAppraisal.review_year}`,
      promotion_step: promotionStep,
      time_in_current_role: formData.time_in_current_role || null,
      business_need_confirmed: formData.business_need_confirmed === "yes",
      eligibility_checklist: eligibility,
      assessment_ratings: documentedEvidence,
      form_data,
      final_decision: finalDecision,
      decision_comments: formData.decision_comments,
      conditions: formData.conditions,
      submitted_by_user_id: userId,
      submitted_by_grade: currentUserGrade,
    });
  };

  if (!canFillPromotion && currentUserGrade !== null) {
    return (
      <div className="p-6 min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            Access Restricted
          </h2>
          <p className="text-sm text-gray-500">
            Only staff at grade L4 and above can fill promotion assessment
            forms.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          ← Back to promotions
        </button>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Promotion Readiness Assessment
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Grade-specific form · L4 and above only
        </p>
      </div>

      <div className="max-w-5xl space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-blue-700">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          Select an employee — the form automatically loads the correct
          promotion step (L1→L2, L2→L3, etc.) based on their current grade.
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-red-500" />
            Select Employee Appraisal
          </h3>
          {isLoading ? (
            <div className="h-11 bg-gray-100 animate-pulse rounded-xl" />
          ) : (
            <select
              value={selectedAppraisal?.id ?? ""}
              disabled={eligibleAppraisals.length === 0}
              onChange={(e) => {
                const a = eligibleAppraisals.find(
                  (x) => String(x.id) === e.target.value,
                );
                setSelectedAppraisal(a ?? null);
                setFormErrors({});
              }}
              className={`${inputCls()} disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <option value="">
                {eligibleAppraisals.length === 0
                  ? "No employees ready for promotion"
                  : "— Select employee —"}
              </option>
              {eligibleAppraisals.map((a) => {
                const step = getPromotionStep(a.current_grade);
                const cfg = getFormConfig(a.current_grade);
                return (
                  <option key={a.id} value={a.id}>
                    {a.employee_name} — {a.current_grade}
                    {step && cfg ? ` → ${cfg.toGrade}` : ""} · {a.company_id}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        {selectedAppraisal && formConfig && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <AppraisalSummaryCard appraisal={selectedAppraisal} />

            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <p className="text-sm font-bold text-indigo-900">
                {formConfig.title}
              </p>
              <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                {formConfig.howToUse}
              </p>
            </div>

            {/* Header fields */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4">
                Employee & Promotion Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold">
                    Employee
                  </p>
                  <p className="text-sm font-semibold">
                    {selectedAppraisal.employee_name}
                  </p>
                  <p className="text-xs text-gray-400">
                    ID {selectedAppraisal.company_id}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold">
                    Current → Proposed
                  </p>
                  <p className="text-sm">
                    {formConfig.fromGrade} → {formConfig.toGrade}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Proposed Job Title</FieldLabel>
                  <input
                    {...register("proposed_job_title", { required: true })}
                    className={inputCls(!!errors.proposed_job_title)}
                  />
                </div>
                <div>
                  <FieldLabel required>Proposed Grade</FieldLabel>
                  <input
                    {...register("proposed_grade", { required: true })}
                    readOnly
                    className={`${inputCls()} bg-gray-50`}
                  />
                </div>
                <div>
                  <FieldLabel required>Reviewing Manager</FieldLabel>
                  <input
                    {...register("reviewing_manager", { required: true })}
                    className={inputCls(!!errors.reviewing_manager)}
                  />
                </div>
                <div>
                  <FieldLabel>Tier Authorisation (GP / PS / GGP)</FieldLabel>
                  <input {...register("tier_authorisation")} className={inputCls()} />
                </div>
                <div>
                  <FieldLabel>Time in Current Role</FieldLabel>
                  <input
                    placeholder="e.g. 14 months"
                    {...register("time_in_current_role")}
                    className={inputCls()}
                  />
                </div>
                <div>
                  <FieldLabel required>Business Need / Vacancy Confirmed</FieldLabel>
                  <select
                    {...register("business_need_confirmed", { required: true })}
                    className={inputCls()}
                  >
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section A */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-red-500" />
                Section A — Minimum Eligibility Gate
              </h3>
              <div className="space-y-2">
                {formConfig.eligibility.map((req) => {
                  const val = eligibility[req] ?? { answer: "", comment: "" };
                  return (
                    <div
                      key={req}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_1fr] gap-2 sm:gap-3 items-center p-3 rounded-xl bg-gray-50 border border-gray-100"
                    >
                      <span className="text-sm text-gray-700">{req}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setEligibility((p) => ({
                            ...p,
                            [req]: { ...val, answer: "yes" },
                          }))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 ${val.answer === "yes" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-500 border-gray-200"}`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEligibility((p) => ({
                            ...p,
                            [req]: { ...val, answer: "no" },
                          }))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 ${val.answer === "no" ? "bg-red-500 text-white border-red-500" : "bg-white text-gray-500 border-gray-200"}`}
                      >
                        No
                      </button>
                      <input
                        type="text"
                        placeholder="Evidence / comments"
                        value={val.comment}
                        onChange={(e) =>
                          setEligibility((p) => ({
                            ...p,
                            [req]: { ...val, comment: e.target.value },
                          }))
                        }
                        className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Disqualifying factors */}
            <div className="bg-white rounded-xl border border-red-100 p-5">
              <h3 className="text-sm font-bold text-red-800 mb-4">
                Absolute Disqualifying Factors
              </h3>
              <div className="space-y-2">
                {formConfig.disqualifyingFactors.map((factor) => {
                  const val = disqualifying[factor] ?? { present: "" };
                  return (
                    <div
                      key={factor}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-red-50/40 border border-red-100"
                    >
                      <span className="text-sm text-gray-700">{factor}</span>
                      <div className="flex gap-2">
                        {(["yes", "no"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() =>
                              setDisqualifying((p) => ({
                                ...p,
                                [factor]: { present: v },
                              }))
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 ${val.present === v ? (v === "yes" ? "bg-red-500 text-white border-red-500" : "bg-emerald-500 text-white border-emerald-500") : "bg-white border-gray-200 text-gray-500"}`}
                          >
                            {v === "yes" ? "Present" : "Not present"}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section B */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-500" />
                Section B — Documented Evidence Review
              </h3>
              {formErrors.evidence && (
                <p className="text-red-500 text-xs mb-3">{formErrors.evidence}</p>
              )}
              <div className="space-y-3">
                {formConfig.documentedEvidence.map((area) => {
                  const val = documentedEvidence[area] ?? {
                    rating: null,
                    comment: "",
                  };
                  return (
                    <div
                      key={area}
                      className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-2"
                    >
                      <p className="text-sm text-gray-700">{area}</p>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <RatingSelector
                          value={val.rating}
                          onChange={(n) =>
                            setDocumentedEvidence((p) => ({
                              ...p,
                              [area]: { ...val, rating: n },
                            }))
                          }
                        />
                        <input
                          type="text"
                          placeholder="Source / comments"
                          value={val.comment}
                          onChange={(e) =>
                            setDocumentedEvidence((p) => ({
                              ...p,
                              [area]: { ...val, comment: e.target.value },
                            }))
                          }
                          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section C */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-red-500" />
                Section C — New-Level Skills-Log Sign-Off
              </h3>
              <div className="space-y-3">
                {formConfig.skillsLogCompetencies.map((comp) => {
                  const val = skillsLog[comp] ?? {
                    stage: "" as SkillSignoffStage,
                    verifier: "",
                    date: "",
                  };
                  return (
                    <div
                      key={comp}
                      className="p-3 rounded-xl bg-gray-50 border border-gray-100 space-y-2"
                    >
                      <p className="text-sm text-gray-700">{comp}</p>
                      <div className="flex flex-wrap gap-2">
                        {SKILL_STAGES.map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              setSkillsLog((p) => ({
                                ...p,
                                [comp]: { ...val, stage: value },
                              }))
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${val.stage === value ? "bg-[#1e3a5f] text-white border-[#1e3a5f]" : "bg-white border-gray-200 text-gray-500"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Verifier"
                          value={val.verifier}
                          onChange={(e) =>
                            setSkillsLog((p) => ({
                              ...p,
                              [comp]: { ...val, verifier: e.target.value },
                            }))
                          }
                          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                        />
                        <input
                          type="date"
                          value={val.date}
                          onChange={(e) =>
                            setSkillsLog((p) => ({
                              ...p,
                              [comp]: { ...val, date: e.target.value },
                            }))
                          }
                          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section D */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-red-500" />
                Section D — Forward-Looking Readiness Interview
              </h3>
              {formErrors.interview && (
                <p className="text-red-500 text-xs mb-3">{formErrors.interview}</p>
              )}
              <div className="space-y-4">
                {formConfig.interviewQuestions.map((q) => {
                  const val = interview[q.id] ?? { rating: null, notes: "" };
                  return (
                    <div
                      key={q.id}
                      className="p-4 rounded-xl bg-gray-50 border border-gray-100"
                    >
                      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">
                        {q.section}
                      </p>
                      <p className="text-sm text-gray-800 mb-1">{q.question}</p>
                      <p className="text-xs text-gray-400 italic mb-3">
                        Look for: {q.lookFor}
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <RatingSelector
                          value={val.rating}
                          onChange={(n) =>
                            setInterview((p) => ({
                              ...p,
                              [q.id]: { ...val, rating: n },
                            }))
                          }
                        />
                        <input
                          type="text"
                          placeholder="Notes"
                          value={val.notes}
                          onChange={(e) =>
                            setInterview((p) => ({
                              ...p,
                              [q.id]: { ...val, notes: e.target.value },
                            }))
                          }
                          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section E summary + decision */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4">
                Section E — Readiness Summary & Panel Decision
              </h3>
              {readinessSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {readinessSummary.section_b_avg != null && (
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-gray-400 uppercase">
                        B ({formConfig.weights.sectionB}%)
                      </p>
                      <p className="text-lg font-bold">
                        {readinessSummary.section_b_avg.toFixed(2)}
                      </p>
                    </div>
                  )}
                  {readinessSummary.section_c_score != null && (
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-gray-400 uppercase">
                        C ({formConfig.weights.sectionC}%)
                      </p>
                      <p className="text-lg font-bold">
                        {readinessSummary.section_c_score.toFixed(2)}
                      </p>
                    </div>
                  )}
                  {readinessSummary.section_d_avg != null && (
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-gray-400 uppercase">
                        D ({formConfig.weights.sectionD}%)
                      </p>
                      <p className="text-lg font-bold">
                        {readinessSummary.section_d_avg.toFixed(2)}
                      </p>
                    </div>
                  )}
                  {readinessSummary.total_weighted != null && (
                    <div className="bg-[#1e3a5f] rounded-xl p-3 text-center text-white">
                      <p className="text-[10px] text-white/50 uppercase">Total</p>
                      <p className="text-lg font-bold">
                        {readinessSummary.total_weighted.toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-500 mb-4">{formConfig.interpretation}</p>

              <div className="space-y-2 mb-4">
                {FINAL_DECISIONS.map((d) => (
                  <label
                    key={d.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer ${finalDecision === d.value ? "border-[#1e3a5f] bg-blue-50" : "border-gray-100"}`}
                  >
                    <input
                      type="radio"
                      name="final_decision"
                      checked={finalDecision === d.value}
                      onChange={() => setFinalDecision(d.value)}
                      className="accent-red-600"
                    />
                    <span className="text-sm text-gray-700">{d.label}</span>
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <FieldLabel>Strengths confirmed</FieldLabel>
                  <textarea
                    rows={2}
                    value={developmentPlan.strengths}
                    onChange={(e) =>
                      setDevelopmentPlan((p) => ({
                        ...p,
                        strengths: e.target.value,
                      }))
                    }
                    className={`${inputCls()} resize-none`}
                  />
                </div>
                <div>
                  <FieldLabel>Gaps to close</FieldLabel>
                  <textarea
                    rows={2}
                    value={developmentPlan.gaps}
                    onChange={(e) =>
                      setDevelopmentPlan((p) => ({ ...p, gaps: e.target.value }))
                    }
                    className={`${inputCls()} resize-none`}
                  />
                </div>
                <div>
                  <FieldLabel>Agreed actions, owner, target date</FieldLabel>
                  <textarea
                    rows={2}
                    value={developmentPlan.agreed_actions}
                    onChange={(e) =>
                      setDevelopmentPlan((p) => ({
                        ...p,
                        agreed_actions: e.target.value,
                      }))
                    }
                    className={`${inputCls()} resize-none`}
                  />
                </div>
                <div>
                  <FieldLabel>Date of next readiness review</FieldLabel>
                  <input
                    type="date"
                    value={developmentPlan.next_review_date}
                    onChange={(e) =>
                      setDevelopmentPlan((p) => ({
                        ...p,
                        next_review_date: e.target.value,
                      }))
                    }
                    className={inputCls()}
                  />
                </div>
              </div>

              {finalDecision === "promote_with_conditions" && (
                <div className="mb-4">
                  <FieldLabel>Conditions</FieldLabel>
                  <textarea
                    rows={2}
                    {...register("conditions")}
                    className={`${inputCls()} resize-none`}
                  />
                </div>
              )}

              <div className="mb-4">
                <FieldLabel>Decision Comments</FieldLabel>
                <textarea
                  rows={2}
                  {...register("decision_comments")}
                  className={`${inputCls()} resize-none`}
                />
              </div>

              <h4 className="text-xs font-bold text-gray-700 uppercase mb-3">
                Sign-Off
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {formConfig.signOffRoles.map((role) => {
                  const val = signOffs[role] ?? { name: "", date: "" };
                  return (
                    <div key={role} className="p-3 bg-gray-50 rounded-xl">
                      <p className="text-[10px] text-gray-400 uppercase font-semibold mb-2">
                        {role}
                      </p>
                      <input
                        type="text"
                        placeholder="Name"
                        value={val.name}
                        onChange={(e) =>
                          setSignOffs((p) => ({
                            ...p,
                            [role]: { ...val, name: e.target.value },
                          }))
                        }
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs mb-2"
                      />
                      <input
                        type="date"
                        value={val.date}
                        onChange={(e) =>
                          setSignOffs((p) => ({
                            ...p,
                            [role]: { ...val, date: e.target.value },
                          }))
                        }
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedAppraisal(null)}
                className="px-5 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 flex items-center gap-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Submit Assessment
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {selectedAppraisal && !formConfig && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            No promotion form is configured for grade{" "}
            <strong>{selectedAppraisal.current_grade}</strong>. Promotion forms
            are available for L1 through L6.
          </div>
        )}
      </div>
    </div>
  );
}
