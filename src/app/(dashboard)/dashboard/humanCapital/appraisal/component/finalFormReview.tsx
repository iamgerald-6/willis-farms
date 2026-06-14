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

// ─── Types ────────────────────────────────────────────────────────────────────
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

interface Appraisal {
  id: string | number;
  employee_name: string;
  job_title: string;
  current_grade: string;
  grade_band: string;
  cycle: "quarterly" | "annual";
  review_quarter?: string | null;
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
}

// ─── Sections map (same as form — needed for weights) ─────────────────────────
const SECTIONS_MAP: Record<
  string,
  Record<
    "quarterly" | "annual",
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

// ─── Constants ────────────────────────────────────────────────────────────────
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

const RATING_TEXT: Record<number, string> = {
  1: "text-red-600",
  2: "text-orange-500",
  3: "text-amber-600",
  4: "text-green-600",
  5: "text-emerald-600",
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function computeWeightedScore(
  ratings: Ratings,
  sections: { key: string; weight: number; items: string[] }[],
): number | null {
  let weightedScore = 0;
  let totalWeight = 0;

  for (const section of sections) {
    const sectionRatings = ratings[section.key] ?? {};
    const vals = section.items
      .map((item) => sectionRatings[item]?.rating)
      .filter((r): r is RatingValue => r != null);
    if (vals.length > 0) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      weightedScore += section.weight * avg;
      totalWeight += section.weight;
    }
  }

  return totalWeight > 0
    ? Math.round((weightedScore / totalWeight) * 100) / 100
    : null;
}

function scoreBadge(score: number | null) {
  if (score === null) return "text-gray-400";
  if (score >= 4.5) return "text-emerald-600";
  if (score >= 3.5) return "text-green-600";
  if (score >= 2.5) return "text-amber-600";
  if (score >= 1.5) return "text-orange-500";
  return "text-red-600";
}

function diffIndicator(emp: RatingValue | null, sup: RatingValue | null) {
  if (!emp || !sup || emp === sup) return null;
  const diff = emp - sup;
  return diff > 0
    ? {
        label: `Employee rated ${Math.abs(diff)} higher`,
        color: "text-blue-500",
      }
    : {
        label: `Supervisor rated ${Math.abs(diff)} higher`,
        color: "text-purple-500",
      };
}

// ─── Rating Chip (read-only display) ─────────────────────────────────────────
function RatingChip({
  rating,
  label,
}: {
  rating: RatingValue | null;
  label: string;
}) {
  if (!rating) {
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
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${RATING_TEXT[rating]} bg-gray-50 border border-gray-100`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${RATING_COLORS[rating]}`} />
        {rating} · {RATING_LABELS[rating]}
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
  value: RatingValue | null;
  original: RatingValue | null;
  onChange: (v: RatingValue) => void;
}) {
  const changed = value !== original;
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
      <div className="flex gap-1">
        {([1, 2, 3, 4, 5] as RatingValue[]).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            title={RATING_LABELS[n]}
            className={`w-7 h-7 rounded-lg text-xs font-bold transition-all border-2 ${
              value === n
                ? `${RATING_COLORS[n]} text-white border-transparent shadow-sm`
                : "bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
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
  // Fetch the full appraisal

  const { data: appraisal, isLoading } = useQuery<Appraisal>({
    queryKey: ["appraisal", appraisalId],
    queryFn: async () => {
      const res = await api.get(`/appraisal/${appraisalId}`);
      return res.data.data;
    },
    enabled: !!appraisalId,
  });

  // Final ratings state — starts as a copy of supervisor_ratings
  const [finalRatings, setFinalRatings] = useState<Ratings | null>(null);
  const [discussionNotes, setDiscussionNotes] = useState("");
  const [notesError, setNotesError] = useState("");
  const [promotionReadiness, setPromotionReadiness] = useState(
    appraisal?.promotion_readiness ?? "",
  );

  // Initialise finalRatings once appraisal loads
  const initialised = finalRatings !== null;
  if (appraisal && !initialised) {
    // Deep copy supervisor ratings as the starting point
    setFinalRatings(
      JSON.parse(JSON.stringify(appraisal.supervisor_ratings ?? {})),
    );
  }

  const sections =
    SECTIONS_MAP[appraisal?.grade_band ?? "L1"]?.[
      appraisal?.cycle ?? "quarterly"
    ] ?? [];

  // Live recalculated supervisor weighted score from finalRatings
  const liveScore = useMemo(() => {
    if (!finalRatings) return null;
    return computeWeightedScore(finalRatings, sections);
  }, [finalRatings, sections]);

  const handleFinalRatingChange = (
    sectionKey: string,
    item: string,
    rating: RatingValue,
  ) => {
    setFinalRatings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [sectionKey]: {
          ...prev[sectionKey],
          [item]: {
            comment: prev[sectionKey]?.[item]?.comment ?? "",
            rating,
          },
        },
      };
    });
  };

  // Count how many ratings were changed from the original
  const changedCount = useMemo(() => {
    if (!finalRatings || !appraisal?.supervisor_ratings) return 0;
    let count = 0;
    for (const section of sections) {
      for (const item of section.items) {
        const original =
          appraisal.supervisor_ratings[section.key]?.[item]?.rating ?? null;
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
      toast.success("Final review submitted successfully.");
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.error ?? "Failed to submit final review.",
      );
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
      // Updated supervisor ratings (may have changed from discussion)
      supervisor_ratings: finalRatings,
      supervisor_weighted_score: liveScore,
      promotion_readiness: promotionReadiness,
      // Pass through required fields the PATCH route needs
      final_review_notes: discussionNotes,
      status: "final_reviewed",
      // Keep submitted_by as "both" — this is just a third pass
      submitted_by: "both",
    });
  };

  if (isLoading || !appraisal || !finalRatings) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading appraisal...</span>
      </div>
    );
  }

  const period =
    appraisal.cycle === "quarterly"
      ? `${appraisal.review_quarter ?? ""} ${appraisal.review_year}`
      : (appraisal.period_covered ?? String(appraisal.review_year));

  const originalSupScore = appraisal.supervisor_weighted_score;
  const scoreChanged = liveScore !== null && liveScore !== originalSupScore;

  return (
    <div className="space-y-5">
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
            <p className="text-white/60 text-sm mt-0.5">
              {appraisal.job_title}
            </p>
            <p className="text-white/40 text-xs mt-1">
              {period} · {appraisal.grade_band} · Supervisor:{" "}
              {appraisal.immediate_supervisor}
            </p>
          </div>

          {/* Score comparison */}
          <div className="flex gap-3 bg-white/10 rounded-xl p-3">
            <div className="text-center px-3">
              <p className="text-[10px] text-white/50 mb-1">Employee</p>
              <p
                className={`text-2xl font-black ${scoreBadge(appraisal.employee_weighted_score)}`}
              >
                {appraisal.employee_weighted_score?.toFixed(2) ?? "—"}
              </p>
              <p className="text-white/30 text-[10px]">/ 5</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center px-3">
              <p className="text-[10px] text-white/50 mb-1">Supervisor</p>
              <p
                className={`text-2xl font-black ${scoreBadge(originalSupScore)}`}
              >
                {originalSupScore?.toFixed(2) ?? "—"}
              </p>
              <p className="text-white/30 text-[10px]">/ 5</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center px-3">
              <p className="text-[10px] text-white/50 mb-1 flex items-center gap-1 justify-center">
                Final
                {scoreChanged && (
                  <span className="text-amber-300 text-[9px] font-bold">
                    REVISED
                  </span>
                )}
              </p>
              <p className={`text-2xl font-black ${scoreBadge(liveScore)}`}>
                {liveScore?.toFixed(2) ?? "—"}
              </p>
              <p className="text-white/30 text-[10px]">/ 5</p>
            </div>
          </div>
        </div>

        {/* Changes summary */}
        {changedCount > 0 && (
          <div className="mt-3 bg-amber-500/20 border border-amber-400/30 rounded-lg px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {changedCount} rating{changedCount > 1 ? "s" : ""} revised from
            original supervisor submission
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
          <span className={`text-2xl font-black ${scoreBadge(liveScore)}`}>
            {liveScore?.toFixed(2) ?? "—"}
          </span>
          <span className="text-white/30 text-xs">/ 5</span>
          {scoreChanged && (
            <span className="text-xs bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full">
              was {originalSupScore?.toFixed(2)}
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
            Revised ratings are highlighted in amber.
          </p>
        </div>
      </div>

      {/* ── Sections ── */}
      {sections.map((section) => {
        const empSec = appraisal.employee_ratings?.[section.key] ?? {};
        const supSec = appraisal.supervisor_ratings?.[section.key] ?? {};
        const finalSec = finalRatings[section.key] ?? {};

        return (
          <div
            key={section.key}
            className="border border-gray-200 rounded-xl overflow-hidden bg-white"
          >
            {/* Section header */}
            <div className="bg-[#1e3a5f] px-4 py-3 flex items-center justify-between">
              <span className="text-white text-sm font-semibold">
                {section.key}. {section.title}
              </span>
              <span className="text-xs bg-white/15 px-2 py-0.5 rounded-full text-white/70">
                Weight: {Math.round(section.weight * 100)}%
              </span>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_140px_140px_180px] gap-3 px-4 py-2 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <span>Review Area</span>
              <span className="text-center">Employee</span>
              <span className="text-center">Supervisor</span>
              <span className="text-center">Final (Editable)</span>
            </div>

            {/* Items */}
            <div className="divide-y divide-gray-100">
              {section.items.map((item) => {
                const empRating = (empSec[item]?.rating ??
                  null) as RatingValue | null;
                const supRating = (supSec[item]?.rating ??
                  null) as RatingValue | null;
                const finalRating = (finalSec[item]?.rating ??
                  null) as RatingValue | null;
                const diff = diffIndicator(empRating, supRating);
                const revised = finalRating !== supRating;

                return (
                  <div
                    key={item}
                    className={`grid grid-cols-[1fr_140px_140px_180px] gap-3 items-center px-4 py-3 transition-colors ${
                      revised ? "bg-amber-50/50" : "hover:bg-gray-50/40"
                    }`}
                  >
                    {/* Item label + diff indicator */}
                    <div>
                      <span className="text-sm text-gray-700 leading-snug block">
                        {item}
                      </span>
                      {diff && (
                        <span
                          className={`text-[10px] ${diff.color} mt-0.5 block`}
                        >
                          ↕ {diff.label}
                        </span>
                      )}
                    </div>

                    {/* Employee rating — always locked */}
                    <div className="flex justify-center">
                      <RatingChip rating={empRating} label="Employee" />
                    </div>

                    {/* Original supervisor rating — locked reference */}
                    <div className="flex justify-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                          Supervisor{" "}
                          <Lock className="w-2.5 h-2.5 text-gray-300" />
                        </span>
                        {supRating ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${RATING_TEXT[supRating]} bg-gray-50 border border-gray-100`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${RATING_COLORS[supRating]}`}
                            />
                            {supRating}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </div>
                    </div>

                    {/* Final rating — editable by supervisor */}
                    <div className="flex justify-center">
                      <FinalRatingSelector
                        value={finalRating}
                        original={supRating}
                        onChange={(v) =>
                          handleFinalRatingChange(section.key, item, v)
                        }
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
        <h3 className="text-sm font-bold text-gray-800 mb-1">
          Promotion Readiness Status
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Confirm or update the promotion readiness agreed in the meeting.
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
          placeholder="e.g. Employee and supervisor discussed the Punctuality rating. Employee acknowledged two late arrivals in Q1. Supervisor revised rating from 3 to 2 based on documented instances..."
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
