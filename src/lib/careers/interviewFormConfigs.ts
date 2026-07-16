import type { InterviewGuideKey } from "./openings";

export const RATING_LABELS: Record<number, string> = {
  1: "Unsatisfactory",
  2: "Below Expectation",
  3: "Meets Expectation",
  4: "Above Expectation",
  5: "Excellent",
};

export interface ScreeningItem {
  id: string;
  requirement: string;
  mandatory?: boolean;
}

export interface InterviewQuestion {
  id: string;
  section: string;
  question: string;
  lookFor: string;
}

export interface ScenarioItem {
  id: string;
  section: string;
  title: string;
  observe: string;
}

export interface WeightRow {
  area: string;
  questionIds: string[];
  weight: number;
}

export interface InterviewGuideConfig {
  key: InterviewGuideKey;
  title: string;
  grade?: string;
  briefing: string;
  recommendedPanel: string;
  duration: string;
  screening: ScreeningItem[];
  questions: InterviewQuestion[];
  scenarios: ScenarioItem[];
  weights: WeightRow[];
  interpretation: string;
  disqualifiers: string[];
}

function q(
  id: string,
  section: string,
  question: string,
  lookFor: string,
): InterviewQuestion {
  return { id, section, question, lookFor };
}

function s(
  id: string,
  section: string,
  title: string,
  observe: string,
): ScenarioItem {
  return { id, section, title, observe };
}

const L1_GUIDE: InterviewGuideConfig = {
  key: "L1",
  title: "Junior Swine Technician (L1)",
  grade: "L1",
  briefing:
    "At L1 we hire for attitude, trainability, honesty, and discipline. Technical skill is trained on farm; character is not. Probe biosecurity, PPE, honest recordkeeping, no unauthorised treatment, and immediate escalation.",
  recommendedPanel: "Herd Supervisor/Manager (L4) as chair, plus Breeding Farm Manager and/or Veterinarian",
  duration: "45–60 min interview + 45–60 min practical",
  screening: [
    { id: "A1", requirement: "Certificate in Animal Health (2 yrs) OR NC II (CTVET) — originals sighted", mandatory: true },
    { id: "A2", requirement: "Physically able and willing to lift 50 kg feed sacks", mandatory: true },
    { id: "A3", requirement: "Willing to comply fully with farm biosecurity and PPE rules", mandatory: true },
    { id: "A4", requirement: "Available for early starts, weekend rotation, and feed-milling duty", mandatory: true },
    { id: "A5", requirement: "Diploma in Animal Health / Science (advantage)" },
    { id: "A6", requirement: "Prior piggery or intensive-livestock experience (advantage)" },
    { id: "A7", requirement: "Two contactable references provided" },
  ],
  questions: [
    q("Q1", "B1 Motivation & trainability", "Why do you want to work as a swine technician, and what do you understand the daily work involves?", "Realistic picture of cleaning, feeding, early starts, physical work — not romantic view."),
    q("Q2", "B1 Motivation & trainability", "Tell us about your field attachment. What routines did you carry out daily?", "Specific first-hand detail; honesty about what was hard."),
    q("Q3", "B1 Motivation & trainability", "This role starts with supervised basics before breeding/farrowing authorisation. How do you feel about that?", "Accepts structured progression; asks how to earn authorisations."),
    q("Q4", "B2 Animal care & observation", "How would you check a pen of pigs at shift start? What signs suggest illness?", "Systematic check; reports promptly — does not treat independently."),
    q("Q5", "B2 Animal care & observation", "You find a weak, chilled piglet in a farrowing crate. What do you do?", "Reports immediately; assists only under instruction."),
    q("Q6", "B3 Biosecurity & PPE", "Explain why biosecurity matters on a genetics multiplication farm.", "Understands disease/genetic protection; compliance is non-negotiable."),
    q("Q7", "B3 Biosecurity & PPE", "You see a colleague skip the shower/change step. What do you do?", "Corrects or reports — does not ignore for friendship."),
    q("Q8", "B4 Honesty & records", "Why is accurate, timely recording important on this farm?", "Links records to KPIs, genetics, and customer trust."),
    q("Q9", "B4 Honesty & records", "You forgot to record a pig death when it happened. What do you do?", "Reports immediately and records honestly — red flag if backdating."),
    q("Q10", "B4 Honesty & records", "You make a mistake nobody saw. What do you do?", "Reports without being asked — direct honesty test."),
  ],
  scenarios: [
    s("P1", "Section C", "Practical: pen cleaning and feeding routine", "Method, hygiene, welfare awareness, follows instruction."),
    s("P2", "Section C", "Observation exercise: identify abnormal pig behaviour", "Systematic observation; escalates appropriately."),
    s("P3", "Section C", "Biosecurity walk-through", "PPE, tool discipline, section boundaries."),
  ],
  weights: [
    { area: "B1 Motivation & trainability", questionIds: ["Q1", "Q2", "Q3"], weight: 20 },
    { area: "B2 Animal care", questionIds: ["Q4", "Q5"], weight: 20 },
    { area: "B3 Biosecurity & PPE", questionIds: ["Q6", "Q7"], weight: 25 },
    { area: "B4 Honesty & records", questionIds: ["Q8", "Q9", "Q10"], weight: 20 },
    { area: "Practical assessment", questionIds: ["P1", "P2", "P3"], weight: 15 },
  ],
  interpretation: "4.0+ strong hire; 3.3–3.9 hire if references confirm attitude; 2.8–3.2 hold; below 2.8 do not hire.",
  disqualifiers: [
    "Any “No” on mandatory screening without documented exception",
    "Unwillingness to comply with biosecurity or PPE",
    "Evidence of dishonesty in responses or references",
    "Unrealistic expectations refusing supervised progression",
  ],
};

const L2_GUIDE: InterviewGuideConfig = {
  key: "L2",
  title: "Swine Technician (L2)",
  grade: "L2",
  briefing:
    "L2 is a competent hands-on operator across breeding, farrowing, and grower-finisher. Hire for reliable execution, SOP discipline, accurate recording, and biosecurity/tier compliance.",
  recommendedPanel: "Herd Supervisor/Manager (L4) as chair, plus Breeding Farm Manager or Veterinarian",
  duration: "60 minutes",
  screening: [
    { id: "A1", requirement: "Diploma / HND in Animal Health, Science, Husbandry, or Production — originals sighted", mandatory: true },
    { id: "A2", requirement: "Meaningful hands-on pig production experience", mandatory: true },
    { id: "A3", requirement: "Physically able for 50 kg lifting; weekend rotation and milling duty", mandatory: true },
    { id: "A4", requirement: "Internal L2 certification or equivalent verifiable experience" },
    { id: "A5", requirement: "Bachelor's degree (advantage)" },
    { id: "A6", requirement: "Two contactable references including a supervisor" },
  ],
  questions: [
    q("Q1", "B1 Technical execution", "Walk us through your daily breeding and farrowing routines to SOP.", "Correct sequence, hygiene, welfare, records at point of event."),
    q("Q2", "B1 Technical execution", "How do you maintain consistency when doing repetitive tasks?", "Checklists, self-checking, seeks feedback on KPI impact."),
    q("Q3", "B2 Grower-finisher", "How do you monitor ADG, FCR, and dispatch weight compliance?", "Uses data; flags exceptions; escalates health issues."),
    q("Q4", "B3 Biosecurity", "Describe tier-discipline and why GP/PS separation matters.", "Understands genetic integrity and traceability."),
    q("Q5", "B3 Biosecurity", "Incoming semen receipt — what checks do you perform?", "Documentation, temperature, packaging, rejection of out-of-spec."),
    q("Q6", "B4 Records & honesty", "You notice a recording error from yesterday. What do you do?", "Corrects with supervisor; does not silently alter history."),
  ],
  scenarios: [
    s("P1", "Section C", "AI technique assessment", "Timing, hygiene, semen handling, calm sow handling."),
    s("P2", "Section C", "Farrowing intervention under instruction", "Welfare-first; follows escalation rules."),
    s("P3", "Section C", "Biosecurity breach response", "Contains, reports, does not freelance treatment."),
  ],
  weights: [
    { area: "B1 Technical execution", questionIds: ["Q1", "Q2"], weight: 25 },
    { area: "B2 Grower-finisher", questionIds: ["Q3"], weight: 15 },
    { area: "B3 Biosecurity", questionIds: ["Q4", "Q5"], weight: 25 },
    { area: "B4 Records & honesty", questionIds: ["Q6"], weight: 15 },
    { area: "Practical assessment", questionIds: ["P1", "P2", "P3"], weight: 20 },
  ],
  interpretation: "4.0+ strong hire; 3.3–3.9 hire with reference confirmation; 2.8–3.2 hold; below 2.8 do not hire.",
  disqualifiers: [
    "Mandatory screening failures without exception",
    "Tier-discipline or biosecurity indifference",
    "Unwillingness to record accurately at point of event",
  ],
};

const L3_GUIDE: InterviewGuideConfig = {
  key: "L3",
  title: "Senior Swine Technician (L3)",
  grade: "L3",
  briefing:
    "L3 is lead AI operator, floor coordinator, and coach. Hire for technical excellence, coaching ability, calm floor presence, and discipline enforcing standards on peers.",
  recommendedPanel: "Breeding Farm Manager or Herd Supervisor as chair, plus Veterinarian",
  duration: "60 min + practical/coaching assessment",
  screening: [
    { id: "A1", requirement: "Diploma / HND in Animal Health, Science, Husbandry, or Production", mandatory: true },
    { id: "A2", requirement: "Lead AI Operator certification (internal or equivalent)", mandatory: true },
    { id: "A3", requirement: "Demonstrated coaching / staff-guidance capability", mandatory: true },
    { id: "A4", requirement: "Physically able for 50 kg lifting; weekend rotation", mandatory: true },
    { id: "A5", requirement: "Bachelor's degree (advantage)" },
    { id: "A6", requirement: "Two supervisor references on reliability and conduct" },
  ],
  questions: [
    q("Q1", "B1 AI leadership", "Walk through end-to-end breeding workflow — what separates good from poor conception?", "Timing, semen handling, hygiene, links to KPIs."),
    q("Q2", "B1 AI leadership", "AI results dip in a batch — how do you diagnose technique vs semen vs animals?", "Structured diagnosis; collaborates with L4/Vet."),
    q("Q3", "B2 Coaching", "How would you teach a nervous L1 to handle and observe sows?", "Demonstrate, observe, correct kindly, verify competence."),
    q("Q4", "B2 Coaching", "An L2 keeps making the same recording error. What do you do?", "Re-coaches, documents, escalates to L4 if persistent."),
    q("Q5", "B3 Record checking", "You find missing/inconsistent L1/L2 captures. Walk through your response.", "Original technician corrects; L3 verifies; escalates if integrity issue."),
    q("Q6", "B4 Standards enforcement", "How do you enforce biosecurity on peers who are friends?", "Firm regardless of relationship; role-models and reports breaches."),
  ],
  scenarios: [
    s("P1", "Section C", "Coaching observation: correct a junior's technique", "Patient, standard-focused, verifies learning."),
    s("P2", "Section C", "Floor coordination with absent L1/L2", "Prioritises welfare; records under L4 supervision when covering."),
    s("P3", "Section C", "Semen handling practical", "Temperature discipline, documentation, rejection criteria."),
  ],
  weights: [
    { area: "B1 AI leadership", questionIds: ["Q1", "Q2"], weight: 25 },
    { area: "B2 Coaching", questionIds: ["Q3", "Q4"], weight: 20 },
    { area: "B3 Record checking", questionIds: ["Q5"], weight: 20 },
    { area: "B4 Standards enforcement", questionIds: ["Q6"], weight: 15 },
    { area: "Practical assessment", questionIds: ["P1", "P2", "P3"], weight: 20 },
  ],
  interpretation: "4.0+ strong appointment; 3.3–3.9 appoint if references confirm coaching; 2.8–3.2 hold; below 2.8 do not appoint.",
  disqualifiers: [
    "Does not understand L3 record-check boundary (must not alter others' primary records)",
    "Unwilling to enforce standards on peers",
    "Weak AI technique in practical",
  ],
};

const L4_GUIDE: InterviewGuideConfig = {
  key: "L4",
  title: "Herd Supervisor / Manager (L4)",
  grade: "L4",
  briefing:
    "First true management role — people control, KPI ownership, calm decision-making under pressure, plus technical credibility across breeding, farrowing, and grower-finisher.",
  recommendedPanel: "Breeding Farm Manager or Operations Manager as chair, plus Veterinarian",
  duration: "60–75 minutes",
  screening: [
    { id: "A1", requirement: "Bachelor's or B.Tech in Animal Science / Production / Health / Agribusiness", mandatory: true },
    { id: "A2", requirement: "Demonstrated supervisory or daily-operations leadership", mandatory: true },
    { id: "A3", requirement: "Demonstrated ownership of reproductive or production KPIs", mandatory: true },
    { id: "A4", requirement: "Strong practical piggery experience", mandatory: false },
    { id: "A5", requirement: "Postgraduate qualification (advantage)" },
    { id: "A6", requirement: "Two references including a manager on leadership and integrity" },
  ],
  questions: [
    q("Q1", "B1 Operational control", "Plan and allocate a day's work across breeding, farrowing, and grower-finisher at 52-sow scale.", "Prioritises cycle and welfare; realistic team allocation."),
    q("Q2", "B1 Operational control", "Key technician absent on heavy farrowing day — how do you re-plan?", "Decisive redeployment; escalates welfare risks."),
    q("Q3", "B2 Supervision", "Technician repeatedly late with slipping quality — your approach?", "Fair, documented, support plus consequences."),
    q("Q4", "B3 KPI ownership", "Which reproductive KPIs weekly; falling farrowing rate — investigate how?", "Real KPIs; structured root cause with Vet involvement."),
    q("Q5", "B4 Compliance", "Tier-discipline breach — GP and PS records mixed. Response?", "Contains, escalates immediately, traces extent, documents."),
    q("Q6", "B5 Judgement", "When do you handle vs escalate to Farm Manager or Veterinarian?", "Clear scope; escalates health, welfare, biosecurity promptly."),
  ],
  scenarios: [
    s("P1", "Section C", "Weekly staffing plan for reproductive calendar", "Realistic prioritisation for lean team."),
    s("P2", "Section C", "Farrowing rate drop from 88% to 79%", "Structured diagnosis and action plan."),
    s("P3", "Section C", "Technician falsifying cleaning record", "Integrity breach process; fair but firm."),
    s("P4", "Section C", "Neighbouring farm biosecurity scare", "Raises controls; coordinates with Vet."),
    s("P5", "Section C", "Barn walk-through observation", "Technical credibility on floor standards."),
  ],
  weights: [
    { area: "B1 Operational control", questionIds: ["Q1", "Q2"], weight: 15 },
    { area: "B2 Supervision", questionIds: ["Q3"], weight: 15 },
    { area: "B3 KPI ownership", questionIds: ["Q4"], weight: 15 },
    { area: "B4 Compliance", questionIds: ["Q5"], weight: 12 },
    { area: "B5 Judgement", questionIds: ["Q6"], weight: 8 },
    { area: "Scenario assessment", questionIds: ["P1", "P2", "P3", "P4", "P5"], weight: 35 },
  ],
  interpretation: "4.0+ strong appointment; 3.3–3.9 appoint if references confirm; 2.8–3.2 hold; below 2.8 do not appoint.",
  disqualifiers: [
    "Willingness to tolerate falsified records",
    "Weak KPI ownership or inability to plan under pressure",
    "Mandatory degree/supervisory screening failures",
  ],
};

const L5_GUIDE: InterviewGuideConfig = {
  key: "L5",
  title: "Assistant Farm Manager (L5)",
  grade: "L5",
  briefing:
    "Second-line management — multi-section coordination, gilt pipeline oversight, reporting integrity, and stable leadership supporting the Breeding Farm Manager.",
  recommendedPanel: "Breeding Farm Manager as chair, plus Operations Manager and/or Veterinarian",
  duration: "60–75 minutes",
  screening: [
    { id: "A1", requirement: "Bachelor's in Animal Science / Production / Health / Agribusiness", mandatory: true },
    { id: "A2", requirement: "Significant technical and supervisory experience in intensive livestock", mandatory: true },
    { id: "A3", requirement: "Proven multi-section or multi-team coordination", mandatory: false },
    { id: "A4", requirement: "Gilt-development or reproductive-pipeline exposure", mandatory: false },
    { id: "A5", requirement: "PG Diploma or MSc (advantage)" },
    { id: "A6", requirement: "Two references including a senior manager" },
  ],
  questions: [
    q("Q1", "B1 Coordination", "How do you keep several operational areas aligned when you don't run any single one day-to-day?", "Shared priorities, L4 coordination, cadenced check-ins."),
    q("Q2", "B2 Gilt pipeline", "Walk through overseeing gilt pipeline from selection to first service.", "Selection, acclimatisation, health, target service age/weight."),
    q("Q3", "B2 Gilt pipeline", "How do you ensure gilt pool adequacy without over/under-supply?", "Forecasts culling; tracks pool vs targets; flags early."),
    q("Q4", "B3 People", "An L4 supervisor under you is underperforming — how do you handle it?", "Direct feedback, documents, escalates; manages managers fairly."),
    q("Q5", "B4 Reporting integrity", "Management asks for numbers that make the farm look better than reality. What do you do?", "Reports honestly — hedging is a serious red flag."),
    q("Q6", "B5 Judgement", "Where do you decide yourself vs escalate to Breeding Farm Manager?", "Clear scope on policy, budget, health, integrity issues."),
  ],
  scenarios: [
    s("P1", "Section C", "Three sections, lean team, farrowing peak and dispatch same week", "Prioritised cross-section deployment plan."),
    s("P2", "Section C", "Gilt pool adequacy case", "Pool logic, selection standards, genetic integrity."),
    s("P3", "Section C", "Reporting shortfall to CEO-bound weekly report", "Honest presentation with corrective plan."),
    s("P4", "Section C", "L4 and L3 public disagreement on breeding decision", "Restores order; coaches privately."),
    s("P5", "Section C", "Manager away one week — scope of control", "Stable operation without policy freelancing."),
  ],
  weights: [
    { area: "B1 Coordination", questionIds: ["Q1"], weight: 15 },
    { area: "B2 Gilt pipeline", questionIds: ["Q2", "Q3"], weight: 18 },
    { area: "B3 People", questionIds: ["Q4"], weight: 10 },
    { area: "B4 Reporting integrity", questionIds: ["Q5"], weight: 12 },
    { area: "B5 Judgement", questionIds: ["Q6"], weight: 10 },
    { area: "Scenario assessment", questionIds: ["P1", "P2", "P3", "P4", "P5"], weight: 35 },
  ],
  interpretation: "4.0+ strong appointment; 3.3–3.9 appoint if references confirm coordination and integrity; 2.8–3.2 hold; below 2.8 do not appoint.",
  disqualifiers: [
    "Any willingness to massage, hide, or spin reports",
    "Weak gilt-development fundamentals",
    "Undermines manager rather than extending reach",
  ],
};

const L6_GUIDE: InterviewGuideConfig = {
  key: "L6",
  title: "Breeding Farm Manager (L6)",
  grade: "L6",
  briefing:
    "Functional manager of the whole multiplication farm — reproductive KPIs, genetic-tier integrity, people, budget, and scaling from 52 to 200 GP sows while breeding own replacements.",
  recommendedPanel: "Operations/Production Manager or CEO as chair, plus Veterinarian and HR/finance",
  duration: "75–90 minutes including strategic case",
  screening: [
    { id: "A1", requirement: "Bachelor's in Animal Science / Production / Veterinary Medicine / Agribusiness", mandatory: true },
    { id: "A2", requirement: "Strong prior supervisory and operational farm-management experience", mandatory: true },
    { id: "A3", requirement: "Management of reproductive KPIs and budgets", mandatory: false },
    { id: "A4", requirement: "PG Diploma, MSc, or MBA (preferred)" },
    { id: "A5", requirement: "Multi-tier (GGP/GP/PS) breeding exposure" },
    { id: "A6", requirement: "Three references including direct former line manager" },
  ],
  questions: [
    q("Q1", "B1 Operational leadership", "How would you run this farm to hit reproductive and dispatch targets?", "Daily/weekly/monthly cadence; KPI-driven; plans ahead."),
    q("Q2", "B1 Operational leadership", "Scaling 52 to 200 GP sows over three years — what changes, in what sequence?", "Staged staffing, facilities, biosecurity, gilt pipeline."),
    q("Q3", "B2 KPI delivery", "Pigs weaned/sow/year below target — how do you lead turnaround?", "Structured diagnosis across service, health, nutrition, people."),
    q("Q4", "B3 Genetic integrity", "Why is genetic-tier integrity the core asset, and how do you protect it?", "Tier discipline, biosecurity, records, controlled replacement."),
    q("Q5", "B4 People", "How do you build a bench of supervisors so the farm isn't dependent on a few?", "Career architecture, cross-training, succession."),
    q("Q6", "B5 Integrity", "Pressure to report better numbers than delivered — what do you do?", "Reports honestly; falsification is disqualifying."),
  ],
  scenarios: [
    s("P1", "Section C", "Scale-up plan presentation", "Sequenced, resourced, protects KPIs and genetics."),
    s("P2", "Section C", "KPI turnaround from underperforming snapshot", "Root cause, owners, timelines, cost."),
    s("P3", "Section C", "Pressure to overstate performance to board", "Honest backbone with real plan."),
    s("P4", "Section C", "Suspected notifiable disease — first 72 hours", "Command, Vet collaboration, containment."),
    s("P5", "Section C", "Supervisory bench and succession over 18 months", "Concrete development thinking."),
  ],
  weights: [
    { area: "B1 Operational leadership", questionIds: ["Q1", "Q2"], weight: 15 },
    { area: "B2 KPI delivery", questionIds: ["Q3"], weight: 15 },
    { area: "B3 Genetic integrity", questionIds: ["Q4"], weight: 12 },
    { area: "B4 People", questionIds: ["Q5"], weight: 10 },
    { area: "B5 Integrity", questionIds: ["Q6"], weight: 13 },
    { area: "Strategic case", questionIds: ["P1", "P2", "P3", "P4", "P5"], weight: 35 },
  ],
  interpretation: "4.0+ strong appointment; 3.3–3.9 appoint if references confirm track record; 2.8–3.2 hold; below 2.8 do not appoint.",
  disqualifiers: [
    "Management integrity compromise",
    "Weak genetic-tier or biosecurity stewardship",
    "No credible scale-up or KPI turnaround thinking",
  ],
};

const L7_GUIDE: InterviewGuideConfig = {
  key: "L7",
  title: "Operations / Production Manager (L7)",
  grade: "L7",
  briefing:
    "Top line-management role — enterprise operational leadership across breeding multiplication and grower-finisher, aligning production, finance, compliance, and people with strategy.",
  recommendedPanel: "CEO as chair, plus board/investor representative and Veterinarian or external swine expert",
  duration: "90 minutes including strategic presentation",
  screening: [
    { id: "A1", requirement: "Bachelor's in Animal Science / Production / Veterinary Medicine / Agribusiness / Operations", mandatory: true },
    { id: "A2", requirement: "Significant farm leadership and multi-level management experience", mandatory: true },
    { id: "A3", requirement: "Master's or advanced management training (strongly preferred)" },
    { id: "A4", requirement: "Enterprise operations and scaling experience" },
    { id: "A5", requirement: "Pig production or intensive livestock at scale" },
    { id: "A6", requirement: "Three references including board-level or CEO referee" },
  ],
  questions: [
    q("Q1", "B1 Enterprise leadership", "Align day-to-day production across breeding and grower-finisher with three-year growth strategy.", "Connects strategy to KPIs, capital, people."),
    q("Q2", "B2 Performance", "What enterprise KPIs do you own and how do you drive them?", "Cascades targets; holds managers accountable."),
    q("Q3", "B3 Governance", "Board wants faster growth than farm can absorb safely — how do you handle it?", "Honest risk case with data; constructive alternative."),
    q("Q4", "B4 Talent", "How do you build leadership pipeline and succession beneath you?", "Develops L4–L6 deliberately."),
    q("Q5", "B5 Integrity", "Hitting a strategic target requires compromising genetic integrity or welfare — what do you do?", "Refuses; protects core asset."),
  ],
  scenarios: [
    s("P1", "Section C", "3-year operating plan presentation", "Enterprise strategy protecting genetics and biosecurity."),
    s("P2", "Section C", "Capital allocation across facilities, genetics, systems, people", "Return- and risk-based reasoning."),
    s("P3", "Section C", "Board pushes unsafe growth", "Holds integrity line constructively."),
    s("P4", "Section C", "Enterprise disease outbreak plus key-person loss", "Command, continuity, recovery."),
    s("P5", "Section C", "Strategic target vs welfare/genetic standard", "Unambiguous refusal."),
  ],
  weights: [
    { area: "B1 Enterprise leadership", questionIds: ["Q1"], weight: 15 },
    { area: "B2 Performance", questionIds: ["Q2"], weight: 15 },
    { area: "B3 Governance", questionIds: ["Q3"], weight: 15 },
    { area: "B4 Talent", questionIds: ["Q4"], weight: 10 },
    { area: "B5 Integrity", questionIds: ["Q5"], weight: 15 },
    { area: "Strategic presentation", questionIds: ["P1", "P2", "P3", "P4", "P5"], weight: 30 },
  ],
  interpretation: "4.0+ strong executive appointment; 3.3–3.9 appoint if references confirm; 2.8–3.2 hold; below 2.8 do not appoint.",
  disqualifiers: [
    "Compromising welfare or genetic standards for targets",
    "Weak governance or reporting maturity",
    "Inability to coordinate enterprise units",
  ],
};

const DATA_ANALYST_GUIDE: InterviewGuideConfig = {
  key: "data_analyst",
  title: "Data Analyst",
  grade: "L2/L3",
  briefing:
    "Owns integrity, reporting, and traceability of multiplication records. Does NOT enter or correct primary records — analyses, reports, and flags issues back to L4. Hire for analytical skill, accuracy, and boundary discipline.",
  recommendedPanel: "Breeding Farm Manager or Operations Manager as chair, plus L4 and IT/analytics reviewer",
  duration: "60–75 minutes including hands-on exercise",
  screening: [
    { id: "A1", requirement: "Data-analyst credential OR professional certification with portfolio", mandatory: true },
    { id: "A2", requirement: "Advanced spreadsheets, basic SQL, and one dashboarding tool", mandatory: true },
    { id: "A3", requirement: "Portfolio of dashboards/KPI reports available", mandatory: false },
    { id: "A4", requirement: "Herd-management software familiarity (desirable)" },
    { id: "A5", requirement: "Accepts mandatory 6-month production training if no livestock domain qualification" },
    { id: "A6", requirement: "Two references on accuracy and integrity" },
  ],
  questions: [
    q("Q1", "B1 Technical skill", "How would you build a weekly reproductive-KPI report from raw event records?", "Clear pipeline: source, clean, KPI logic, visualisation."),
    q("Q2", "B1 Technical skill", "Describe a SQL query or dashboard you built.", "Hands-on detail, not tool name-dropping."),
    q("Q3", "B1 Technical skill", "Messy dataset with duplicates and missing IDs — your approach?", "Systematic cleaning; flags rather than silent guesses."),
    q("Q4", "B2 KPI understanding", "Which reproductive KPIs matter most and how would you flag exceptions?", "Farrowing rate, returns, mortality; exception logic."),
    q("Q5", "B3 Boundary discipline", "L4 asks you to correct a technician's primary record. What do you do?", "Refuses direct correction; flags to L4 for original capturer action."),
    q("Q6", "B4 Integrity", "You find a pattern suggesting deliberate mis-recording. Response?", "Documents, escalates; protects audit trail."),
  ],
  scenarios: [
    s("P1", "Section C", "Hands-on data exercise from sample records", "Cleaning, KPI calc, clear assumptions."),
    s("P2", "Section C", "Weekly exception report for management", "Prioritises actionable issues."),
    s("P3", "Section C", "Audit support case — trace a dispatch discrepancy", "Traceability mindset."),
  ],
  weights: [
    { area: "B1 Technical skill", questionIds: ["Q1", "Q2", "Q3"], weight: 30 },
    { area: "B2 KPI understanding", questionIds: ["Q4"], weight: 15 },
    { area: "B3 Boundary discipline", questionIds: ["Q5"], weight: 20 },
    { area: "B4 Integrity", questionIds: ["Q6"], weight: 15 },
    { area: "Data exercise", questionIds: ["P1", "P2", "P3"], weight: 20 },
  ],
  interpretation: "4.0+ strong hire; 3.3–3.9 hire if portfolio confirms; 2.8–3.2 hold; below 2.8 do not hire.",
  disqualifiers: [
    "Willingness to alter primary records",
    "Weak analytical depth in exercise",
    "Cannot accept L4 correction boundary",
  ],
};

const VETERINARIAN_GUIDE: InterviewGuideConfig = {
  key: "veterinarian",
  title: "Veterinarian — Animal Health & Biosecurity Lead",
  briefing:
    "Veterinary leadership for herd health programmes, biosecurity governance, and regulatory compliance on a genetics-led multiplication operation.",
  recommendedPanel: "Operations/Production Manager or CEO as chair, plus Breeding Farm Manager and external peer if available",
  duration: "75–90 minutes",
  screening: [
    { id: "A1", requirement: "DVM with valid Ghana Veterinary Council registration", mandatory: true },
    { id: "A2", requirement: "Swine or intensive livestock veterinary experience", mandatory: true },
    { id: "A3", requirement: "Biosecurity programme design and audit experience", mandatory: false },
    { id: "A4", requirement: "Multi-tier breeding / genetics operation exposure (advantage)" },
    { id: "A5", requirement: "Three references including senior clinical/management referee" },
  ],
  questions: [
    q("Q1", "B1 Clinical leadership", "Outline your approach to herd health on a GP multiplication farm.", "Preventive focus, vaccination, surveillance, treatment protocols."),
    q("Q2", "B2 Biosecurity", "How do you design and audit biosecurity for tier-discipline and external threats?", "Zoning, movement, visitor control, neighbour risk."),
    q("Q3", "B2 Biosecurity", "Suspected notifiable disease — first 24–72 hours?", "Containment, notification chain, sample strategy, communication."),
    q("Q4", "B3 Collaboration", "How do you work with L4–L6 on compliance without becoming the bottleneck?", "Standards, training, escalation paths, audits."),
    q("Q5", "B4 Integrity", "Pressure to use unauthorised treatment or shortcut withdrawal periods?", "Refuses; documents; protects compliance."),
    q("Q6", "B5 Strategic", "Internal gilt replacement — key health and genetic risks?", "Health status, acclimatisation, flow biosecurity."),
  ],
  scenarios: [
    s("P1", "Section C", "Disease outbreak tabletop", "Command structure, Vet-farm collaboration."),
    s("P2", "Section C", "Biosecurity audit findings prioritisation", "Risk-based corrective plan."),
    s("P3", "Section C", "Medicine and vaccination programme review", "Evidence-based, cost-aware, welfare-aligned."),
  ],
  weights: [
    { area: "B1 Clinical leadership", questionIds: ["Q1"], weight: 20 },
    { area: "B2 Biosecurity", questionIds: ["Q2", "Q3"], weight: 25 },
    { area: "B3 Collaboration", questionIds: ["Q4"], weight: 15 },
    { area: "B4 Integrity", questionIds: ["Q5"], weight: 15 },
    { area: "B5 Strategic", questionIds: ["Q6"], weight: 10 },
    { area: "Scenario assessment", questionIds: ["P1", "P2", "P3"], weight: 15 },
  ],
  interpretation: "4.0+ strong appointment; 3.3–3.9 appoint if references confirm; 2.8–3.2 hold; below 2.8 do not appoint.",
  disqualifiers: [
    "Invalid or unverifiable veterinary registration",
    "Unwillingness to enforce biosecurity non-negotiables",
    "Shortcutting medicine compliance under pressure",
  ],
};

const GUIDES: Record<InterviewGuideKey, InterviewGuideConfig> = {
  L1: L1_GUIDE,
  L2: L2_GUIDE,
  L3: L3_GUIDE,
  L4: L4_GUIDE,
  L5: L5_GUIDE,
  L6: L6_GUIDE,
  L7: L7_GUIDE,
  data_analyst: DATA_ANALYST_GUIDE,
  veterinarian: VETERINARIAN_GUIDE,
};

export function getInterviewGuide(key: InterviewGuideKey): InterviewGuideConfig {
  return GUIDES[key];
}

/** Compute weighted score from ratings (1–5) */
export function computeWeightedScore(
  config: InterviewGuideConfig,
  questionRatings: Record<string, { rating: number | null }>,
  scenarioRatings: Record<string, { rating: number | null }>,
): { areaScores: Record<string, number | null>; total: number | null } {
  const allRatings = { ...questionRatings, ...scenarioRatings };
  const areaScores: Record<string, number | null> = {};
  let total = 0;
  let hasAny = false;

  for (const row of config.weights) {
    const vals = row.questionIds
      .map((id) => allRatings[id]?.rating)
      .filter((r): r is number => r != null && r >= 1 && r <= 5);
    const avg =
      vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    areaScores[row.area] = avg;
    if (avg != null) {
      total += avg * (row.weight / 100);
      hasAny = true;
    }
  }

  return { areaScores, total: hasAny ? Math.round(total * 100) / 100 : null };
}
