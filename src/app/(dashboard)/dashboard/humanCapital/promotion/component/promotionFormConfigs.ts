// Grade-specific promotion form configs — aligned to docs/Promotion Readiness *.docx

export type PromotionStep =
  | "L1_L2"
  | "L2_L3"
  | "L3_L4"
  | "L4_L5"
  | "L5_L6"
  | "L6_L7";

export type SkillSignoffStage = "observed" | "supervised" | "consistent" | "";

export interface InterviewQuestion {
  id: string;
  section: string;
  question: string;
  lookFor: string;
}

export interface PromotionFormConfig {
  step: PromotionStep;
  title: string;
  fromGrade: string;
  toGrade: string;
  fromTitle: string;
  toTitle: string;
  howToUse: string;
  eligibility: string[];
  disqualifyingFactors: string[];
  documentedEvidence: string[];
  skillsLogCompetencies: string[];
  interviewQuestions: InterviewQuestion[];
  weights: { sectionB: number; sectionC: number; sectionD: number };
  interpretation: string;
  signOffRoles: string[];
}

export interface PromotionFormData {
  disqualifying_factors?: Record<string, { present: "yes" | "no" | "" }>;
  documented_evidence?: Record<
    string,
    { rating: number | null; comment: string }
  >;
  skills_log_signoff?: Record<
    string,
    { stage: SkillSignoffStage; verifier: string; date: string }
  >;
  interview_responses?: Record<
    string,
    { rating: number | null; notes: string }
  >;
  readiness_summary?: {
    section_b_avg: number | null;
    section_c_score: number | null;
    section_d_avg: number | null;
    total_weighted: number | null;
  };
  development_plan?: {
    strengths: string;
    gaps: string;
    agreed_actions: string;
    next_review_date: string;
  };
  sign_offs?: Record<string, { name: string; date: string }>;
}

export const GRADE_ORDER = ["L1", "L2", "L3", "L4", "L5", "L6", "L7"] as const;

export const FINAL_DECISIONS = [
  { value: "promote", label: "Promote" },
  { value: "promote_with_conditions", label: "Promote with conditions" },
  {
    value: "defer_pending_skills",
    label: "Defer pending skills completion",
  },
  {
    value: "retain_with_improvement",
    label: "Retain in current role with improvement plan",
  },
  { value: "not_ready", label: "Not promotion-ready" },
] as const;

export const RATING_LABELS: Record<number, string> = {
  1: "Unsatisfactory",
  2: "Below Expectation",
  3: "Meets Expectation",
  4: "Above Expectation",
  5: "Excellent",
};

const STANDARD_DISQUALIFYING = [
  "Serious unresolved disciplinary action",
  "Any major biosecurity breach",
  "Any tier-rule breach involving GGP or GP animals, semen, or equipment",
  "Dishonesty in records",
  "Repeated non-compliance",
  "Poor conduct or persistent poor execution",
];

const BASE_ELIGIBILITY = [
  "Minimum expected time in current role completed",
  "Attendance record satisfactory (from appraisals)",
  "Conduct and discipline record satisfactory; no serious unresolved disciplinary issue",
  "No major biosecurity or tier-discipline breach on record",
  "All four Quarterly Performance Reviews of the year attached",
  "Annual Appraisal of the year attached",
];

function cleanGrade(grade: string): string {
  return grade.replace(/\/.*/, "").trim();
}

export function getPromotionStep(
  currentGrade: string,
): PromotionStep | null {
  const g = cleanGrade(currentGrade);
  const map: Record<string, PromotionStep> = {
    L1: "L1_L2",
    L2: "L2_L3",
    L3: "L3_L4",
    L4: "L4_L5",
    L5: "L5_L6",
    L6: "L6_L7",
  };
  return map[g] ?? null;
}

export function getProposedGrade(currentGrade: string): string | null {
  const g = cleanGrade(currentGrade);
  const idx = GRADE_ORDER.indexOf(g as (typeof GRADE_ORDER)[number]);
  if (idx === -1 || idx >= GRADE_ORDER.length - 1) return null;
  return GRADE_ORDER[idx + 1];
}

export function computeReadinessSummary(
  config: PromotionFormConfig,
  documentedEvidence: Record<string, { rating: number | null; comment: string }>,
  skillsLogSignoff: Record<
    string,
    { stage: SkillSignoffStage; verifier: string; date: string }
  >,
  interviewResponses: Record<string, { rating: number | null; notes: string }>,
) {
  const avg = (vals: (number | null | undefined)[]) => {
    const nums = vals.filter((v): v is number => typeof v === "number");
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  };

  const section_b_avg = avg(
    config.documentedEvidence.map((k) => documentedEvidence[k]?.rating),
  );

  const stages = config.skillsLogCompetencies.map(
    (k) => skillsLogSignoff[k]?.stage,
  );
  const consistentCount = stages.filter((s) => s === "consistent").length;
  const totalSkills = config.skillsLogCompetencies.length || 1;
  const section_c_score =
    consistentCount > 0
      ? 1 + (consistentCount / totalSkills) * 4
      : avg(
          stages.map((s) =>
            s === "consistent" ? 5 : s === "supervised" ? 3 : s === "observed" ? 2 : null,
          ),
        );

  const section_d_avg = avg(
    config.interviewQuestions.map((q) => interviewResponses[q.id]?.rating),
  );

  const w = config.weights;
  const parts = [
    section_b_avg != null ? section_b_avg * (w.sectionB / 100) : 0,
    section_c_score != null ? section_c_score * (w.sectionC / 100) : 0,
    section_d_avg != null ? section_d_avg * (w.sectionD / 100) : 0,
  ];
  const weightSum =
    (section_b_avg != null ? w.sectionB : 0) +
    (section_c_score != null ? w.sectionC : 0) +
    (section_d_avg != null ? w.sectionD : 0);

  const total_weighted =
    weightSum > 0
      ? (parts[0] + parts[1] + parts[2]) / (weightSum / 100)
      : null;

  return {
    section_b_avg,
    section_c_score,
    section_d_avg,
    total_weighted,
  };
}

export const PROMOTION_FORM_CONFIGS: Record<PromotionStep, PromotionFormConfig> =
  {
    L1_L2: {
      step: "L1_L2",
      title: "Junior Swine Technician (L1) → Swine Technician (L2)",
      fromGrade: "L1",
      toGrade: "L2",
      fromTitle: "Junior Swine Technician (L1)",
      toTitle: "Swine Technician (L2)",
      howToUse:
        "Assesses whether an L1 is ready to perform as an L2 — routine section work with limited supervision and, where trained, authorised AI execution. Complete Sections A and B from documented records, verify new-level competence through the skills log in Section C, and use the short interview in Section D only to test the step up to independent execution.",
      eligibility: [
        ...BASE_ELIGIBILITY,
        "Holds the L2 qualification: Diploma/HND in a relevant field, or documented equivalent experience per management discretion",
        'Skills log shows core L1 duties at "Performed Consistently to Standard"',
        "Record accuracy meets the ≥98% standard in current role",
        "Supervisor recommends the employee for review; business need / vacancy confirmed",
      ],
      disqualifyingFactors: STANDARD_DISQUALIFYING,
      documentedEvidence: [
        "Attendance and punctuality (four quarters + annual)",
        "Biosecurity and tier-discipline compliance record (100% expected)",
        "PPE and SOP compliance record",
        "Record accuracy / honesty (≥98% target) from L4 audits",
        "Task execution quality and abnormality-escalation timeliness",
        "Hygiene and sanitation performance",
        "Overall current-role appraisal trend across the year",
      ],
      skillsLogCompetencies: [
        "Runs routine section tasks with limited supervision",
        "Independent animal observation and accurate abnormality detection",
        "Heat detection to standard (AI-support and, where trained, AI execution)",
        "Authorised AI execution within scope (if AI-certified)",
        "Feed preparation to formulation under limited supervision",
        "Grower-finisher routine husbandry and growth-monitoring support",
        "Recordkeeping accuracy at ≥98%, captured at the moment of execution",
        "Early coaching / support to L1 colleagues",
      ],
      interviewQuestions: [
        {
          id: "l1_d1_q1",
          section: "D1. Readiness for Independent Execution",
          question:
            "Which tasks are you now confident to run without supervision, and where do you still want a second pair of eyes?",
          lookFor:
            "Honest self-assessment matching the skills log; confidence where earned, humility where not.",
        },
        {
          id: "l1_d1_q2",
          section: "D1. Readiness for Independent Execution",
          question:
            "As an L2 you'd set the standard for L1s working beside you. How would you handle an L1 doing a task wrong?",
          lookFor:
            "Corrects supportively, demonstrates, informs supervisor if needed; early coaching instinct.",
        },
        {
          id: "l1_d2_q3",
          section: "D2. Judgement and Boundaries",
          question:
            "At L2 you still cannot change feed, ration, or treatment on your own. Give an example where you correctly held that line.",
          lookFor:
            "Concrete instance of respecting authority limits; escalated rather than improvised.",
        },
        {
          id: "l1_d2_q4",
          section: "D2. Judgement and Boundaries",
          question:
            "What reproductive or health signals would you now escalate faster than you did as a new L1?",
          lookFor:
            "Sharper observation; specific signs; understands the higher expectation on an independent technician.",
        },
      ],
      weights: { sectionB: 45, sectionC: 35, sectionD: 20 },
      interpretation:
        "4.0+ — promote; 3.3–3.9 — promote with conditions; 2.8–3.2 — defer pending skills; below 2.8 — retain with improvement plan. Any Section A \"No\" or disqualifying factor overrides the score.",
      signOffRoles: [
        "Immediate Supervisor",
        "Reviewing Manager (Breeding Farm Manager)",
        "Veterinarian (AI authorisation confirmation, if applicable)",
        "Promotion Panel Decision",
      ],
    },

    L2_L3: {
      step: "L2_L3",
      title: "Swine Technician (L2) → Senior Swine Technician (L3)",
      fromGrade: "L2",
      toGrade: "L3",
      fromTitle: "Swine Technician (L2)",
      toTitle: "Senior Swine Technician (L3, Lead AI Operator)",
      howToUse:
        "Assesses whether an L2 is ready for L3 — advanced execution, Lead AI Operator, coach to juniors, daily floor coordinator, and first-line checker of L1/L2 records. Section C verifies Lead AI Operator quality, coaching, and record-review judgement.",
      eligibility: [
        ...BASE_ELIGIBILITY,
        "Holds the L2 qualification base (Diploma/HND)",
        "Internal Lead AI Operator certification achieved (or scheduled and near completion)",
        "Demonstrated coaching capability evidenced in appraisals",
        "Reproductive KPI contribution satisfactory in current role",
        "Supervisor recommends for review; business need / vacancy confirmed",
      ],
      disqualifyingFactors: STANDARD_DISQUALIFYING,
      documentedEvidence: [
        "Attendance, conduct, and reliability (four quarters + annual)",
        "Biosecurity and tier-discipline compliance (100% expected)",
        "AI execution quality and consistency (as authorised L2)",
        "Record accuracy and honesty (≥98%) from L4 audits",
        "Section reproductive-KPI contribution",
        "Coaching and support to juniors evidenced in appraisals",
        "Role-model conduct and floor presence",
      ],
      skillsLogCompetencies: [
        "Lead AI Operator quality and consistency (certified)",
        "Advanced technical execution to a high standard",
        "Coaching of L1/L2 staff with verified competence outcomes",
        "First-line end-of-shift record review (routes corrections to the capturer)",
        "Direct primary capture under L4 when L1/L2 absent (exception rule)",
        "Daily floor coordination and task follow-up",
        "Grower-finisher and feed-preparation lead duties",
        "Incoming-semen receiving checks to SOP",
      ],
      interviewQuestions: [
        {
          id: "l2_d1_q1",
          section: "D1. Lead AI and Technical Standard-Setting",
          question:
            "As Lead AI Operator, how would you lift the whole section's conception and farrowing rates, not just your own?",
          lookFor:
            "Sets technique standards, coaches, reviews data with L4/Vet. Section-level thinking.",
        },
        {
          id: "l2_d1_q2",
          section: "D1. Lead AI and Technical Standard-Setting",
          question:
            "How do you know your own AI technique is staying consistent, and what would make you re-check it?",
          lookFor: "Self-discipline, data awareness, seeks Vet input.",
        },
        {
          id: "l2_d2_q3",
          section: "D2. Coaching and Floor Coordination",
          question:
            "Walk us through how you'd bring a weak L1 up to standard on handling and observation.",
          lookFor:
            "Structured demonstrate-observe-correct-verify method; patience; verifies competence before sign-off.",
        },
        {
          id: "l2_d2_q4",
          section: "D2. Coaching and Floor Coordination",
          question:
            "You're coordinating the floor and two priorities clash during a farrowing peak. How do you sequence the day?",
          lookFor:
            "Priority by welfare and reproductive cycle; clear allocation; follows up; escalates delays.",
        },
        {
          id: "l2_d3_q5",
          section: "D3. Record-Checking Boundary",
          question:
            "At end of shift you find gaps and inconsistencies in L1/L2 captures. Exactly what do you do?",
          lookFor:
            "Has the ORIGINAL capturer correct them; e-signs as L3 verifier; escalates to L4 if uncorrected.",
        },
      ],
      weights: { sectionB: 40, sectionC: 35, sectionD: 25 },
      interpretation:
        "4.0+ — promote; 3.3–3.9 — promote with conditions or on confirmation of Lead AI certification; 2.8–3.2 — defer pending skills/certification; below 2.8 — retain with improvement plan.",
      signOffRoles: [
        "Immediate Supervisor",
        "Veterinarian (Lead AI Operator certification)",
        "Reviewing Manager (Breeding Farm Manager)",
        "Promotion Panel Decision",
      ],
    },

    L3_L4: {
      step: "L3_L4",
      title: "Senior Swine Technician (L3) → Herd Supervisor/Manager (L4)",
      fromGrade: "L3",
      toGrade: "L4",
      fromTitle: "Senior Swine Technician (L3)",
      toTitle: "Herd Supervisor/Manager (L4)",
      howToUse:
        "Assesses readiness for the first true management grade — operational control of the section. The L4 threshold requires a Bachelor's degree (or B.Tech) in a relevant field. This is the biggest single step on the ladder.",
      eligibility: [
        ...BASE_ELIGIBILITY,
        "Holds the L4 qualification gate: Bachelor's degree or B.Tech in a relevant field",
        "Reproductive-KPI contribution and record-review quality satisfactory as L3",
        "Demonstrated coaching and floor-coordination track record",
        "No conduct or integrity concerns that would undermine supervisory authority",
        "Supervisor recommends for review; L4 vacancy / business need confirmed",
      ],
      disqualifyingFactors: STANDARD_DISQUALIFYING,
      documentedEvidence: [
        "Attendance, conduct, reliability, and role-model consistency",
        "Biosecurity and tier-discipline enforcement record",
        "Lead AI quality and section reproductive-KPI contribution",
        "First-line record-review quality and audit support",
        "Coaching effectiveness and staff-development evidence",
        "Judgement and escalation quality in current role",
        "Overall annual appraisal trend and readiness rating",
      ],
      skillsLogCompetencies: [
        "Plans and allocates a full day's work across the section",
        "Formally supervises and disciplines L1–L3 staff fairly and firmly",
        "Owns reproductive KPIs against the Breeding KPI Library",
        "Owns grower-finisher KPIs (ADG, FCR, mortality, dispatch compliance)",
        "Conducts the weekly records audit against observed activity",
        "Verifies records and enforces the correction chain",
        "Enforces compliance, biosecurity, and tier-discipline as accountable owner",
        "Coordinates the operating area and handles operational escalation",
      ],
      interviewQuestions: [
        {
          id: "l3_d1_q1",
          section: "D1. Supervising Former Peers",
          question:
            "You'll now supervise people who were your peers yesterday. How do you make that transition work?",
          lookFor:
            "Sets clear expectations, stays fair and consistent, holds standards without arrogance.",
        },
        {
          id: "l3_d1_q2",
          section: "D1. Supervising Former Peers",
          question:
            "A friend on the team starts taking advantage of the relationship. What do you do?",
          lookFor:
            "Resets the boundary firmly and fairly; standards over friendship.",
        },
        {
          id: "l3_d2_q3",
          section: "D2. KPI Ownership and the Records Audit",
          question:
            "Farrowing rate in your section drops two batches running. As the KPI owner, how do you diagnose and act?",
          lookFor:
            "Structured root-cause across timing, AI, semen, health, condition; assigns actions with the Vet.",
        },
        {
          id: "l3_d2_q4",
          section: "D2. KPI Ownership and the Records Audit",
          question:
            "Walk us through how you'd run the weekly records audit and what you'd do when records don't match the floor.",
          lookFor:
            "Samples records against observed activity; routes corrections; escalates integrity issues.",
        },
        {
          id: "l3_d3_q5",
          section: "D3. Discipline and Decision-Making",
          question:
            "A technician is caught falsifying a cleaning record. How do you handle it?",
          lookFor:
            "Treats integrity breach seriously and fairly; documents; escalates.",
        },
        {
          id: "l3_d3_q6",
          section: "D3. Discipline and Decision-Making",
          question:
            "When do you decide yourself and when do you escalate to the Breeding Farm Manager or Vet?",
          lookFor:
            "Sound scope judgement; escalates health, welfare, biosecurity, and integrity promptly.",
        },
      ],
      weights: { sectionB: 35, sectionC: 30, sectionD: 35 },
      interpretation:
        "4.0+ — promote; 3.3–3.9 — promote with conditions; 2.8–3.2 — defer; below 2.8 — retain at L3. The Bachelor's/B.Tech gate and any integrity disqualifier override the score.",
      signOffRoles: [
        "Immediate Supervisor (current L4)",
        "Veterinarian",
        "Reviewing Manager (Breeding Farm Manager)",
        "Promotion Panel Decision (Operations/Production Manager)",
      ],
    },

    L4_L5: {
      step: "L4_L5",
      title: "Herd Supervisor/Manager (L4) → Assistant Farm Manager – Breeding (L5)",
      fromGrade: "L4",
      toGrade: "L5",
      fromTitle: "Herd Supervisor/Manager (L4)",
      toTitle: "Assistant Farm Manager – Breeding (L5)",
      howToUse:
        "Assesses readiness for L5 — second-line management: oversight of multiple breeding-side areas, staff deployment, inter-section coordination, and gilt-development pipeline oversight.",
      eligibility: [
        ...BASE_ELIGIBILITY,
        "Holds the Bachelor's degree qualification base (same as L4); PG Diploma/MSc an advantage",
        "Demonstrated section reproductive-KPI delivery as L4",
        "Evidence of coordinating beyond own section / covering wider operations",
        "Reporting quality and integrity satisfactory in current role",
        "Supervisor recommends for review; L5 vacancy / business need confirmed",
      ],
      disqualifyingFactors: [
        ...STANDARD_DISQUALIFYING.slice(0, 3),
        "Dishonesty in records or reporting",
        "Repeated non-compliance",
        "Poor conduct or persistent poor execution",
      ],
      documentedEvidence: [
        "Section KPI delivery against the Breeding KPI Library (year)",
        "People supervision, discipline, and staff-development outcomes",
        "Records verification, audit quality, and documentation integrity",
        "Reporting quality and integrity to management",
        "Compliance, biosecurity, and tier-discipline enforcement record",
        "Judgement and escalation quality under pressure",
        "Overall annual appraisal trend and readiness rating",
      ],
      skillsLogCompetencies: [
        "Coordinates multiple operational areas through L4 supervisors",
        "Deploys staff across sections to match reproductive-cycle peaks",
        "Oversees the gilt-development pipeline (selection to first service)",
        "Monitors gilt-pool adequacy against replacement targets",
        "Follows up performance across sections and closes issues",
        "Produces accurate management reporting with integrity",
        "Supports the Breeding Farm Manager without freelancing on policy",
        "Enforces compliance across areas not personally staffed",
      ],
      interviewQuestions: [
        {
          id: "l4_d1_q1",
          section: "D1. Multi-Section Coordination",
          question:
            "How do you keep several sections aligned when you no longer run any one of them day-to-day?",
          lookFor:
            "Coordinates through L4s, sets shared priorities, uses data and check-ins.",
        },
        {
          id: "l4_d1_q2",
          section: "D1. Multi-Section Coordination",
          question:
            "Two sections need the same limited staff on the same morning. How do you decide and communicate it?",
          lookFor:
            "Prioritises by welfare and reproductive criticality; explains the trade-off.",
        },
        {
          id: "l4_d2_q3",
          section: "D2. Gilt-Development Pipeline",
          question:
            "Walk us through overseeing the replacement-gilt pipeline from selection to first service.",
          lookFor:
            "Selection criteria, isolation/acclimatisation, health, heat/boar exposure; forecasts pool against targets.",
        },
        {
          id: "l4_d2_q4",
          section: "D2. Gilt-Development Pipeline",
          question:
            "What are the genetic and health risks of breeding our own replacements, and how do you govern them?",
          lookFor:
            "Tier-discipline, inbreeding/diversity, internal-flow biosecurity, selection rigour.",
        },
        {
          id: "l4_d3_q5",
          section: "D3. Reporting Integrity and Second-Line Judgement",
          question:
            "A shortfall must go into the weekly report to the Breeding Farm Manager and CEO. How do you present it?",
          lookFor:
            "Honest, with context and a corrective plan; does not hide or spin.",
        },
        {
          id: "l4_d3_q6",
          section: "D3. Reporting Integrity and Second-Line Judgement",
          question:
            "Where's the line between deciding yourself and escalating to the Breeding Farm Manager?",
          lookFor:
            "Escalates policy, budget, serious health/biosecurity, and integrity.",
        },
      ],
      weights: { sectionB: 35, sectionC: 30, sectionD: 35 },
      interpretation:
        "4.0+ — promote; 3.3–3.9 — promote with conditions; 2.8–3.2 — defer; below 2.8 — retain at L4. Any reporting-integrity concern is disqualifying.",
      signOffRoles: [
        "Immediate Supervisor (Breeding Farm Manager)",
        "Veterinarian",
        "Reviewing Manager (Operations/Production Manager)",
        "Promotion Panel Decision",
      ],
    },

    L5_L6: {
      step: "L5_L6",
      title: "Assistant Farm Manager – Breeding (L5) → Breeding Farm Manager (L6)",
      fromGrade: "L5",
      toGrade: "L6",
      fromTitle: "Assistant Farm Manager – Breeding (L5)",
      toTitle: "Breeding Farm Manager (L6)",
      howToUse:
        "Assesses readiness for full functional management of the multiplication farm as L6 — staffing, operational planning, reproductive-KPI delivery, genetic-tier integrity, and budget/resource control.",
      eligibility: [
        ...BASE_ELIGIBILITY,
        "Holds the Bachelor's base; PG Diploma in Management / MSc / MBA preferred",
        "Demonstrated multi-section performance stability and gilt-pool adequacy as L5",
        "Evidence of budget / resource awareness and management reporting quality",
        "Consistent management integrity; no reporting-integrity concerns",
        "Supervisor recommends for review; L6 vacancy / business need confirmed",
      ],
      disqualifyingFactors: [
        ...STANDARD_DISQUALIFYING.slice(0, 3),
        "Dishonesty in records or reporting",
        "Repeated non-compliance",
        "Poor conduct or persistent poor execution",
      ],
      documentedEvidence: [
        "Multi-section performance stability and issue-resolution quality (year)",
        "Gilt-pool adequacy and pipeline-oversight outcomes",
        "People-management maturity and staff-development results",
        "Management reporting quality and integrity",
        "Compliance, biosecurity, and tier-discipline control performance",
        "Budget / resource awareness demonstrated in role",
        "Overall annual appraisal trend and leadership readiness rating",
      ],
      skillsLogCompetencies: [
        "Runs the farm operating rhythm (daily control to annual plan)",
        "Owns and delivers reproductive KPIs across the whole farm",
        "Protects genetic-tier integrity, including internal replacement flow",
        "Manages budget and resources (feed, health, labour, replacements)",
        "Plans and sequences the 52→200 sow scale-up without breaking output",
        "Builds and develops the supervisory bench and succession",
        "Leads compliance, biosecurity, and welfare as accountable owner",
        "Reports to management with disciplined, honest governance",
      ],
      interviewQuestions: [
        {
          id: "l5_d1_q1",
          section: "D1. Whole-Farm Leadership and Scale-Up",
          question:
            "How would you run the whole farm to hit its targets, from daily control to the annual plan?",
          lookFor:
            "Coherent operating rhythm; ownership through L4/L5; KPI-driven; plans ahead.",
        },
        {
          id: "l5_d1_q2",
          section: "D1. Whole-Farm Leadership and Scale-Up",
          question:
            "Scaling 52→200 GP sows: what do you change and in what sequence, without breaking current output?",
          lookFor:
            "Staged plan across staffing, facilities, biosecurity, systems, and gilt pipeline.",
        },
        {
          id: "l5_d2_q3",
          section: "D2. KPI, Genetics, and Budget",
          question:
            "Pigs weaned per sow per year is below target and flat. How do you lead the turnaround?",
          lookFor:
            "Diagnoses across service, gestation, farrowing, health, nutrition, and people.",
        },
        {
          id: "l5_d2_q4",
          section: "D2. KPI, Genetics, and Budget",
          question:
            "How would you manage the farm budget for cost and performance, and plan capex for growth?",
          lookFor:
            "Understands major cost drivers; controls without starving performance.",
        },
        {
          id: "l5_d3_q5",
          section: "D3. Integrity and Continuity",
          question:
            "You're pressured from above to report better numbers than the farm is delivering. What do you do?",
          lookFor: "Reports honestly with a credible plan; will not falsify.",
        },
        {
          id: "l5_d3_q6",
          section: "D3. Integrity and Continuity",
          question:
            "A serious disease event threatens business continuity. How do you lead through it?",
          lookFor:
            "Calm command; contains; works with Vet; protects the core herd; documents recovery.",
        },
      ],
      weights: { sectionB: 35, sectionC: 30, sectionD: 35 },
      interpretation:
        "4.0+ — promote; 3.3–3.9 — promote with conditions and defined mentoring/handover; 2.8–3.2 — defer; below 2.8 — retain at L5. Confirm the track record — do not promote on interview alone.",
      signOffRoles: [
        "Immediate Supervisor (Operations/Production Manager)",
        "Veterinarian",
        "HR / Finance Representative",
        "Promotion Panel Decision (CEO / Operations Manager)",
      ],
    },

    L6_L7: {
      step: "L6_L7",
      title: "Breeding Farm Manager (L6) → Operations/Production Manager (L7)",
      fromGrade: "L6",
      toGrade: "L7",
      fromTitle: "Breeding Farm Manager (L6)",
      toTitle: "Operations/Production Manager (L7)",
      howToUse:
        "Assesses readiness for L7 — enterprise operational and technical leadership across breeding and grower-finisher operations. Assess as an executive succession decision.",
      eligibility: [
        ...BASE_ELIGIBILITY,
        "Holds the Bachelor's base; Master's (MSc/MPhil/MBA) or advanced management training strongly preferred",
        "Demonstrated farm-wide operational stability and KPI delivery as L6",
        "Evidence of leading across technical and people functions and building teams",
        "Disciplined governance and reporting; unquestioned leadership integrity",
        "Board / CEO endorses the review; L7 vacancy / succession need confirmed",
      ],
      disqualifyingFactors: [
        "Any willingness to compromise genetic integrity, biosecurity, or welfare for a target",
        "Any dishonesty or willingness to mislead the CEO/board in reporting",
        "Serious unresolved disciplinary action or major biosecurity / tier-rule breach on record",
        "No credible evidence of leading beyond a single farm",
        "Empire-building or dependency-creating leadership that won't build succession",
        "Loss of command or poor prioritisation demonstrated under crisis",
      ],
      documentedEvidence: [
        "Farm-wide operational stability and Breeding-KPI-Library performance (year)",
        "Resource and budget discipline as L6",
        "Leadership and talent-development / succession outcomes",
        "Compliance, biosecurity, tier-discipline, and welfare standards upheld",
        "Management reporting quality and governance discipline",
        "Cross-functional leadership (technical + people) evidence",
        "Overall annual appraisal trend and executive-readiness rating",
      ],
      skillsLogCompetencies: [
        "Aligns production across breeding and grower-finisher with strategy",
        "Owns and drives enterprise KPIs across both operations",
        "Coordinates across separately operated units (boar/semen, dispatch, data, health)",
        "Allocates capital across facilities, genetics, systems, and people",
        "Protects biosecurity, tier-discipline, and genetics at enterprise level",
        "Builds the leadership pipeline and succession beneath the role",
        "Governs and reports to CEO/board with discipline and honesty",
        "Leads the enterprise through external shocks and crises",
      ],
      interviewQuestions: [
        {
          id: "l6_d1_q1",
          section: "D1. Strategy and Enterprise Coordination",
          question:
            "How would you align daily production across breeding and grower-finisher with the three-year growth strategy?",
          lookFor:
            "Connects strategy to plans, KPIs, capital, and people; sees the whole enterprise.",
        },
        {
          id: "l6_d1_q2",
          section: "D1. Strategy and Enterprise Coordination",
          question:
            "How do you coordinate the separately operated units to run as one system?",
          lookFor:
            "Clear interfaces, SLAs, shared data, governance; integrates output.",
        },
        {
          id: "l6_d2_q3",
          section: "D2. Performance, Capital, and Governance",
          question:
            "Which enterprise KPIs would you own, and how would you drive them across both operations?",
          lookFor:
            "Reproductive, growth, dispatch, cost, welfare, compliance; cascades targets.",
        },
        {
          id: "l6_d2_q4",
          section: "D2. Performance, Capital, and Governance",
          question:
            "How do you report and govern to the CEO and board, especially on bad news?",
          lookFor:
            "Disciplined, transparent, no-surprises reporting; honest on setbacks.",
        },
        {
          id: "l6_d3_q5",
          section: "D3. Integrity and Crisis Leadership",
          question:
            "A strategic target is achievable only by cutting a genetic-integrity or welfare corner. What do you do?",
          lookFor:
            "Refuses; protects the core asset; finds another path or resets the target honestly.",
        },
        {
          id: "l6_d3_q6",
          section: "D3. Integrity and Crisis Leadership",
          question:
            "Lead us through your response to an enterprise-level disease outbreak plus a key-person loss in the same month.",
          lookFor:
            "Calm command; prioritisation; Vet and team mobilisation; continuity plan.",
        },
      ],
      weights: { sectionB: 35, sectionC: 25, sectionD: 40 },
      interpretation:
        "4.0+ — strong succession candidate, promote; 3.3–3.9 — promote with structured transition; 2.8–3.2 — defer; below 2.8 — retain at L6. Verify track record and integrity through references.",
      signOffRoles: [
        "Chair (CEO)",
        "Board / Investor Representative",
        "Veterinarian / External Swine Expert",
        "Promotion Panel Decision (CEO / Board)",
      ],
    },
  };

export function getFormConfig(
  currentGrade: string,
): PromotionFormConfig | null {
  const step = getPromotionStep(currentGrade);
  if (!step) return null;
  return PROMOTION_FORM_CONFIGS[step];
}
