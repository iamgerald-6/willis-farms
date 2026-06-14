"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import {
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  User,
  ClipboardList,
  Award,
  ChevronDown,
  Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
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
  employee_ratings?: any;
  supervisor_ratings?: any;
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

// ─── Constants ────────────────────────────────────────────────────────────────
const GRADE_ORDER = ["L1", "L2", "L3", "L4", "L5", "L6", "L7"];

function gradeIndex(g: string | null | undefined) {
  if (!g) return -1;
  const clean = g.replace("_", "/").split("/")[0].trim();
  return GRADE_ORDER.indexOf(clean);
}

const ELIGIBILITY_REQUIREMENTS = [
  "Minimum expected time in role completed",
  "Attendance record satisfactory",
  "Conduct and discipline record satisfactory",
  "No serious unresolved disciplinary issue",
  "No major biosecurity or tier-discipline breach",
  "Current performance satisfactory",
  "All four Quarterly Performance Reviews of the year attached",
  "Annual Appraisal of the year attached",
  "Skills log completed where required",
  "Practical sign-off completed where required",
  "Theory assessment completed where required",
  "Reproductive KPI contribution satisfactory (L3 and above)",
  "Supervisor recommends employee for review",
  "Business need / role availability confirmed",
];

const ASSESSMENT_AREAS = [
  "Attendance and punctuality",
  "Conduct and professionalism",
  "Biosecurity compliance",
  "Tier-discipline compliance",
  "PPE compliance",
  "SOP compliance",
  "Technical competence in current role",
  "AI competence (where applicable)",
  "Recordkeeping accuracy",
  "Abnormality detection and escalation",
  "Task completion quality",
  "Hygiene and sanitation discipline",
  "Teamwork and collaboration",
  "Reliability and accountability",
  "Reproductive KPI contribution (L3+)",
];

const FINAL_DECISIONS = [
  { value: "promote", label: "Promote" },
  { value: "promote_with_conditions", label: "Promote with conditions" },
  { value: "defer_pending_skills", label: "Defer pending skills completion" },
  {
    value: "retain_with_improvement",
    label: "Retain in current role with improvement plan",
  },
  { value: "not_ready", label: "Not promotion-ready" },
];

const RATING_LABELS: Record<number, string> = {
  1: "Unsatisfactory",
  2: "Below Expectation",
  3: "Meets Expectation",
  4: "Above Expectation",
  5: "Excellent",
};

const RATING_COLORS: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-400",
  3: "bg-amber-400",
  4: "bg-green-400",
  5: "bg-emerald-500",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

// ─── Appraisal Summary Card ───────────────────────────────────────────────────
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
          <p className="text-white/40 text-xs mt-1">
            Supervisor: {appraisal.immediate_supervisor}
          </p>
        </div>
        <div className="flex gap-4 bg-white/10 rounded-xl px-5 py-3">
          {empScore && (
            <div className="text-center">
              <p className="text-xs text-white/50 mb-1">Employee</p>
              <p className="text-xl font-black text-green-300">
                {empScore.toFixed(2)}
              </p>
              <p className="text-white/30 text-xs">/ 5</p>
            </div>
          )}
          {supScore && (
            <>
              <div className="w-px bg-white/10" />
              <div className="text-center">
                <p className="text-xs text-white/50 mb-1">Supervisor</p>
                <p className="text-xl font-black text-emerald-300">
                  {supScore.toFixed(2)}
                </p>
                <p className="text-white/30 text-xs">/ 5</p>
              </div>
            </>
          )}
          {finalAvg && (
            <>
              <div className="w-px bg-white/10" />
              <div className="text-center">
                <p className="text-xs text-white/50 mb-1">Final Avg</p>
                <p className="text-xl font-black text-white">{finalAvg}</p>
                <p className="text-white/30 text-xs">/ 5</p>
              </div>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="mt-3 text-xs text-white/50 hover:text-white/80 flex items-center gap-1 transition"
      >
        {expanded ? "Hide" : "Show"} appraisal ratings
        <ChevronDown
          className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && appraisal.employee_ratings && (
        <div className="mt-3 bg-white/5 rounded-xl p-4 space-y-3 max-h-64 overflow-y-auto">
          {Object.entries(
            appraisal.employee_ratings as Record<
              string,
              Record<string, { rating: number; comment?: string }>
            >,
          ).map(([sectionKey, items]) => (
            <div key={sectionKey}>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1">
                Section {sectionKey}
              </p>
              {Object.entries(items).map(([item, val]) => (
                <div
                  key={item}
                  className="flex items-center justify-between py-0.5"
                >
                  <span className="text-xs text-white/60 truncate flex-1 pr-4">
                    {item}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      val.rating >= 5
                        ? "bg-emerald-500/30 text-emerald-300"
                        : val.rating >= 4
                          ? "bg-green-500/30 text-green-300"
                          : val.rating >= 3
                            ? "bg-amber-500/30 text-amber-300"
                            : val.rating >= 2
                              ? "bg-orange-500/30 text-orange-300"
                              : "bg-red-500/30 text-red-300"
                    }`}
                  >
                    {val.rating} · {RATING_LABELS[val.rating]}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Rating Selector ──────────────────────────────────────────────────────────
function RatingSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          title={RATING_LABELS[n]}
          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all border-2 ${
            value === n
              ? `${RATING_COLORS[n]} text-white border-transparent shadow-sm`
              : "bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PromotionFormPage({ onBack }: { onBack?: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAppraisal, setSelectedAppraisal] = useState<Appraisal | null>(
    null,
  );

  // Form state
  const [eligibility, setEligibility] = useState<
    Record<string, { answer: EligibilityAnswer; comment: string }>
  >({});
  const [assessmentRatings, setAssessmentRatings] = useState<
    Record<string, { rating: number | null; comment: string }>
  >({});
  const [finalDecision, setFinalDecision] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      proposed_job_title: "",
      proposed_grade: "",
      reviewing_manager: "",
      tier_authorisation: "",
      decision_comments: "",
      conditions: "",
    },
  });

  // ── Session ──
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });
  const userId = session?.user?.id ?? "";

  // ── Fetch current user profile to check grade ──
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

  // ── Fetch appraisals with promotion_readiness = ready_for_assessment and both submitted ──
  const { data: promotionAppraisals = [], isLoading } = useQuery<Appraisal[]>({
    queryKey: ["promotion_appraisals"],
    queryFn: async () => {
      const res = await api.get("/promotion/get_pending");
      return res.data?.data ?? [];
    },
  });

  // Exclude the current user's own appraisals — cannot promote yourself
  const eligibleAppraisals = useMemo(
    () =>
      promotionAppraisals.filter(
        (a) => a.company_id !== currentUserProfile?.company_id,
      ),
    [promotionAppraisals, currentUserProfile],
  );

  const filtered = useMemo(() => {
    if (!searchQuery) return eligibleAppraisals;
    const q = searchQuery.toLowerCase();
    return eligibleAppraisals.filter(
      (a) =>
        a.employee_name.toLowerCase().includes(q) || a.company_id.includes(q),
    );
  }, [eligibleAppraisals, searchQuery]);

  // ── Submit mutation ──
  const { mutate, isPending } = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post("/promotion/post_promotions", payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Promotion assessment submitted successfully!");
      reset();
      setSelectedAppraisal(null);
      setEligibility({});
      setAssessmentRatings({});
      setFinalDecision("");
      setFormErrors({});
      onBack?.();
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.error ?? "Failed to submit. Please try again.",
      );
    },
  });

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!selectedAppraisal) {
      errs.appraisal = "Please select an appraisal";
      toast.error("Please select an appraisal");
    }
    // Self-promotion guard
    if (
      selectedAppraisal &&
      currentUserProfile &&
      selectedAppraisal.company_id === currentUserProfile.company_id
    ) {
      errs.appraisal = "You cannot submit a promotion assessment for yourself.";
      toast.error("You cannot submit a promotion assessment for yourself.");
    }
    if (!finalDecision) {
      errs.decision = "Please select a final decision";
      toast.error("Please select a final decision");
    }
    const missingRatings = ASSESSMENT_AREAS.some(
      (a) => !assessmentRatings[a]?.rating,
    );
    if (missingRatings) {
      errs.ratings = "Please complete all assessment area ratings";
      toast.error("Please complete all assessment area ratings");
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = (formData: any) => {
    if (!validateForm()) return;
    mutate({
      appraisal_id: selectedAppraisal!.id,
      company_id: selectedAppraisal!.company_id,
      employee_name: selectedAppraisal!.employee_name,
      current_grade: selectedAppraisal!.current_grade,
      current_job_title: selectedAppraisal!.job_title,
      proposed_job_title: formData.proposed_job_title,
      proposed_grade: formData.proposed_grade,
      immediate_supervisor: selectedAppraisal!.immediate_supervisor,
      reviewing_manager: formData.reviewing_manager,
      tier_authorisation: formData.tier_authorisation,
      section_unit: selectedAppraisal!.section_authorisations_held,
      triggering_review: `${selectedAppraisal!.cycle === "quarterly" ? selectedAppraisal!.review_quarter + " " : ""}${selectedAppraisal!.review_year}`,
      eligibility_checklist: eligibility,
      assessment_ratings: assessmentRatings,
      final_decision: finalDecision,
      decision_comments: formData.decision_comments,
      conditions: formData.conditions,
      submitted_by_user_id: userId,
      submitted_by_grade: currentUserGrade,
    });
  };

  // ── Access guard ──
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
            forms. Your current grade is{" "}
            <span className="font-semibold">
              {currentUserGrade ?? "not set"}
            </span>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition mb-4"
        >
          ← Back to promotions
        </button>
      )}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Promotion Assessment Form
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Grade and Promotion Tools · L4 and above only
        </p>
      </div>

      <div className="max-w-5xl space-y-6">
        {/* ── Info banner ── */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-blue-700">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          Only appraisals where both the employee and supervisor have submitted
          AND promotion readiness is marked as "Ready for assessment" appear
          below.
        </div>

        {/* ── Appraisal selector ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-red-500" />
            Select Employee Appraisal
          </h3>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or company ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading
              appraisals...
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              No appraisals ready for promotion assessment
            </div>
          )}

          <div className="space-y-2">
            {filtered.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setSelectedAppraisal(a);
                  setFormErrors({});
                }}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  selectedAppraisal?.id === a.id
                    ? "border-[#1e3a5f] bg-blue-50/40"
                    : "border-gray-100 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {a.employee_name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {a.current_grade} ·{" "}
                      {a.cycle === "quarterly" ? `${a.review_quarter} ` : ""}
                      {a.review_year} · {a.company_id}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {a.employee_weighted_score && (
                      <span className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg font-semibold">
                        Emp: {a.employee_weighted_score.toFixed(2)}
                      </span>
                    )}
                    {a.supervisor_weighted_score && (
                      <span className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-semibold">
                        Sup: {a.supervisor_weighted_score.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Form (shown once appraisal selected) ── */}
        {selectedAppraisal && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* ── Appraisal summary ── */}
            <AppraisalSummaryCard appraisal={selectedAppraisal} />

            {/* ── Employee & Proposal details ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-red-500" />
                Employee & Promotion Details
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                    Employee Name
                  </p>
                  <p className="text-sm font-semibold text-gray-800">
                    {selectedAppraisal.employee_name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                    Current Grade
                  </p>
                  <p className="text-sm text-gray-800">
                    {selectedAppraisal.current_grade}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                    Current Job Title
                  </p>
                  <p className="text-sm text-gray-800">
                    {selectedAppraisal.job_title || "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                    Immediate Supervisor
                  </p>
                  <p className="text-sm text-gray-800">
                    {selectedAppraisal.immediate_supervisor}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel required>Proposed New Job Title</FieldLabel>
                  <input
                    type="text"
                    placeholder="e.g. Senior Swine Technician"
                    {...register("proposed_job_title", { required: true })}
                    className={inputCls(!!errors.proposed_job_title)}
                  />
                </div>
                <div>
                  <FieldLabel required>Proposed New Grade</FieldLabel>
                  <select
                    {...register("proposed_grade", { required: true })}
                    className={inputCls(!!errors.proposed_grade)}
                  >
                    <option value="">Select grade</option>
                    {GRADE_ORDER.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel required>Reviewing Manager</FieldLabel>
                  <input
                    type="text"
                    placeholder="Reviewing manager name"
                    {...register("reviewing_manager", { required: true })}
                    className={inputCls(!!errors.reviewing_manager)}
                  />
                </div>
                <div>
                  <FieldLabel>
                    Tier Authorisation Held (GP / PS / GGP)
                  </FieldLabel>
                  <input
                    type="text"
                    placeholder="e.g. GP, PS"
                    {...register("tier_authorisation")}
                    className={inputCls()}
                  />
                </div>
              </div>
            </div>

            {/* ── Minimum eligibility checklist ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-red-500" />
                Minimum Eligibility Check
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                Tick Yes or No for each requirement. Add comments where needed.
              </p>
              <div className="space-y-2">
                {ELIGIBILITY_REQUIREMENTS.map((req) => {
                  const val = eligibility[req] ?? { answer: "", comment: "" };
                  return (
                    <div
                      key={req}
                      className="grid grid-cols-[1fr_auto_auto_200px] gap-3 items-center p-3 rounded-xl bg-gray-50 border border-gray-100"
                    >
                      <span className="text-sm text-gray-700">{req}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setEligibility((prev) => ({
                            ...prev,
                            [req]: { ...val, answer: "yes" },
                          }))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${val.answer === "yes" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-500 border-gray-200 hover:border-emerald-300"}`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEligibility((prev) => ({
                            ...prev,
                            [req]: { ...val, answer: "no" },
                          }))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${val.answer === "no" ? "bg-red-500 text-white border-red-500" : "bg-white text-gray-500 border-gray-200 hover:border-red-300"}`}
                      >
                        No
                      </button>
                      <input
                        type="text"
                        placeholder="Comment..."
                        value={val.comment}
                        onChange={(e) =>
                          setEligibility((prev) => ({
                            ...prev,
                            [req]: { ...val, comment: e.target.value },
                          }))
                        }
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Assessment by core area ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-red-500" />
                Assessment by Core Area
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                Rate each area 1–5 using the same scale as the appraisal.
              </p>

              {formErrors.ratings && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2 mb-3">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {formErrors.ratings}
                </div>
              )}

              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_240px] gap-3 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <span>Assessment Area</span>
                  <span>Rating (1–5)</span>
                  <span>Comments</span>
                </div>
                {ASSESSMENT_AREAS.map((area) => {
                  const val = assessmentRatings[area] ?? {
                    rating: null,
                    comment: "",
                  };
                  return (
                    <div
                      key={area}
                      className="grid grid-cols-[1fr_auto_240px] gap-3 items-center px-4 py-3 border-t border-gray-50 hover:bg-gray-50/50 transition-colors"
                    >
                      <span className="text-sm text-gray-700">{area}</span>
                      <RatingSelector
                        value={val.rating}
                        onChange={(v) =>
                          setAssessmentRatings((prev) => ({
                            ...prev,
                            [area]: { ...val, rating: v },
                          }))
                        }
                      />
                      <input
                        type="text"
                        placeholder="Add comment..."
                        value={val.comment}
                        onChange={(e) =>
                          setAssessmentRatings((prev) => ({
                            ...prev,
                            [area]: { ...val, comment: e.target.value },
                          }))
                        }
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Final Decision ── */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
                <Award className="w-4 h-4 text-red-500" />
                Final Decision
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                Select the panel's final decision on this promotion assessment.
              </p>
              <div className="space-y-2 mb-4">
                {FINAL_DECISIONS.map((d) => (
                  <label
                    key={d.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      finalDecision === d.value
                        ? "border-[#1e3a5f] bg-blue-50"
                        : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="final_decision"
                      value={d.value}
                      checked={finalDecision === d.value}
                      onChange={() => {
                        setFinalDecision(d.value);
                        setFormErrors((prev) => ({ ...prev, decision: "" }));
                      }}
                      className="accent-red-600"
                    />
                    <span className="text-sm text-gray-700 font-medium">
                      {d.label}
                    </span>
                  </label>
                ))}
              </div>
              {formErrors.decision && (
                <p className="text-red-500 text-xs mb-3">
                  {formErrors.decision}
                </p>
              )}

              {finalDecision === "promote_with_conditions" && (
                <div className="mb-4">
                  <FieldLabel>Conditions</FieldLabel>
                  <textarea
                    rows={2}
                    placeholder="Describe the conditions for promotion..."
                    {...register("conditions")}
                    className={`${inputCls()} resize-none`}
                  />
                </div>
              )}

              <div>
                <FieldLabel>Decision Comments</FieldLabel>
                <textarea
                  rows={3}
                  placeholder="Additional comments from the reviewing manager or panel..."
                  {...register("decision_comments")}
                  className={`${inputCls()} resize-none`}
                />
              </div>
            </div>

            {/* ── Submit ── */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  reset();
                  setSelectedAppraisal(null);
                  setEligibility({});
                  setAssessmentRatings({});
                  setFinalDecision("");
                  setFormErrors({});
                }}
                className="px-5 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
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
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Submit Promotion
                    Assessment
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
