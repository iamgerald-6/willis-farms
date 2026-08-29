"use client";

import { CheckCircle2, FileText, ClipboardList, MessageSquare } from "lucide-react";
import {
  PromotionFormConfig,
  PromotionFormData,
  RATING_LABELS,
  getFormConfig,
  getPromotionStep,
} from "./promotionFormConfigs";

const RATING_COLORS: Record<number, string> = {
  1: "bg-red-50 text-red-700",
  2: "bg-orange-50 text-orange-700",
  3: "bg-amber-50 text-amber-700",
  4: "bg-green-50 text-green-700",
  5: "bg-emerald-50 text-emerald-700",
};

const STAGE_LABELS: Record<string, string> = {
  observed: "Observed",
  supervised: "Performed Under Supervision",
  consistent: "Performed Consistently to Standard",
};

interface PromotionRecord {
  current_grade: string;
  proposed_grade: string;
  promotion_step?: string | null;
  time_in_current_role?: string | null;
  business_need_confirmed?: boolean | null;
  eligibility_checklist: Record<string, { answer: string; comment: string }>;
  assessment_ratings: Record<string, { rating: number; comment: string }>;
  form_data?: PromotionFormData | null;
  decision_comments?: string | null;
  conditions?: string | null;
}

function RatingBadge({ rating }: { rating: number }) {
  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${RATING_COLORS[rating] ?? "bg-gray-100 text-gray-600"}`}
    >
      {rating} · {RATING_LABELS[rating]}
    </span>
  );
}

export function PromotionFormSections({
  promotion,
}: {
  promotion: PromotionRecord;
}) {
  const step =
    (promotion.promotion_step as ReturnType<typeof getPromotionStep>) ??
    getPromotionStep(promotion.current_grade);
  const config = step ? getFormConfig(promotion.current_grade) : null;
  const formData = promotion.form_data ?? {};
  const isLegacy = !formData.documented_evidence && !formData.interview_responses;

  const documentedEvidence =
    formData.documented_evidence ?? promotion.assessment_ratings ?? {};
  const disqualifying = formData.disqualifying_factors ?? {};
  const skillsLog = formData.skills_log_signoff ?? {};
  const interview = formData.interview_responses ?? {};
  const devPlan = formData.development_plan;
  const signOffs = formData.sign_offs ?? {};
  const summary = formData.readiness_summary;

  return (
    <>
      {config && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs sm:text-sm text-blue-800">
          <p className="font-semibold mb-1">{config.title}</p>
          <p className="text-blue-700/80 leading-relaxed">{config.howToUse}</p>
        </div>
      )}

      {(promotion.time_in_current_role ||
        promotion.business_need_confirmed != null) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {promotion.time_in_current_role && (
            <div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                Time in Current Role
              </p>
              <p className="text-xs sm:text-sm text-gray-800">
                {promotion.time_in_current_role}
              </p>
            </div>
          )}
          {promotion.business_need_confirmed != null && (
            <div>
              <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                Business Need / Vacancy Confirmed
              </p>
              <p className="text-xs sm:text-sm text-gray-800">
                {promotion.business_need_confirmed ? "Yes" : "No"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Section A — Eligibility */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-red-500" /> Section A — Minimum
          Eligibility Gate
        </h3>
        <div className="space-y-2">
          {Object.entries(promotion.eligibility_checklist).map(([req, val]) => (
            <div
              key={req}
              className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
            >
              <span className="text-xs sm:text-sm text-gray-700 flex-1">
                {req}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                {val.comment && (
                  <span className="text-xs text-gray-400 italic max-w-[200px] truncate">
                    {val.comment}
                  </span>
                )}
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-bold border ${val.answer === "yes" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : val.answer === "no" ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-100 text-gray-400 border-gray-200"}`}
                >
                  {val.answer === "yes"
                    ? "Yes"
                    : val.answer === "no"
                      ? "No"
                      : "Not answered"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disqualifying factors */}
      {Object.keys(disqualifying).length > 0 && (
        <div className="bg-white rounded-xl border border-red-100 p-4 sm:p-5">
          <h3 className="text-sm font-bold text-red-800 mb-4">
            Absolute Disqualifying Factors
          </h3>
          <div className="space-y-2">
            {Object.entries(disqualifying).map(([factor, val]) => (
              <div
                key={factor}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-red-50/50 border border-red-100"
              >
                <span className="text-xs sm:text-sm text-gray-700">{factor}</span>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-bold border ${val.present === "yes" ? "bg-red-100 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}
                >
                  {val.present === "yes" ? "Present" : "Not present"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section B — Documented evidence */}
      {Object.keys(documentedEvidence).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-red-500" /> Section B —
            Documented Evidence Review
          </h3>
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            {Object.entries(documentedEvidence).map(([area, val]) => (
              <div
                key={area}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-t border-gray-50 first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-xs sm:text-sm text-gray-700">{area}</span>
                  {val.comment && (
                    <p className="text-xs text-gray-400 italic mt-0.5">
                      {val.comment}
                    </p>
                  )}
                </div>
                {val.rating ? <RatingBadge rating={val.rating} /> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section C — Skills log sign-off */}
      {Object.keys(skillsLog).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-red-500" /> Section C — New-Level
            Skills-Log Sign-Off
          </h3>
          <div className="space-y-2">
            {Object.entries(skillsLog).map(([comp, val]) => (
              <div
                key={comp}
                className="p-3 rounded-xl bg-gray-50 border border-gray-100"
              >
                <p className="text-xs sm:text-sm text-gray-700 mb-2">{comp}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {val.stage && (
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg font-semibold">
                      {STAGE_LABELS[val.stage] ?? val.stage}
                    </span>
                  )}
                  {val.verifier && (
                    <span className="text-gray-500">Verifier: {val.verifier}</span>
                  )}
                  {val.date && (
                    <span className="text-gray-500">Date: {val.date}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section D — Interview */}
      {Object.keys(interview).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-red-500" /> Section D —
            Forward-Looking Readiness Interview
          </h3>
          <div className="space-y-3">
            {config?.interviewQuestions.map((q) => {
              const val = interview[q.id];
              if (!val) return null;
              return (
                <div
                  key={q.id}
                  className="p-3 rounded-xl bg-gray-50 border border-gray-100"
                >
                  <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">
                    {q.section}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-800 mb-2">
                    {q.question}
                  </p>
                  <div className="flex items-start justify-between gap-2">
                    {val.notes && (
                      <p className="text-xs text-gray-500 italic flex-1">
                        {val.notes}
                      </p>
                    )}
                    {val.rating ? <RatingBadge rating={val.rating} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legacy assessment fallback label */}
      {isLegacy && Object.keys(promotion.assessment_ratings).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-red-500" /> Assessment by Core Area
          </h3>
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            {Object.entries(promotion.assessment_ratings).map(([area, val]) => (
              <div
                key={area}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-t border-gray-50"
              >
                <span className="text-xs sm:text-sm text-gray-700">{area}</span>
                {val.rating ? <RatingBadge rating={val.rating} /> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section E — Summary */}
      {summary && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4">
            Section E — Readiness Summary
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {summary.section_b_avg != null && (
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-400 uppercase">Section B</p>
                <p className="text-lg font-bold text-gray-800">
                  {summary.section_b_avg.toFixed(2)}
                </p>
              </div>
            )}
            {summary.section_c_score != null && (
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-400 uppercase">Section C</p>
                <p className="text-lg font-bold text-gray-800">
                  {summary.section_c_score.toFixed(2)}
                </p>
              </div>
            )}
            {summary.section_d_avg != null && (
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-400 uppercase">Section D</p>
                <p className="text-lg font-bold text-gray-800">
                  {summary.section_d_avg.toFixed(2)}
                </p>
              </div>
            )}
            {summary.total_weighted != null && (
              <div className="bg-[#1e3a5f] rounded-xl p-3 text-center">
                <p className="text-[10px] text-white/50 uppercase">Total</p>
                <p className="text-lg font-bold text-white">
                  {summary.total_weighted.toFixed(2)}
                </p>
              </div>
            )}
          </div>
          {config?.interpretation && (
            <p className="text-xs text-gray-500 mt-3 leading-relaxed">
              {config.interpretation}
            </p>
          )}
        </div>
      )}

      {devPlan &&
        (devPlan.strengths ||
          devPlan.gaps ||
          devPlan.agreed_actions ||
          devPlan.next_review_date) && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-800">
              Development Plan / Conditions
            </h3>
            {devPlan.strengths && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">
                  Strengths confirmed
                </p>
                <p className="text-xs sm:text-sm text-gray-700">{devPlan.strengths}</p>
              </div>
            )}
            {devPlan.gaps && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">
                  Gaps to close
                </p>
                <p className="text-xs sm:text-sm text-gray-700">{devPlan.gaps}</p>
              </div>
            )}
            {devPlan.agreed_actions && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">
                  Agreed actions
                </p>
                <p className="text-xs sm:text-sm text-gray-700">
                  {devPlan.agreed_actions}
                </p>
              </div>
            )}
            {devPlan.next_review_date && (
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">
                  Next readiness review
                </p>
                <p className="text-xs sm:text-sm text-gray-700">
                  {devPlan.next_review_date}
                </p>
              </div>
            )}
          </div>
        )}

      {Object.keys(signOffs).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Sign-Off</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(signOffs).map(([role, val]) => (
              <div key={role} className="bg-gray-50 rounded-xl p-3">
                <p className="text-[10px] text-gray-400 uppercase font-semibold">
                  {role}
                </p>
                <p className="text-sm text-gray-800">{val.name || "—"}</p>
                {val.date && (
                  <p className="text-xs text-gray-400 mt-0.5">{val.date}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {promotion.conditions && (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <p className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            Conditions
          </p>
          <p className="text-xs sm:text-sm text-gray-700">{promotion.conditions}</p>
        </div>
      )}

      {promotion.decision_comments && (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <p className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            Decision Comments
          </p>
          <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
            {promotion.decision_comments}
          </p>
        </div>
      )}
    </>
  );
}
