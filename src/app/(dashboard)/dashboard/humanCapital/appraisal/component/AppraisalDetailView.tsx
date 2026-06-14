"use client";

import { useMemo } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  User,
  CalendarRange,
  ClipboardList,
  Star,
  MessageSquare,
  Award,
} from "lucide-react";
import { SectionRatings, Ratings, RatingValue, Appraisal } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────
const RATING_LABELS: Record<number, string> = {
  1: "Unsatisfactory",
  2: "Below Expectation",
  3: "Meets Expectation",
  4: "Above Expectation",
  5: "Excellent",
};

const RATING_COLORS: Record<number, { bg: string; text: string; bar: string }> =
  {
    1: { bg: "bg-red-50", text: "text-red-600", bar: "bg-red-500" },
    2: { bg: "bg-orange-50", text: "text-orange-600", bar: "bg-orange-400" },
    3: { bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-400" },
    4: { bg: "bg-green-50", text: "text-green-700", bar: "bg-green-500" },
    5: { bg: "bg-emerald-50", text: "text-emerald-700", bar: "bg-emerald-500" },
  };

const PROMOTION_LABELS: Record<string, string> = {
  not_yet_ready: "Not Yet Ready",
  developing: "Developing Toward Next Level",
  nearly_ready: "Nearly Ready",
  ready_for_assessment: "Ready for Promotion Assessment",
  ready_for_expanded_responsibility: "Ready for Expanded Responsibility",
};

const PROMOTION_STYLES: Record<
  string,
  { bg: string; text: string; icon: React.ReactNode }
> = {
  not_yet_ready: {
    bg: "bg-red-50 border-red-200",
    text: "text-red-700",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  developing: {
    bg: "bg-orange-50 border-orange-200",
    text: "text-orange-700",
    icon: <TrendingUp className="w-4 h-4" />,
  },
  nearly_ready: {
    bg: "bg-amber-50 border-amber-200",
    text: "text-amber-700",
    icon: <TrendingUp className="w-4 h-4" />,
  },
  ready_for_assessment: {
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-700",
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  ready_for_expanded_responsibility: {
    bg: "bg-blue-50 border-blue-200",
    text: "text-blue-700",
    icon: <Award className="w-4 h-4" />,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function computeSectionAverage(sectionRatings: SectionRatings): number | null {
  const vals = Object.values(sectionRatings)
    .map((r) => r.rating)
    .filter((r): r is RatingValue => r !== null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function computeOverallAverage(ratings: Ratings): number | null {
  const vals: number[] = [];
  for (const section of Object.values(ratings)) {
    for (const item of Object.values(section)) {
      if (item.rating !== null) vals.push(item.rating);
    }
  }
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function RatingBadge({ value }: { value: RatingValue | null }) {
  if (!value) return <span className="text-gray-300 text-xs">—</span>;
  const c = RATING_COLORS[value];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.bar}`} />
      {value} · {RATING_LABELS[value]}
    </span>
  );
}

function ScoreBar({ value, max = 5 }: { value: number; max?: number }) {
  const pct = (value / max) * 100;
  const rounded = Math.round(value * 10) / 10;
  const colorKey = Math.round(value) as RatingValue;
  const c = RATING_COLORS[Math.min(5, Math.max(1, colorKey)) as RatingValue];
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${c.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-sm font-bold tabular-nums w-8 text-right ${c.text}`}
      >
        {rounded}
      </span>
    </div>
  );
}

// ─── Section Detail ───────────────────────────────────────────────────────────
function SectionDetail({
  sectionKey,
  sectionRatings,
}: {
  sectionKey: string;
  sectionRatings: SectionRatings;
}) {
  const avg = computeSectionAverage(sectionRatings);
  const items = Object.entries(sectionRatings);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="bg-[#1e3a5f] px-4 py-3 flex items-center justify-between">
        <span className="text-white text-sm font-semibold">
          Section {sectionKey}
        </span>
        {avg !== null && (
          <div className="flex items-center gap-2">
            <span className="text-white/60 text-xs">Section avg</span>
            <span className="text-white font-bold text-sm">
              {(Math.round(avg * 10) / 10).toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="divide-y divide-gray-50">
        {items.map(([label, item]) => (
          <div
            key={label}
            className="px-4 py-3 grid grid-cols-[1fr_auto] gap-4 items-start"
          >
            <div>
              <p className="text-sm text-gray-700 leading-snug mb-1">{label}</p>
              {item.comment && (
                <p className="text-xs text-gray-400 flex items-start gap-1">
                  <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {item.comment}
                </p>
              )}
            </div>
            <div className="pt-0.5">
              <RatingBadge value={item.rating} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Info Row ─────────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  );
}

function NarrativeBlock({
  label,
  value,
  icon,
}: {
  label: string;
  value?: string | null;
  icon?: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
        {value}
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function AppraisalDetailView({ appraisal }: { appraisal: Appraisal }) {
  const overall = useMemo(
    () => computeOverallAverage(appraisal.ratings),
    [appraisal.ratings]
  );

  const sectionEntries = Object.entries(appraisal.ratings);
  const promoStyle =
    PROMOTION_STYLES[appraisal.promotion_readiness] ??
    PROMOTION_STYLES.not_yet_ready;

  const periodLabel =
    appraisal.cycle === "quarterly"
      ? `${appraisal.review_quarter ?? ""} ${appraisal.review_year}`
      : appraisal.period_covered ?? String(appraisal.review_year);

  return (
    <div className="space-y-6">
      {/* ── Header Card ── */}
      <div className="bg-[#1e3a5f] rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-white/50">
                {appraisal.cycle === "quarterly"
                  ? "Quarterly Review"
                  : "Annual Appraisal"}
              </span>
              <span className="text-white/30">·</span>
              <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">
                {appraisal.grade_band}
              </span>
            </div>
            <h2 className="text-2xl font-bold">{appraisal.employee_name}</h2>
            <p className="text-white/60 text-sm mt-0.5">
              {appraisal.job_title}
            </p>
          </div>

          {overall !== null && (
            <div className="text-center bg-white/10 rounded-xl px-5 py-3 flex-shrink-0">
              <p className="text-white/50 text-xs uppercase tracking-wide mb-1">
                Overall
              </p>
              <p className="text-3xl font-black">
                {(Math.round(overall * 10) / 10).toFixed(1)}
              </p>
              <p className="text-white/60 text-xs">out of 5</p>
            </div>
          )}
        </div>

        {/* Meta row */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-white/60">
          <span className="flex items-center gap-1.5">
            <CalendarRange className="w-3.5 h-3.5" />
            {periodLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            Supervisor: {appraisal.immediate_supervisor}
          </span>
          {appraisal.reviewing_manager && (
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              Manager: {appraisal.reviewing_manager}
            </span>
          )}
          <span className="font-mono">{appraisal.company_id}</span>
        </div>
      </div>

      {/* ── Scores Summary ── */}
      {sectionEntries.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-red-500" />
            Section Score Summary
          </h3>
          <div className="space-y-3">
            {sectionEntries.map(([key, sectionRatings]) => {
              const avg = computeSectionAverage(sectionRatings);
              return (
                <div
                  key={key}
                  className="grid grid-cols-[auto_1fr] gap-3 items-center"
                >
                  <span className="text-xs font-bold text-gray-500 w-20">
                    Section {key}
                  </span>
                  {avg !== null ? (
                    <ScoreBar value={avg} />
                  ) : (
                    <span className="text-xs text-gray-300">No ratings</span>
                  )}
                </div>
              );
            })}
            {overall !== null && (
              <div className="grid grid-cols-[auto_1fr] gap-3 items-center border-t border-dashed border-gray-200 pt-3 mt-1">
                <span className="text-xs font-bold text-gray-800 w-20">
                  Overall
                </span>
                <ScoreBar value={overall} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Employee & Period Info ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-red-500" />
          Employee Details
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <InfoRow label="Company ID" value={appraisal.company_id} />
          <InfoRow label="Job Title" value={appraisal.job_title} />
          <InfoRow label="Grade / Band" value={appraisal.grade_band} />
          <InfoRow
            label="Section Authorisations"
            value={appraisal.section_authorisations_held}
          />
          <InfoRow
            label="Immediate Supervisor"
            value={appraisal.immediate_supervisor}
          />
          {appraisal.reviewing_manager && (
            <InfoRow
              label="Reviewing Manager"
              value={appraisal.reviewing_manager}
            />
          )}
        </div>
      </div>

      {/* ── Promotion Readiness ── */}
      <div
        className={`rounded-xl border-2 p-4 flex items-center gap-3 ${promoStyle.bg}`}
      >
        <span className={promoStyle.text}>{promoStyle.icon}</span>
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
            Promotion Readiness
          </p>
          <p className={`text-sm font-bold ${promoStyle.text}`}>
            {PROMOTION_LABELS[appraisal.promotion_readiness] ??
              appraisal.promotion_readiness}
          </p>
        </div>
      </div>

      {/* ── Ratings Sections ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-red-500" />
          Performance Ratings
        </h3>
        {sectionEntries.map(([key, sectionRatings]) => (
          <SectionDetail
            key={key}
            sectionKey={key}
            sectionRatings={sectionRatings}
          />
        ))}
      </div>

      {/* ── Narrative Comments ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-800">
          Comments &amp; Development
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NarrativeBlock
            label="Strengths Observed"
            value={appraisal.strengths_observed}
            icon={<CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
          />
          <NarrativeBlock
            label="Improvement Areas"
            value={appraisal.improvement_areas}
            icon={<TrendingUp className="w-3.5 h-3.5 text-orange-500" />}
          />
          <NarrativeBlock
            label="Agreed Actions"
            value={appraisal.agreed_actions}
            icon={<ClipboardList className="w-3.5 h-3.5 text-blue-500" />}
          />
          <NarrativeBlock
            label="Employee Comments"
            value={appraisal.employee_comments}
            icon={<MessageSquare className="w-3.5 h-3.5 text-purple-500" />}
          />
        </div>

        {/* Annual-only */}
        {appraisal.cycle === "annual" && (
          <div className="space-y-3">
            <NarrativeBlock
              label="Most Significant Achievement"
              value={appraisal.most_significant_achievement}
              icon={<Award className="w-3.5 h-3.5 text-yellow-500" />}
            />
            <NarrativeBlock
              label="Development Plan — Coming Year"
              value={appraisal.development_plan_next_year}
              icon={<TrendingUp className="w-3.5 h-3.5 text-blue-500" />}
            />
            <NarrativeBlock
              label="Promotion Readiness Assessment"
              value={appraisal.promotion_readiness_assessment}
              icon={<Star className="w-3.5 h-3.5 text-emerald-500" />}
            />
            <NarrativeBlock
              label="Compensation Review Input"
              value={appraisal.compensation_review_input}
              icon={<ClipboardList className="w-3.5 h-3.5 text-gray-500" />}
            />
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="text-xs text-gray-300 text-right pb-2">
        Submitted{" "}
        {new Date(appraisal.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </div>
    </div>
  );
}
