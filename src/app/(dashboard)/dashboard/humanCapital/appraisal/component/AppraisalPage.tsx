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
  TrendingUp,
  Info,
  Award,
  Lock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Cycle = "quarterly" | "annual";
type RatingValue = 1 | 2 | 3 | 4 | 5;

interface RatingItem {
  rating: RatingValue | null;
  comment: string;
}
interface SectionRatings {
  [itemLabel: string]: RatingItem;
}
interface Ratings {
  [sectionKey: string]: SectionRatings;
}

// Shape of an existing appraisal fetched from the API
interface ExistingAppraisal {
  id: string;
  company_id: string;
  employee_name: string;
  job_title: string;
  current_grade: string;
  grade_band: string;
  cycle: Cycle;
  review_quarter?: string | null;
  review_year: number;
  immediate_supervisor: string;
  reviewing_manager?: string | null;
  period_covered?: string | null;
  section_authorisations_held?: string | null;
  submitted_by?: "employee" | "supervisor" | "both";
  employee_ratings?: Ratings | null;
  supervisor_ratings?: Ratings | null;
}

// ─── Grade helpers ────────────────────────────────────────────────────────────
const GRADE_ORDER = ["L1", "L2", "L3", "L4", "L5", "L6", "L7"];

function gradeIndex(g: string | null | undefined): number {
  if (!g) return -1;
  const clean = g.replace("_", "/").split("/")[0].trim();
  return GRADE_ORDER.indexOf(clean);
}

function canRate(
  raterGrade: string | null | undefined,
  targetGrade: string | null | undefined,
): boolean {
  const rater = gradeIndex(raterGrade);
  const target = gradeIndex(targetGrade);
  if (rater < 3 || target === -1) return false; // below L4 cannot rate others
  return rater > target; // L4+ can only rate strictly lower grades
}

function canAppraiseOthers(grade: string | null | undefined): boolean {
  return gradeIndex(grade) >= 3; // L4+ (index 3)
}

// Supervisor = L4 and above (index 3)
function isSupervisorGrade(grade: string | null | undefined): boolean {
  return gradeIndex(grade) >= 3;
}

// ─── Sections map ─────────────────────────────────────────────────────────────
const SECTIONS_MAP: Record<
  string,
  Record<
    Cycle,
    { key: string; title: string; weight: number; items: string[] }[]
  >
> = {
  L1: {
    quarterly: [
      {
        key: "A",
        title: "Attendance and Conduct",
        weight: 0.25,
        items: [
          "Attendance (full days present ÷ scheduled days)",
          "Punctuality",
          "Compliance with supervisor instructions",
          "Professional conduct and respect",
          "Teamwork and cooperation",
        ],
      },
      {
        key: "B",
        title: "Compliance Discipline",
        weight: 0.25,
        items: [
          "Biosecurity compliance (100% required)",
          "PPE compliance (100% required)",
          "SOP compliance under supervision",
          "Hygiene and sanitation discipline",
          "Honest reporting and recording",
        ],
      },
      {
        key: "C",
        title: "Task Execution Under Supervision",
        weight: 0.3,
        items: [
          "Carries out assigned husbandry tasks correctly",
          "Feeding and watering routines",
          "Animal observation and prompt reporting of abnormalities",
          "Pen and section hygiene tasks",
          "Calm, correct animal handling",
          "Basic recordkeeping accuracy",
        ],
      },
      {
        key: "D",
        title: "Learning and Development",
        weight: 0.2,
        items: [
          "Speed and consistency of learning",
          "Willingness to be coached and corrected",
          "Section authorisations progressed in the quarter",
          "Skills-log items moved from Observed to Performed Under Supervision",
          "Skills-log items moved from Performed Under Supervision to Performed Consistently to Standard",
        ],
      },
    ],
    annual: [
      {
        key: "A",
        title: "Attendance, Conduct, and Reliability (Full Year)",
        weight: 0.2,
        items: [
          "Attendance (full days present ÷ scheduled days, year)",
          "Punctuality (year)",
          "Compliance with supervisor instructions (year)",
          "Professional conduct and respect (year)",
          "Teamwork and cooperation (year)",
          "Reliability and dependability (year)",
        ],
      },
      {
        key: "B",
        title: "Compliance Discipline (Year)",
        weight: 0.2,
        items: [
          "Biosecurity compliance: 100% required (year)",
          "PPE compliance: 100% required (year)",
          "SOP compliance under supervision (year)",
          "Hygiene and sanitation discipline (year)",
          "Honest reporting and recording (year)",
          "Number of disciplinary or compliance incidents during the year (target: zero)",
        ],
      },
      {
        key: "C",
        title: "Task Execution Under Supervision (Year)",
        weight: 0.3,
        items: [
          "Husbandry task execution quality (year average)",
          "Animal observation and abnormality escalation (year)",
          "Daily barn cleaning and sanitation discipline (year)",
          "Grower-finisher husbandry support (year)",
          "Feed preparation support (current phase only) (year)",
          "Basic recordkeeping accuracy (year)",
          "Calm and correct animal handling (year)",
        ],
      },
      {
        key: "D",
        title: "Year's Learning, Skills, and Section Authorisations",
        weight: 0.2,
        items: [
          "Speed and consistency of learning across the year",
          "Section authorisations added in the year (list each)",
          "Skills-log items moved from Observed to Performed Under Supervision",
          "Skills-log items moved from Performed Under Supervision to Performed Consistently to Standard",
          "Internal training completed in the year",
          "Coaching responsiveness and improvement following feedback",
        ],
      },
      {
        key: "E",
        title: "Year-End KPI Summary",
        weight: 0.1,
        items: [
          "Year-end KPI performance vs starting target in force at year-end (overall)",
          "Quarter-on-quarter trend (improving / stable / declining)",
          "Most impactful KPI contribution by this employee",
          "KPI shortfalls — root cause and corrective actions taken",
          "Mid-year target revisions (if any) and reason",
        ],
      },
    ],
  },
  L2_L3: {
    quarterly: [
      {
        key: "A",
        title: "Attendance and Conduct",
        weight: 0.15,
        items: [
          "Attendance and punctuality",
          "Professional conduct and respect",
          "Teamwork and reliability",
          "Discipline and dependability",
        ],
      },
      {
        key: "B",
        title: "Compliance and Standards",
        weight: 0.2,
        items: [
          "Biosecurity compliance (100% required)",
          "Tier-discipline compliance (100% required)",
          "PPE compliance (100% required)",
          "SOP compliance (independent within scope)",
          "Hygiene and sanitation enforcement",
          "Escalation of non-compliance observed in others (L3)",
        ],
      },
      {
        key: "C",
        title: "Routine Technical Execution",
        weight: 0.25,
        items: [
          "Routine section tasks executed accurately and on time",
          "Animal observation and abnormality detection (early and accurate)",
          "Feeding, watering, movement, and daily care discipline",
          "Section-specific competence in authorised sections",
          "Recordkeeping accuracy and timeliness (target ≥ 98%)",
        ],
      },
      {
        key: "D",
        title: "AI Competence (where authorised)",
        weight: 0.2,
        items: [
          "Heat detection accuracy and reliability",
          "AI procedure execution within authorised scope (L2)",
          "Lead AI Operator quality and consistency (L3)",
          "AI recordkeeping completeness and accuracy",
          "Hygiene and timing discipline in AI routines",
        ],
      },
      {
        key: "E",
        title: "Coaching and Floor Coordination (L3 only)",
        weight: 0.1,
        items: [
          "Coaching of L1 and L2 staff in daily routines",
          "Daily floor coordination and workflow continuity",
          "Follow-up on task completion by junior staff",
          "First-line review of section records and checklists",
          "Reinforcement of section discipline and standards",
        ],
      },
      {
        key: "F",
        title: "Section Reproductive KPI Contribution (L3)",
        weight: 0.1,
        items: [
          "Contribution to farrowing rate, conception rate, returns rate",
          "Contribution to total born / born alive / pre-wean mortality (where applicable)",
          "Contribution to semen-quality or boar-performance KPIs (where applicable)",
          "Quality of abnormality detection that supports KPI outcomes",
        ],
      },
    ],
    annual: [
      {
        key: "A",
        title: "Attendance, Conduct, and Reliability (Year)",
        weight: 0.15,
        items: [
          "Attendance and punctuality (year)",
          "Professional conduct and respect (year)",
          "Teamwork and reliability (year)",
          "Discipline and dependability (year)",
        ],
      },
      {
        key: "B",
        title: "Compliance and Standards (Year)",
        weight: 0.2,
        items: [
          "Biosecurity compliance: 100% (year)",
          "Tier-discipline compliance: 100% (year)",
          "PPE compliance: 100% (year)",
          "SOP compliance — independent execution within scope (year)",
          "Number of disciplinary or compliance incidents (target: zero)",
        ],
      },
      {
        key: "C",
        title: "Routine and Advanced Technical Execution (Year)",
        weight: 0.25,
        items: [
          "Routine section tasks executed accurately and on time (year)",
          "Animal observation and abnormality detection (year)",
          "Recordkeeping accuracy and timeliness ≥ 98% (year)",
          "Section-specific technical competence across authorised sections (year)",
        ],
      },
      {
        key: "D",
        title: "AI Competence (Year, where authorised)",
        weight: 0.2,
        items: [
          "Heat detection accuracy and reliability (year)",
          "AI procedure execution quality within scope (year)",
          "AI recordkeeping completeness (year)",
          "Lead AI Operator quality (L3, year)",
        ],
      },
      {
        key: "E",
        title: "Coaching and Floor Coordination (L3, Year)",
        weight: 0.1,
        items: [
          "Coaching of L1 and L2 staff across the year",
          "First-line checking and records review quality (year)",
          "Floor coordination and workflow continuity (year)",
        ],
      },
      {
        key: "F",
        title: "Section Reproductive KPI Contribution (Year)",
        weight: 0.1,
        items: [
          "Section KPI contribution vs target (year-end)",
          "Quarter-on-quarter KPI trend",
          "Most impactful contribution to section KPIs",
          "KPI shortfalls — root cause and corrective actions",
        ],
      },
    ],
  },
  L4: {
    quarterly: [
      {
        key: "A",
        title: "Attendance, Conduct, and Leadership Presence",
        weight: 0.15,
        items: [
          "Attendance and punctuality (sets the standard for the section)",
          "Calm and consistent authority on the floor",
          "Professional conduct under pressure",
          "Fair and firm staff discipline",
        ],
      },
      {
        key: "B",
        title: "Operational Control and Work Planning",
        weight: 0.2,
        items: [
          "Daily work planning and task allocation discipline",
          "Sequencing of activities to section priorities and reproductive cycle",
          "Critical routines covered and completed to standard",
          "Adjustment of staffing and priorities to operational needs",
          "Continuity of section operation across leave and absence",
        ],
      },
      {
        key: "C",
        title: "People Supervision and Coaching",
        weight: 0.2,
        items: [
          "Supervision of L1–L3 staff (attendance, conduct, compliance)",
          "Coaching effectiveness with Senior Swine Technicians",
          "Identification and development of high-potential staff",
          "Prompt correction of non-compliance and poor execution",
          "Quality of induction and probation support for new hires",
        ],
      },
      {
        key: "D",
        title: "KPI Delivery",
        weight: 0.25,
        items: [
          "Section reproductive KPIs vs target (farrowing rate, conception, returns, born alive, pre-wean mortality)",
          "Section operational KPIs vs target (AI quality, semen quality, gilt pool, etc.)",
          "Grower-finisher KPIs vs target (ADG, FCR, mortality, dispatch-weight compliance)",
          "Investigation and corrective action on KPI deviations",
          "Quality of weekly KPI reporting upward",
        ],
      },
      {
        key: "E",
        title: "Compliance Enforcement and Records Verification",
        weight: 0.1,
        items: [
          "Section biosecurity and tier-discipline compliance (100% target)",
          "PPE and SOP enforcement",
          "Verification of section records, checklists, and reports",
          "Identification and resolution of missing or inaccurate records",
          "Audit-readiness of the section",
        ],
      },
      {
        key: "F",
        title: "Escalation, Reporting, and Resource Use",
        weight: 0.1,
        items: [
          "Timeliness and quality of issue escalation to Assistant Farm Manager / Farm Manager / Veterinarian",
          "Quality of management reporting (weekly / monthly)",
          "Resource use discipline (labour, supplies, equipment)",
          "Communication with the Veterinarian and Data Analyst",
        ],
      },
    ],
    annual: [
      {
        key: "A",
        title: "Leadership Presence and Conduct (Year)",
        weight: 0.15,
        items: [
          "Attendance and punctuality (year; sets the standard for the section)",
          "Calm and consistent authority on the floor (year)",
          "Professional conduct under pressure (year)",
          "Fair and firm staff discipline (year)",
          "Modelling of biosecurity, tier-discipline, welfare, and records standards (year)",
        ],
      },
      {
        key: "B",
        title: "Operational Control and Work Planning (Year)",
        weight: 0.2,
        items: [
          "Daily work planning and task allocation discipline (year average)",
          "Sequencing of activities to section priorities and reproductive cycle (year)",
          "Critical routines covered and completed to standard (year)",
          "Continuity of section operation across leave and absence (year)",
          "Quality of operational planning for each quarter (year)",
        ],
      },
      {
        key: "C",
        title: "People Supervision, Development, and Succession (Year)",
        weight: 0.2,
        items: [
          "Supervision of L1–L3 staff — attendance, conduct, compliance (year)",
          "Coaching effectiveness with Senior Swine Technicians (year)",
          "Identification and development of high-potential staff (year)",
          "Probation reviews completed for new hires (year)",
          "Promotions supported and progressed during the year",
          "Quality of induction and ongoing development for the team",
        ],
      },
      {
        key: "D",
        title: "KPI Delivery — Year-End vs Targets",
        weight: 0.25,
        items: [
          "Breeding KPI Library — year-end performance vs starting target in force at year-end",
          "Grower-Finisher KPI Library — year-end performance vs starting target in force at year-end",
          "Feed Production KPIs (current phase only) — year-end performance",
          "Investigation and corrective action on KPI deviations during the year",
          "Quality of weekly and quarterly KPI reporting upward",
        ],
      },
      {
        key: "E",
        title: "Compliance Enforcement and Records Verification (Year)",
        weight: 0.1,
        items: [
          "Section biosecurity and tier-discipline compliance: 100% target (year)",
          "PPE and SOP enforcement (year)",
          "Verification of section records, checklists, and reports (year)",
          "Audit-readiness of the section (year)",
          "Number of compliance incidents / breaches in the year (target: zero)",
        ],
      },
      {
        key: "F",
        title: "Escalation, Reporting, and Resource Use (Year)",
        weight: 0.1,
        items: [
          "Timeliness and quality of issue escalation to Assistant Farm Manager / Farm Manager / Veterinarian (year)",
          "Quality of management reporting (quarterly, year-end)",
          "Resource use discipline (labour, supplies, equipment) (year)",
          "Communication with the Veterinarian and Data Analyst (year)",
        ],
      },
    ],
  },
  L5_L6_L7: {
    quarterly: [
      {
        key: "A",
        title: "Leadership Behaviours",
        weight: 0.2,
        items: [
          "Visible leadership presence and authority",
          "Consistency, fairness, and integrity in decision-making",
          "Calm decision-making under operational pressure",
          "Modelling of standards (biosecurity, tier-discipline, welfare, records)",
        ],
      },
      {
        key: "B",
        title: "Operational and KPI Delivery",
        weight: 0.25,
        items: [
          "Multi-section / farm-wide / enterprise-wide KPI delivery against agreed targets",
          "Breeding KPI Library and Grower-Finisher KPI Library performance under your remit",
          "Stability of operations across the area of responsibility",
          "Productivity and continuous-improvement actions taken in the quarter",
          "Quality of root-cause analysis on operational issues",
        ],
      },
      {
        key: "C",
        title: "People Development and Succession",
        weight: 0.2,
        items: [
          "Development of L4 supervisors and below",
          "Talent identification and individual learning plan ownership",
          "Succession depth for key roles in the area of responsibility",
          "Promotion-pipeline progress in the quarter",
          "Quality of probation reviews completed for the area",
        ],
      },
      {
        key: "D",
        title: "Planning, Budget, and Resource Control",
        weight: 0.15,
        items: [
          "Planning of labour, equipment, supplies, and operating resources",
          "Resource use vs approved budget",
          "Capital project progress (where applicable)",
          "Quality of operational planning for the next period",
        ],
      },
      {
        key: "E",
        title: "Reporting and Governance",
        weight: 0.1,
        items: [
          "Quality and timeliness of management reporting",
          "Compliance and biosecurity governance",
          "Audit readiness across the area of responsibility",
          "Documentation and decision traceability",
        ],
      },
      {
        key: "F",
        title: "Stakeholder and External Relationships",
        weight: 0.1,
        items: [
          "Customer relationships and PS/F1 customer satisfaction",
          "Veterinary, regulatory, and supplier relationships",
          "Internal cross-functional working (HR, Finance, Executive)",
          "(L7) Strategic contribution and enterprise leadership",
        ],
      },
    ],
    annual: [
      {
        key: "A",
        title: "Leadership Behaviours (Year)",
        weight: 0.2,
        items: [
          "Visible leadership presence and authority (year)",
          "Consistency, fairness, and integrity in decision-making (year)",
          "Calm decision-making under operational pressure (year)",
          "Modelling of standards (biosecurity, tier-discipline, welfare, records) (year)",
          "Contribution to organisational culture and engagement (year)",
        ],
      },
      {
        key: "B",
        title: "Operational and KPI Delivery — Year-End vs Targets",
        weight: 0.25,
        items: [
          "Multi-section / farm / enterprise-wide KPI delivery against agreed targets (year-end)",
          "Breeding KPI Library and Grower-Finisher KPI Library performance under your remit (year-end)",
          "Stability of operations across the area of responsibility (year)",
          "Productivity and continuous-improvement actions taken during the year",
          "Quality of root-cause analysis on operational issues during the year",
        ],
      },
      {
        key: "C",
        title: "People Development and Succession (Year)",
        weight: 0.2,
        items: [
          "Development of L4 supervisors and below (year)",
          "Talent identification and Individual Learning Plan ownership (year)",
          "Succession depth for key roles in the area of responsibility (year-end)",
          "Promotion-pipeline progress during the year",
          "Quality of probation reviews completed for the area (year)",
          "Engagement and retention outcomes (year)",
        ],
      },
      {
        key: "D",
        title: "Planning, Budget, and Resource Control (Year)",
        weight: 0.15,
        items: [
          "Planning of labour, equipment, supplies, and operating resources (year)",
          "Resource use vs approved budget (year-end variance)",
          "Capital project progress (year, where applicable)",
          "Quality of operational planning for the coming year",
          "Performance against agreed business targets (year-end)",
        ],
      },
      {
        key: "E",
        title: "Reporting and Governance (Year)",
        weight: 0.1,
        items: [
          "Quality and timeliness of management reporting (year)",
          "Compliance and biosecurity governance (year)",
          "Audit readiness across the area of responsibility (year)",
          "Documentation and decision traceability (year)",
          "Risk-management actions taken during the year",
        ],
      },
      {
        key: "F",
        title: "Stakeholder and External Relationships (Year)",
        weight: 0.1,
        items: [
          "Customer relationships and PS/F1 customer satisfaction (year-end)",
          "Veterinary, regulatory, and supplier relationships (year)",
          "Internal cross-functional working (HR, Finance, Executive) (year)",
          "(L7) Strategic contribution and enterprise leadership (year)",
          "(L7) External-market and industry positioning (year)",
        ],
      },
    ],
  },
};

const GRADE_OPTIONS = [
  { value: "L1", label: "L1 — Junior Swine Technician" },
  {
    value: "L2_L3",
    label: "L2 / L3 — Swine Technician / Senior Swine Technician",
  },
  { value: "L4", label: "L4 — Herd Supervisor" },
  { value: "L5_L6_L7", label: "L5 / L6 / L7 — Management" },
];

const GRADE_BAND_COVERS: Record<string, string[]> = {
  L1: ["L1"],
  L2_L3: ["L2", "L3"],
  L4: ["L4"],
  L5_L6_L7: ["L5", "L6", "L7"],
};

function availableGradeBands(raterGrade: string | null | undefined) {
  if (!canAppraiseOthers(raterGrade)) {
    return GRADE_OPTIONS.filter((o) => o.value === "L1");
  }
  return GRADE_OPTIONS.filter((opt) => {
    const grades = GRADE_BAND_COVERS[opt.value] ?? [];
    return grades.some((g) => canRate(raterGrade, g));
  });
}

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
const PROMOTION_OPTIONS = [
  { value: "not_yet_ready", label: "Not yet ready" },
  { value: "developing", label: "Developing toward next level" },
  { value: "nearly_ready", label: "Nearly ready" },
  { value: "ready_for_assessment", label: "Ready for promotion assessment" },
  {
    value: "ready_for_expanded_responsibility",
    label: "Ready for expanded responsibility but not yet formal promotion",
  },
];

// ─── Weighted score ───────────────────────────────────────────────────────────
function computeWeightedScore(
  ratings: Ratings,
  sections: { key: string; weight: number; items: string[] }[],
) {
  let weightedScore = 0;
  let totalWeight = 0;
  let totalItems = 0;
  let ratedItems = 0;
  const sectionAverages: Record<string, number | null> = {};

  for (const section of sections) {
    const sectionRatings = ratings[section.key] ?? {};
    const vals = section.items
      .map((item) => sectionRatings[item]?.rating)
      .filter((r): r is RatingValue => r != null);
    totalItems += section.items.length;
    ratedItems += vals.length;
    if (vals.length > 0) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      sectionAverages[section.key] = avg;
      weightedScore += section.weight * avg;
      totalWeight += section.weight;
    } else {
      sectionAverages[section.key] = null;
    }
  }

  return {
    weightedScore:
      totalWeight > 0
        ? Math.round((weightedScore / totalWeight) * 100) / 100
        : null,
    sectionAverages,
    completionPct:
      totalItems > 0 ? Math.round((ratedItems / totalItems) * 100) : 0,
  };
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

// ─── Rating Selector ──────────────────────────────────────────────────────────
function RatingSelector({
  value,
  onChange,
}: {
  value: RatingValue | null;
  onChange: (v: RatingValue) => void;
}) {
  return (
    <div className="flex gap-1">
      {([1, 2, 3, 4, 5] as RatingValue[]).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          title={RATING_LABELS[n]}
          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all border-2 ${
            value === n
              ? `${RATING_COLORS[n]} text-white border-transparent shadow-sm`
              : "bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ─── Live Score Banner ────────────────────────────────────────────────────────
function WeightedScoreBanner({
  weightedScore,
  completionPct,
}: {
  weightedScore: number | null;
  completionPct: number;
}) {
  const label =
    weightedScore === null
      ? "—"
      : weightedScore >= 4.5
        ? "Excellent"
        : weightedScore >= 3.5
          ? "Above Expectation"
          : weightedScore >= 2.5
            ? "Meets Expectation"
            : weightedScore >= 1.5
              ? "Below Expectation"
              : "Unsatisfactory";
  return (
    <div className="sticky top-4 z-10 bg-[#1e3a5f] text-white rounded-2xl px-5 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-3">
        <TrendingUp className="w-4 h-4 text-white/60" />
        <span className="text-xs font-semibold text-white/60 uppercase tracking-wide">
          Live Weighted Score
        </span>
      </div>
      <div className="flex items-center gap-5">
        <div className="text-right">
          <span className="text-2xl font-black text-white">
            {weightedScore !== null ? weightedScore.toFixed(2) : "—"}
          </span>
          <span className="text-white/40 text-xs ml-1">/ 5</span>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xs text-white/50">{label}</p>
          <p className="text-xs text-white/30">{completionPct}% complete</p>
        </div>
        <div className="w-20 h-1.5 bg-white/20 rounded-full overflow-hidden hidden sm:block">
          <div
            className="h-full bg-white/70 rounded-full transition-all"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Section Block ────────────────────────────────────────────────────────────
function SectionBlock({
  section,
  sectionAvg,
  ratings,
  onRatingChange,
  onCommentChange,
}: {
  section: { key: string; title: string; weight: number; items: string[] };
  sectionAvg: number | null;
  ratings: SectionRatings;
  onRatingChange: (item: string, rating: RatingValue) => void;
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
          {sectionAvg !== null && (
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
              Avg: {sectionAvg.toFixed(1)}
            </span>
          )}
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
                className="grid grid-cols-[1fr_auto_240px] gap-3 items-center px-4 py-3 hover:bg-gray-50 transition-colors"
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

// ─── Main Form ────────────────────────────────────────────────────────────────
interface AppraisalFormProps {
  cycle: Cycle;
  /** grade_level of the person currently logged in, e.g. "L4".
   *  Supervisor mode is derived from this: L3+ = supervisor. */
  viewerGradeLevel?: string | null;
  /** If set, the form is in "second-party fill" mode:
   *  it fetches this appraisal, pre-fills read-only fields,
   *  and PATCHes on submit instead of POSTing. */
  existingAppraisalId?: string | null;
  onSuccess?: () => void;
}

export default function AppraisalForm({
  cycle,
  viewerGradeLevel = null,
  existingAppraisalId = null,
  onSuccess,
}: AppraisalFormProps) {
  // ── Derive supervisor mode from grade, not role ──
  const supervisorMode = isSupervisorGrade(viewerGradeLevel);

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
  // If an existing appraisal is loaded, the current viewer is filling second.
  const isFillingSecond = !!existingAppraisalId && !!existingAppraisal;

  // ── Local state ──
  const [gradeBand, setGradeBand] = useState<string>("L1");
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [ratings, setRatings] = useState<Ratings>({});
  const [promotionReadiness, setPromotionReadiness] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [reviewDate, setReviewDate] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: {
      section_authorisations_held: "",
      immediate_supervisor: "",
      review_quarter: "",
      review_year: new Date().getFullYear(),
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
  const allUsers = usersData ?? [];

  // ── Current viewer profile ──
  const currentUserProfile = useMemo(
    () => allUsers.find((u) => u.user_id === userId),
    [allUsers, userId],
  );
  const currentUserGrade = currentUserProfile?.grade_level ?? null;

  // canSelectForOthers: supervisor filling fresh (no existing appraisal)
  const canSelectForOthers = supervisorMode && !isFillingSecond;
  const selfAppraisalMode = !supervisorMode && !isFillingSecond;

  const allowedGradeBands = useMemo(
    () => availableGradeBands(currentUserGrade),
    [currentUserGrade],
  );

  // ── Pre-fill from existing appraisal when filling second ──
  useEffect(() => {
    if (!existingAppraisal) return;

    // Set grade band from existing record
    setGradeBand(existingAppraisal.grade_band);

    // Pre-fill form fields from the existing record (read-only ones)
    setValue(
      "immediate_supervisor",
      existingAppraisal.immediate_supervisor ?? "",
    );
    setValue(
      "section_authorisations_held",
      existingAppraisal.section_authorisations_held ?? "",
    );
    setValue("review_quarter", existingAppraisal.review_quarter ?? "");
    setValue("review_year", existingAppraisal.review_year);
    setValue("reviewing_manager", existingAppraisal.reviewing_manager ?? "");
    setValue("period_covered", existingAppraisal.period_covered ?? "");

    // Find the employee in the users list by company_id and set them as selected
    const emp = allUsers.find(
      (u) => u.company_id === existingAppraisal.company_id,
    );
    if (emp) setSelectedEmployee(emp);
  }, [existingAppraisal, allUsers, setValue]);

  // ── Filter employees for fresh supervisor fill ──
  const filteredEmployees = useMemo(() => {
    if (isFillingSecond) return []; // no selection needed when filling second
    const gradeBandGrades = GRADE_BAND_COVERS[gradeBand] ?? [];
    return allUsers.filter((u) => {
      if (!u.grade_level || !gradeBandGrades.includes(u.grade_level))
        return false;
      if (selfAppraisalMode) return u.user_id === userId;
      if (u.user_id === userId) return false;
      return canRate(currentUserGrade, u.grade_level);
    });
  }, [
    allUsers,
    gradeBand,
    userId,
    currentUserGrade,
    selfAppraisalMode,
    isFillingSecond,
  ]);

  const sections = SECTIONS_MAP[gradeBand]?.[cycle] ?? [];

  // Keep grade band within allowed range (only applies to fresh fills)
  useEffect(() => {
    if (isFillingSecond) return;
    if (
      allowedGradeBands.length > 0 &&
      !allowedGradeBands.some((b) => b.value === gradeBand)
    ) {
      setGradeBand(allowedGradeBands[0].value);
    }
  }, [allowedGradeBands, gradeBand, isFillingSecond]);

  // Self-appraisal: auto-select self on load
  useEffect(() => {
    if (selfAppraisalMode && currentUserProfile) {
      setSelectedEmployee(currentUserProfile);
      setGradeBand("L1");
    }
  }, [selfAppraisalMode, currentUserProfile]);

  // Reset ratings and employee when grade band or cycle changes (fresh fill only)
  useEffect(() => {
    if (isFillingSecond) return;
    setRatings({});
    if (selfAppraisalMode && currentUserProfile) {
      setSelectedEmployee(currentUserProfile);
    } else if (!isFillingSecond) {
      setSelectedEmployee(null);
    }
  }, [gradeBand, cycle]);

  // ── Live score ──
  const { weightedScore, sectionAverages, completionPct } = useMemo(
    () => computeWeightedScore(ratings, sections),
    [ratings, sections],
  );

  const handleRatingChange = (
    sectionKey: string,
    item: string,
    rating: RatingValue,
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

    if (!promotionReadiness) {
      errs.promotionReadiness = "Please select a promotion readiness status";
      toast.error("Please select a promotion readiness status");
    }

    if (supervisorMode && !reviewDate) {
      errs.reviewDate = "Please schedule a final review date";
      toast.error("Please schedule a final review date");
    }

    let missingRatings = false;
    for (const section of sections) {
      for (const item of section.items) {
        if (!ratings[section.key]?.[item]?.rating) {
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
        // Second party always PATCHes
        const res = await api.patch(
          `/appraisal/${existingAppraisalId}`,
          payload,
        );
        return res.data;
      }
      // First party always POSTs
      const res = await api.post("/appraisal/upload_appraisal", payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success(
        supervisorMode
          ? `Supervisor review submitted. Review date scheduled for ${reviewDate}.`
          : "Self-appraisal submitted successfully!",
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

    mutate({
      company_id: selectedEmployee!.company_id,
      employee_name: `${selectedEmployee!.first_name} ${selectedEmployee!.last_name}`,
      job_title: selectedEmployee!.job_position ?? "",
      current_grade: selectedEmployee!.grade_level ?? gradeBand,
      section_authorisations_held: formData.section_authorisations_held || null,
      immediate_supervisor: formData.immediate_supervisor,
      cycle,
      grade_band: gradeBand,
      review_quarter: cycle === "quarterly" ? formData.review_quarter : null,
      review_year: Number(formData.review_year),
      reviewing_manager: formData.reviewing_manager || null,
      period_covered: formData.period_covered || null,
      ...(supervisorMode
        ? {
            supervisor_ratings: ratings,
            supervisor_weighted_score: weightedScore,
            final_review_date: reviewDate,
          }
        : {
            employee_ratings: ratings,
            employee_weighted_score: weightedScore,
          }),
      submitted_by: supervisorMode ? "supervisor" : "employee",
      promotion_readiness: promotionReadiness,
      strengths_observed: formData.strengths_observed || null,
      improvement_areas: formData.improvement_areas || null,
      agreed_actions: formData.agreed_actions || null,
      employee_comments: formData.employee_comments || null,
      most_significant_achievement:
        formData.most_significant_achievement || null,
      development_plan_next_year: formData.development_plan_next_year || null,
      promotion_readiness_assessment:
        formData.promotion_readiness_assessment || null,
      compensation_review_input: formData.compensation_review_input || null,
    });
  };

  // ── Grade warning ──
  const gradeWarning =
    currentUserGrade === null
      ? selfAppraisalMode
        ? "Your grade level is not set in your profile. Please contact HR."
        : "Your grade level is not set in your profile. Please contact HR to set your grade before rating employees."
      : null;

  if (loadingExisting) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading appraisal...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 px-5 py-5">
      {/* ── Mode Banner ── */}
      <div
        className={`rounded-xl px-4 py-3 flex items-center gap-2 text-sm font-medium ${
          supervisorMode || canSelectForOthers
            ? "bg-blue-50 border border-blue-200 text-blue-700"
            : "bg-amber-50 border border-amber-200 text-amber-700"
        }`}
      >
        <Info className="w-4 h-4 flex-shrink-0" />
        {isFillingSecond
          ? supervisorMode
            ? "Completing your supervisor review. Employee details and review period are locked from the original submission."
            : "Completing your self-appraisal. Details from your supervisor's submission are pre-filled and locked."
          : supervisorMode
            ? `As grade ${viewerGradeLevel}, you are initiating a supervisor review. Select the employee below.`
            : canSelectForOthers
              ? `As ${currentUserGrade}, select a grade band and employee below your level to complete their appraisal.`
              : "Self-appraisal — complete your own review. Your ratings stay hidden from your supervisor until they submit theirs."}
      </div>

      {/* ── Grade warning ── */}
      {gradeWarning && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm bg-red-50 border border-red-200 text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {gradeWarning}
        </div>
      )}

      {/* ── Live Score Banner ── */}
      <WeightedScoreBanner
        weightedScore={weightedScore}
        completionPct={completionPct}
      />

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

        {/* Grade band + employee select — only shown when NOT filling second */}
        {!isFillingSecond && (
          <div
            className={`grid gap-4 mb-4 ${selfAppraisalMode ? "grid-cols-1" : "grid-cols-2"}`}
          >
            <div>
              <FieldLabel required>Grade Band</FieldLabel>
              {selfAppraisalMode ? (
                <p className="text-sm font-medium text-gray-800 py-2">
                  {GRADE_OPTIONS.find((o) => o.value === "L1")?.label}
                </p>
              ) : (
                <select
                  value={gradeBand}
                  onChange={(e) => setGradeBand(e.target.value)}
                  className={inputCls()}
                >
                  {allowedGradeBands.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {!selfAppraisalMode && (
              <div>
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
                      ? "No eligible employees in this grade"
                      : "Choose employee"}
                  </option>
                  {filteredEmployees.map((emp) => (
                    <option key={emp.company_id} value={emp.company_id}>
                      {emp.first_name} {emp.last_name} —{" "}
                      {emp.grade_level ?? "?"} ({emp.company_id})
                    </option>
                  ))}
                </select>
                {formErrors.employee && (
                  <p className="text-red-500 text-xs mt-1">
                    {formErrors.employee}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Employee info card — shown once selected or pre-filled */}
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

        {/* Section authorisations + Immediate supervisor */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Section Authorisations Held</FieldLabel>
            {isFillingSecond ? (
              <ReadOnlyField
                label=""
                value={existingAppraisal?.section_authorisations_held}
              />
            ) : (
              <input
                type="text"
                placeholder="e.g. Farrowing, Weaning, AI"
                {...register("section_authorisations_held")}
                className={inputCls()}
              />
            )}
          </div>
          <div>
            {/* Immediate supervisor:
                - Employee filling first → editable (they type their supervisor's name)
                - Supervisor filling first → editable (they type their own name)
                - Filling second → read-only from the existing record */}
            {isFillingSecond ? (
              <ReadOnlyField
                label="Immediate Supervisor"
                value={existingAppraisal?.immediate_supervisor}
              />
            ) : (
              <div>
                <FieldLabel required>Immediate Supervisor</FieldLabel>
                <input
                  type="text"
                  placeholder="Supervisor name"
                  {...register("immediate_supervisor", { required: true })}
                  className={inputCls(!!errors.immediate_supervisor)}
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
          /* Read-only review period when filling second */
          <div className="grid grid-cols-3 gap-4">
            {existingAppraisal?.cycle === "quarterly" && (
              <ReadOnlyField
                label="Quarter"
                value={existingAppraisal?.review_quarter}
              />
            )}
            <ReadOnlyField
              label="Year"
              value={String(existingAppraisal?.review_year ?? "")}
            />
            {existingAppraisal?.cycle === "annual" && (
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
          /* Editable review period when filling first */
          <div className="grid grid-cols-3 gap-4">
            {cycle === "quarterly" && (
              <div>
                <FieldLabel required>Quarter</FieldLabel>
                <select
                  {...register("review_quarter", {
                    required: cycle === "quarterly",
                  })}
                  className={inputCls(!!errors.review_quarter)}
                >
                  <option value="">Select quarter</option>
                  <option value="Q1">Q1</option>
                  <option value="Q2">Q2</option>
                  <option value="Q3">Q3</option>
                  <option value="Q4">Q4</option>
                </select>
              </div>
            )}
            <div>
              <FieldLabel required>Year</FieldLabel>
              <input
                type="number"
                min={2020}
                max={2100}
                {...register("review_year", { required: true })}
                className={inputCls(!!errors.review_year)}
              />
            </div>
            {cycle === "annual" && (
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

        {/* Final review date — supervisor only, always editable */}
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
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-red-500" />
            Performance Ratings
          </h3>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <span key={n} className="flex items-center gap-1">
                <span className={`w-3 h-3 rounded-sm ${RATING_COLORS[n]}`} />
                {n} – {RATING_LABELS[n]}
              </span>
            ))}
          </div>
        </div>

        {formErrors.ratings && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {formErrors.ratings}
          </div>
        )}

        {sections.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
            Select a grade band above to load the rating sections
          </div>
        )}

        {sections.map((section) => (
          <SectionBlock
            key={section.key}
            section={section}
            sectionAvg={sectionAverages[section.key] ?? null}
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

      {/* ── Promotion Readiness ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-1">
          Promotion Readiness Status
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Tick one option. If 'Ready for promotion assessment' is selected, the
          Promotion Assessment Form will be required.
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
        {promotionReadiness === "ready_for_assessment" && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <Award className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Promotion Assessment Required
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                This employee must be put through the formal Promotion
                Assessment Form.
              </p>
            </div>
          </div>
        )}
      </div>

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
                Agreed Actions for{" "}
                {cycle === "quarterly" ? "Next Quarter" : "Next Year"}
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
              <textarea
                rows={2}
                placeholder="Employee's own comments on the review..."
                {...register("employee_comments")}
                className={`${inputCls()} resize-none`}
              />
            </div>

            {cycle === "annual" && (
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
            if (isFillingSecond) return; // don't clear pre-filled data
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
                ? "Submit Supervisor Review"
                : "Submit Self-Appraisal"}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
