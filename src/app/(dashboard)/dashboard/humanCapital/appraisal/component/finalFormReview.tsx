"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  Loader2,
  CheckCircle2,
  TrendingUp,
  Lock,
  MessageSquare,
  AlertCircle,
  Users,
} from "lucide-react";
import {
  Ratings,
  computeWeightedScore,
  bandFor,
  bandLabel,
  itemRatingMeta,
  ITEM_RATING_MIN,
  ITEM_RATING_MAX,
} from "@/lib/appraisal/scoring";
import { Quarter, sectionsFor } from "@/lib/appraisal/sections";
import { DeadlineBanner } from "./DeadlineBanner";
import { FormPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { getPromotionReadinessOptions } from "@/lib/moduleRegistry";

interface Appraisal {
  id: string | number;
  employee_name: string;
  job_title: string;
  current_grade: string;
  grade_band: string;
  review_quarter: Quarter;
  review_year: number;
  immediate_supervisor: string;
  period_covered?: string | null;
  employee_ratings: Ratings;
  supervisor_ratings: Ratings;
  employee_weighted_score: number;
  supervisor_weighted_score: number;
  promotion_readiness: string;
  submitted_by: string;
  status: string;
  deadline_at?: string | null;
  reopened_deadline_at?: string | null;
}

const PROMOTION_OPTIONS = getPromotionReadinessOptions();

function diffIndicator(emp: number | null, sup: number | null) {
  if (emp == null || sup == null || emp === sup) return null;
  const diff = emp - sup;
  return diff > 0
    ? { label: `Employee rated ${Math.abs(diff)} higher`, color: "text-blue-500" }
    : { label: `Supervisor rated ${Math.abs(diff)} higher`, color: "text-purple-500" };
}

// ─── Rating Chip (read-only display) ─────────────────────────────────────────
function RatingChip({ rating, label }: { rating: number | null; label: string }) {
  const meta = itemRatingMeta(rating);
  if (rating == null) {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
          {label}
        </span>
        <span className="text-xs text-gray-300">—</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
        {label}
      </span>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${meta?.text} bg-gray-50 border border-gray-100`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${meta?.color}`} />
        {rating}/5
      </span>
    </div>
  );
}

// ─── Editable rating selector (for supervisor final ratings) ──────────────────
function FinalRatingSelector({
  value,
  original,
  onChange,
}: {
  value: number | null;
  original: number | null;
  onChange: (v: number) => void;
}) {
  const changed = value !== original;
  const meta = itemRatingMeta(value);
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
        Final
        {changed && (
          <span className="text-[9px] bg-amber-100 text-amber-600 px-1 rounded font-bold">
            REVISED
          </span>
        )}
      </span>
      <div className="flex items-center gap-1">
        {Array.from(
          { length: ITEM_RATING_MAX - ITEM_RATING_MIN + 1 },
          (_, i) => ITEM_RATING_MIN + i,
        ).map((n) => {
          const selected = value === n;
          const m = itemRatingMeta(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              title={m?.label}
              className={`w-6 h-6 rounded-md text-[11px] font-bold border transition-colors ${
                selected
                  ? `${m?.color} text-white border-transparent`
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      {value != null && meta && (
        <span className={`text-[10px] font-semibold ${meta.text}`}>{meta.label}</span>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface FinalReviewFormProps {
  appraisalId: string | number;
  onSuccess?: () => void;
  onBack?: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FinalReviewForm({
  appraisalId,
  onSuccess,
  onBack,
}: FinalReviewFormProps) {
  const { data: appraisal, isLoading } = useQuery<Appraisal>({
    queryKey: ["appraisal", appraisalId],
    queryFn: async () => {
      const res = await api.get(`/appraisal/${appraisalId}`);
      return res.data.data;
    },
    enabled: !!appraisalId,
  });

  const [finalRatings, setFinalRatings] = useState<Ratings | null>(null);
  const [discussionNotes, setDiscussionNotes] = useState("");
  const [notesError, setNotesError] = useState("");
  const [promotionReadiness, setPromotionReadiness] = useState(
    appraisal?.promotion_readiness ?? "",
  );

  const initialised = finalRatings !== null;
  if (appraisal && !initialised) {
    setFinalRatings(JSON.parse(JSON.stringify(appraisal.supervisor_ratings ?? {})));
  }

  const sections = sectionsFor(appraisal?.grade_band ?? "L1", appraisal?.review_quarter ?? "Q1");

  const liveScore = useMemo(() => {
    if (!finalRatings) return null;
    return computeWeightedScore(finalRatings, sections).weightedScore;
  }, [finalRatings, sections]);

  const handleFinalRatingChange = (sectionKey: string, item: string, rating: number) => {
    setFinalRatings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [sectionKey]: {
          ...prev[sectionKey],
          [item]: { comment: prev[sectionKey]?.[item]?.comment ?? "", rating },
        },
      };
    });
  };

  const changedCount = useMemo(() => {
    if (!finalRatings || !appraisal?.supervisor_ratings) return 0;
    let count = 0;
    for (const section of sections) {
      for (const item of section.items) {
        const original = appraisal.supervisor_ratings[section.key]?.[item]?.rating ?? null;
        const final = finalRatings[section.key]?.[item]?.rating ?? null;
        if (original !== final) count++;
      }
    }
    return count;
  }, [finalRatings, appraisal, sections]);

  const { mutate, isPending } = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.patch(`/appraisal/${appraisalId}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success(
        appraisal?.review_quarter === "Q4"
          ? "Final review submitted. The employee's annual Final Score and promotion eligibility have been calculated automatically."
          : "Final review submitted successfully.",
      );
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error ?? "Failed to submit final review.");
    },
  });

  const handleSubmit = () => {
    if (!discussionNotes.trim()) {
      setNotesError("Please add discussion notes before submitting.");
      toast.error("Discussion notes are required.");
      return;
    }
    setNotesError("");

    mutate({
      supervisor_ratings: finalRatings,
      supervisor_weighted_score: liveScore,
      promotion_readiness: promotionReadiness,
      final_review_notes: discussionNotes,
      status: "final_reviewed",
      submitted_by: "both",
    });
  };

  if (isLoading || !appraisal || !finalRatings) {
    return <FormPageSkeleton />;
  }

  const period =
    appraisal.review_quarter === "Q4"
      ? (appraisal.period_covered ?? String(appraisal.review_year))
      : `${appraisal.review_quarter} ${appraisal.review_year}`;

  const originalSupScore = appraisal.supervisor_weighted_score;
  const scoreChanged = liveScore !== null && liveScore !== originalSupScore;

  return (
    <div className="space-y-5">
      {appraisal.status === "reopened" && (
        <DeadlineBanner
          reviewQuarter={appraisal.review_quarter}
          reviewYear={appraisal.review_year}
          status={appraisal.status}
          deadlineAt={appraisal.deadline_at}
          reopenedDeadlineAt={appraisal.reopened_deadline_at}
        />
      )}
      {/* ── Header ── */}
      <div className="bg-[#1e3a5f] rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-white/50" />
              <span className="text-xs font-semibold uppercase tracking-widest text-white/50">
                Final Review Meeting
              </span>
            </div>
            <h2 className="text-xl font-bold">{appraisal.employee_name}</h2>
            <p className="text-white/60 text-sm mt-0.5">{appraisal.job_title}</p>
            <p className="text-white/40 text-xs mt-1">
              {period} · {appraisal.grade_band} · Supervisor: {appraisal.immediate_supervisor}
            </p>
          </div>

          {/* Score comparison */}
          <div className="flex gap-3 bg-white/10 rounded-xl p-3">
            <div className="text-center px-3">
              <p className="text-[10px] text-white/50 mb-1">Employee</p>
              <p className={`text-2xl font-black ${bandFor(appraisal.employee_weighted_score)?.text ?? "text-white"}`}>
                {appraisal.employee_weighted_score?.toFixed(1) ?? "—"}
              </p>
              <p className="text-white/30 text-[10px]">%</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center px-3">
              <p className="text-[10px] text-white/50 mb-1">Supervisor</p>
              <p className={`text-2xl font-black ${bandFor(originalSupScore)?.text ?? "text-white"}`}>
                {originalSupScore?.toFixed(1) ?? "—"}
              </p>
              <p className="text-white/30 text-[10px]">%</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center px-3">
              <p className="text-[10px] text-white/50 mb-1 flex items-center gap-1 justify-center">
                Final
                {scoreChanged && (
                  <span className="text-amber-300 text-[9px] font-bold">REVISED</span>
                )}
              </p>
              <p className={`text-2xl font-black ${bandFor(liveScore)?.text ?? "text-white"}`}>
                {liveScore?.toFixed(1) ?? "—"}
              </p>
              <p className="text-white/30 text-[10px]">%</p>
            </div>
          </div>
        </div>

        {appraisal.review_quarter === "Q4" && (
          <div className="mt-3 bg-purple-500/20 border border-purple-400/30 rounded-lg px-3 py-2 text-xs text-purple-200 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            This is the Q4 (Annual) review — submitting here will
            automatically compute the employee's Final Score and promotion
            eligibility for the year.
          </div>
        )}

        {changedCount > 0 && (
          <div className="mt-3 bg-amber-500/20 border border-amber-400/30 rounded-lg px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {changedCount} rating{changedCount > 1 ? "s" : ""} revised from original supervisor submission
          </div>
        )}
      </div>

      {/* ── Live score sticky banner ── */}
      <div className="sticky top-4 z-10 bg-[#1e3a5f] text-white rounded-2xl px-5 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-4 h-4 text-white/60" />
          <span className="text-xs font-semibold text-white/60 uppercase tracking-wide">
            Final Supervisor Score (Live)
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className={`text-2xl font-black ${bandFor(liveScore)?.text ?? "text-white"}`}>
            {liveScore?.toFixed(1) ?? "—"}
          </span>
          <span className="text-white/30 text-xs">%</span>
          <span className="text-xs text-white/50">{bandLabel(liveScore)}</span>
          {scoreChanged && (
            <span className="text-xs bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full">
              was {originalSupScore?.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* ── Instructions banner ── */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-blue-700">
        <Users className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Final Review Meeting</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Review each rating with the employee. Employee ratings are locked.
            You can revise your supervisor ratings based on the discussion.
            Revised ratings are highlighted in amber. Submitting here
            finalizes and locks this quarter's score.
          </p>
        </div>
      </div>

      {/* ── Sections ── */}
      {sections.map((section) => {
        const empSec = appraisal.employee_ratings?.[section.key] ?? {};
        const supSec = appraisal.supervisor_ratings?.[section.key] ?? {};
        const finalSec = finalRatings[section.key] ?? {};

        return (
          <div key={section.key} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div className="bg-[#1e3a5f] px-4 py-3 flex items-center justify-between">
              <span className="text-white text-sm font-semibold">
                {section.key}. {section.title}
              </span>
              <span className="text-xs bg-white/15 px-2 py-0.5 rounded-full text-white/70">
                Weight: {Math.round(section.weight * 100)}%
              </span>
            </div>

            <div className="grid grid-cols-[1fr_140px_140px_180px] gap-3 px-4 py-2 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <span>Review Area</span>
              <span className="text-center">Employee</span>
              <span className="text-center">Supervisor</span>
              <span className="text-center">Final (Editable)</span>
            </div>

            <div className="divide-y divide-gray-100">
              {section.items.map((item) => {
                const empRating = empSec[item]?.rating ?? null;
                const supRating = supSec[item]?.rating ?? null;
                const finalRating = finalSec[item]?.rating ?? null;
                const diff = diffIndicator(empRating, supRating);
                const revised = finalRating !== supRating;

                return (
                  <div
                    key={item}
                    className={`grid grid-cols-[1fr_140px_140px_180px] gap-3 items-center px-4 py-3 transition-colors ${
                      revised ? "bg-amber-50/50" : "hover:bg-gray-50/40"
                    }`}
                  >
                    <div>
                      <span className="text-sm text-gray-700 leading-snug block">{item}</span>
                      {diff && (
                        <span className={`text-[10px] ${diff.color} mt-0.5 block`}>↕ {diff.label}</span>
                      )}
                    </div>

                    <div className="flex justify-center">
                      <RatingChip rating={empRating} label="Employee" />
                    </div>

                    <div className="flex justify-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                          Supervisor <Lock className="w-2.5 h-2.5 text-gray-300" />
                        </span>
                        {supRating != null ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${itemRatingMeta(supRating)?.text} bg-gray-50 border border-gray-100`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${itemRatingMeta(supRating)?.color}`} />
                            {supRating}/5
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <FinalRatingSelector
                        value={finalRating}
                        original={supRating}
                        onChange={(v) => handleFinalRatingChange(section.key, item, v)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── Promotion Readiness ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-1">Promotion Readiness Notes</h3>
        <p className="text-xs text-gray-400 mb-4">
          Confirm or update the discussion note agreed in the meeting. This
          does not override the automatic promotion eligibility calculation.
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
                onChange={() => setPromotionReadiness(opt.value)}
                className="accent-red-600"
              />
              <span className="text-sm text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Discussion Notes ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-red-500" />
          Discussion Notes
          <span className="text-red-500 ml-1">*</span>
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Summarise what was discussed in the meeting. Note any ratings that
          were revised and the reason agreed between both parties.
        </p>
        <textarea
          rows={4}
          value={discussionNotes}
          onChange={(e) => {
            setDiscussionNotes(e.target.value);
            if (e.target.value.trim()) setNotesError("");
          }}
          placeholder="e.g. Employee and supervisor discussed the Punctuality rating. Employee acknowledged two late arrivals in Q1. Supervisor revised rating from 65% to 50% based on documented instances..."
          className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-red-400 placeholder:text-gray-300 transition ${
            notesError ? "border-red-300 bg-red-50" : "border-gray-200"
          }`}
        />
        {notesError && (
          <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {notesError}
          </p>
        )}
      </div>

      {/* ── Submit ── */}
      <div className="flex justify-end gap-3 pt-2 pb-6">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="px-5 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
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
              Submit Final Review
            </>
          )}
        </button>
      </div>
    </div>
  );
}
