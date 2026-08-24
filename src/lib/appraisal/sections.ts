import type { SectionDef } from "./scoring";
import {
  APPRAISAL_GRADE_BAND_IDS,
  canRateGradeLevel,
  gradeBandForGrade as gradeBandForGradeFromConfig,
  gradeIndexInOrder,
  isSupervisorRank,
  resolveAppraisalGradeBandCovers,
  resolveAppraisalGradeBandLabels,
  resolveAppraisalGradeOptions,
  resolveGradeOrder,
  type AppraisalGradeBandId,
  type GradeLevelsConfig,
} from "@/lib/systemDefinitions/gradeLevelsConfig";
import {
  gitTemplateKeyForFormKey,
  resolveAppraisalFormKeyCovers,
  resolveAppraisalFormKeyLabels,
  resolveAppraisalFormOptions,
  type AppraisalScopeConfig,
} from "@/lib/systemDefinitions/appraisalScopeConfig";

/**
 * Centralised rating-section definitions, shared by the appraisal form,
 * the Final Review Meeting screen, and the read-only detail view.
 *
 * There are exactly 4 quarterly forms per employee per year (Q1–Q4).
 * Q4 = Annual: it uses the fuller "annual" section set below (extra
 * Year-End KPI Summary section, different weight split) — there is no
 * separate Annual tab/form anywhere in the UI.
 */

export type Quarter = "Q1" | "Q2" | "Q3" | "Q4";
export const QUARTERS: Quarter[] = ["Q1", "Q2", "Q3", "Q4"];

/** @deprecated Use resolveGradeOrder(config) */
export const GRADE_ORDER = resolveGradeOrder();

export function gradeIndex(
  g: string | null | undefined,
  config?: GradeLevelsConfig,
): number {
  return gradeIndexInOrder(g, config);
}

/**
 * Lowest grade index that triggers L4+ weight rules (index 3 = L4 in default order).
 */
export const MIN_SUPERVISOR_GRADE_INDEX = 3;

export function canRate(
  raterGrade: string | null | undefined,
  targetGrade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  return canRateGradeLevel(raterGrade, targetGrade, config);
}

export function canAppraiseOthers(
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): boolean {
  return isSupervisorRank(grade, config);
}

export const GRADE_OPTIONS = resolveAppraisalGradeOptions().map((o) => ({
  value: o.value,
  label: o.label,
}));

export const GRADE_BAND_COVERS = resolveAppraisalGradeBandCovers();

export function gradeBandForGrade(
  grade: string | null | undefined,
  config?: GradeLevelsConfig,
): AppraisalGradeBandId {
  return gradeBandForGradeFromConfig(grade, config);
}

export function supervisableGradeBands(
  raterGrade: string | null | undefined,
  gradeConfig?: GradeLevelsConfig,
  scopeConfig?: AppraisalScopeConfig,
) {
  const options = resolveAppraisalFormOptions(scopeConfig, gradeConfig);
  const covers = resolveAppraisalFormKeyCovers(scopeConfig, gradeConfig);
  return options.filter((opt) => {
    const grades = covers[opt.value] ?? [];
    return grades.some((g) => canRate(raterGrade, g, gradeConfig));
  });
}

export function getAppraisalFormKeyLabels(
  scopeConfig?: AppraisalScopeConfig,
  gradeConfig?: GradeLevelsConfig,
): Record<string, string> {
  return resolveAppraisalFormKeyLabels(scopeConfig, gradeConfig);
}

export function getAppraisalGradeBandLabels(
  config?: GradeLevelsConfig,
): Record<AppraisalGradeBandId, string> {
  return resolveAppraisalGradeBandLabels(config);
}

/** "quarterly" set = Q1–Q3. "annual" set = Q4. */
export type SectionSet = "quarterly" | "annual";

export const SECTION_SET_UI_LABELS: Record<SectionSet, string> = {
  quarterly: "Quarterly",
  annual: "Annual",
};

export function sectionSetForQuarter(quarter: Quarter): SectionSet {
  return quarter === "Q4" ? "annual" : "quarterly";
}

export const SECTIONS_MAP: Record<string, Record<SectionSet, SectionDef[]>> = {
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

export function sectionsFor(formKey: string, quarter: Quarter): SectionDef[] {
  const templateKey = gitTemplateKeyForFormKey(formKey);
  return SECTIONS_MAP[templateKey]?.[sectionSetForQuarter(quarter)] ?? [];
}

/** Grade bands used in the appraisal rating grid (for System Definitions). */
export const APPRAISAL_GRADE_BANDS = APPRAISAL_GRADE_BAND_IDS;

export type AppraisalGradeBand = AppraisalGradeBandId;

export const APPRAISAL_GRADE_BAND_LABELS = resolveAppraisalGradeBandLabels();

/** Snapshot of default section weights from Git (for System Definitions + merge). */
export function getGitSectionWeightSnapshot(): Record<
  AppraisalGradeBand,
  { quarterly: Record<string, number>; annual: Record<string, number> }
> {
  const out = {} as Record<
    AppraisalGradeBand,
    { quarterly: Record<string, number>; annual: Record<string, number> }
  >;
  for (const band of APPRAISAL_GRADE_BANDS) {
    const sets = SECTIONS_MAP[band];
    out[band] = {
      quarterly: Object.fromEntries(
        sets.quarterly.map((s) => [s.key, s.weight]),
      ),
      annual: Object.fromEntries(sets.annual.map((s) => [s.key, s.weight])),
    };
  }
  return out;
}

/** Full Git section definitions for System Definitions editors. */
export function getSectionsForBandSet(
  formKey: string,
  sectionSet: SectionSet,
): SectionDef[] {
  const templateKey = gitTemplateKeyForFormKey(formKey);
  return (SECTIONS_MAP[templateKey]?.[sectionSet] ?? []).map((s) => ({
    ...s,
    items: [...s.items],
  }));
}

/** Section titles for a form key + set (editor labels). */
export function getSectionMetaForBandSet(
  formKey: string,
  sectionSet: SectionSet,
): { key: string; title: string; defaultWeight: number }[] {
  const templateKey = gitTemplateKeyForFormKey(formKey);
  return (SECTIONS_MAP[templateKey]?.[sectionSet] ?? []).map((s) => ({
    key: s.key,
    title: s.title,
    defaultWeight: s.weight,
  }));
}
