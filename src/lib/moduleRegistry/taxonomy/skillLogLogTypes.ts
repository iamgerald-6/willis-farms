export interface SkillLogSectionDef {
  title: string;
  skills: string[];
}

/** Competency sections + skills per log type */
export const SKILL_LOG_TYPES: Record<string, SkillLogSectionDef[]> = {
  "GP Breeding & Farrowing (Integrated)": [
    {
      title: "Animal Identification and Section Basics",
      skills: [
        "Identifies sows correctly",
        "Identifies gilts correctly",
        "Recognises section groupings and pen layout",
        "Handles movement within section correctly",
        "Maintains calm animal-handling discipline",
        "Respects genetic-tier handling rules",
      ],
    },
    {
      title: "Heat Detection and Breeding Support",
      skills: [
        "Supports boar exposure routine correctly",
        "Observes and reports heat signs accurately",
        "Identifies sow/gilt readiness for service",
        "Prepares breeding/service area correctly",
        "Maintains breeding-area hygiene",
        "Assists AI process only within authorised scope",
        "Escalates irregular reproductive observations promptly",
      ],
    },
    {
      title: "Artificial Insemination (AI) Competence",
      skills: [
        "Understands AI timing and breeding workflow discipline",
        "Understands role limits in AI activities",
        "Prepares AI area and equipment correctly",
        "Maintains AI hygiene and contamination-control standards",
        "Confirms identification of breeding females correctly",
        "Supports proper restraint and handling for AI procedures",
        "Supports AI process in correct sequence",
        "Performs AI only within trained and authorised scope",
        "Maintains discipline in timing and service flow",
        "Completes AI records accurately and promptly",
        "Reports returns, irregular discharge, poor response, or abnormalities promptly",
        "Maintains biosecurity, tier-discipline, and PPE compliance during AI routines",
        "Reinforces AI standards among junior staff",
        "Identifies AI workflow problems and escalates them appropriately",
      ],
    },
    {
      title: "Gilt Development Support",
      skills: [
        "Supports gilt acclimatisation routines correctly",
        "Monitors gilt growth, conformation, and underline correctly",
        "Supports boar-exposure programme for gilts",
        "Records heat events for individual gilts accurately",
        "Identifies gilts approaching first service correctly",
        "Recognises gilts to be culled and reports appropriately",
      ],
    },
    {
      title: "Gestation and Sow Management",
      skills: [
        "Observes appetite and feeding response correctly",
        "Observes body condition appropriately",
        "Reports lameness, weakness, or distress promptly",
        "Monitors water access and reports issues",
        "Supports section movement and grouping discipline",
        "Maintains barn cleanliness and order",
        "Supports pregnancy-confirmation routines correctly",
      ],
    },
    {
      title: "Records and Compliance",
      skills: [
        "Completes routine section records accurately",
        "Records observations clearly and legibly",
        "Reports missing or unusual data promptly",
        "Follows SOPs consistently",
        "Complies with PPE requirements",
        "Maintains strict biosecurity discipline",
        "Maintains strict genetic-tier discipline",
      ],
    },
    {
      title: "Farrowing Room Preparation",
      skills: [
        "Prepares farrowing space correctly",
        "Maintains room hygiene standards",
        "Ensures equipment and materials are ready",
        "Supports sow readiness checks correctly",
        "Maintains orderly and clean farrowing workflow",
      ],
    },
    {
      title: "Sow and Piglet Observation",
      skills: [
        "Observes sow behaviour and readiness signs",
        "Identifies sow distress and reports promptly",
        "Identifies weak or chilled piglets",
        "Observes piglet vitality correctly",
        "Reports litter abnormalities promptly",
        "Identifies crushing risk situations",
        "Recognises mastitis, metritis, and agalactia signs and reports promptly",
      ],
    },
    {
      title: "Piglet Care",
      skills: [
        "Supports piglet-care protocols correctly",
        "Handles piglets carefully and correctly",
        "Supports colostrum management correctly",
        "Supports litter checks consistently",
        "Supports cross-fostering activities correctly where instructed",
        "Maintains piglet-care hygiene standards",
        "Escalates piglet mortality or welfare concerns promptly",
      ],
    },
    {
      title: "Farrowing Records and Compliance",
      skills: [
        "Records litter and piglet-care events accurately",
        "Completes farrowing checklists correctly",
        "Maintains farrowing-room records on time",
        "Follows farrowing SOPs consistently",
        "Complies with PPE requirements",
        "Maintains strict biosecurity discipline",
        "Maintains strict tier-discipline (litter-to-sow-to-tier linkage)",
      ],
    },
  ],
  "Feed Preparation (L1-L3 Duty)": [
    {
      title: "Ingredient Receipt and Quality Control",
      skills: [
        "Receives ingredients against supplier documentation correctly",
        "Performs visual quality and weighing checks correctly",
        "Submits mycotoxin samples per the Veterinarian's protocol",
        "Records ingredient batch IDs in the goods-received register",
        "Recognises and rejects out-of-spec ingredients",
      ],
    },
    {
      title: "Ingredient Storage",
      skills: [
        "Applies first-in / first-out rotation correctly",
        "Maintains moisture and pest control in the ingredient store",
        "Separates ingredient categories correctly",
        "Conducts weekly stock checks and reports low cover promptly",
      ],
    },
    {
      title: "Milling and Mixing",
      skills: [
        "Operates the mill safely (PPE, lockout, safety guards)",
        "Achieves target particle size (70% in 0.4-1.1 mm; minimal less than 0.2 mm)",
        "Mixes batches strictly to the veterinary-approved formulation",
        "Executes mill cleaning between rations correctly",
        "Identifies and escalates mixing or milling faults promptly",
      ],
    },
    {
      title: "Bagging, Dispatch, and Handling",
      skills: [
        "Bags finished feed in 50 kg sacks accurately",
        "Labels sacks correctly (ration, date, batch ID)",
        "Places sacks at the dispatch pad per the handover protocol",
        "Safely lifts and carries 50 kg sacks using correct manual-handling technique",
        "Coordinates two-person handling for awkward loads where required",
      ],
    },
    {
      title: "Mill Biosecurity and Records",
      skills: [
        "Wears designated mill-day PPE; observes the mill-zone discipline",
        "Showers and changes correctly before re-entering the GP barn after a milling shift",
        "Completes batch records fully",
        "Completes the daily handoff log at the dispatch pad",
        "Escalates ingredient quality, formulation, or biosecurity concerns immediately",
      ],
    },
  ],
  "Daily Barn Cleaning and Sanitation": [
    {
      title: "Daily Cleaning Routines",
      skills: [
        "Performs daily pen cleaning correctly",
        "Cleans feeders and drinkers daily; checks drinker flow",
        "Sweeps and washes passageways, anterooms, and equipment storage",
        "Maintains section-specific tool discipline",
        "Wears clean PPE at shift start; bags soiled PPE for laundry per protocol",
      ],
    },
    {
      title: "Wet-and-Dry Cleaning and Disinfection (Between Batches)",
      skills: [
        "Executes complete wash, disinfection, and drying of farrowing crates and rooms",
        "Selects and applies the correct disinfectant at the correct concentration",
        "Confirms dry time before re-stocking",
        "Cleans cleaning equipment after use",
      ],
    },
    {
      title: "Manure Handling and Records",
      skills: [
        "Collects manure and transports to the designated pit correctly",
        "Disinfects manure-handling equipment after each use",
        "Completes the daily cleaning log accurately",
        "Submits the log for weekly audit by the L4 Herd Supervisor/Manager",
      ],
    },
  ],
  "Incoming Semen Receiving (Multiplication Farm)": [
    {
      title: "Receipt, Inspection, and Storage",
      skills: [
        "Verifies supplier documentation on each delivery",
        "Checks transport temperature, packaging integrity, and labelling on receipt",
        "Performs incoming-dose visual and motility acceptance check per the receiving SOP",
        "Records each accepted dose against supplier batch and intended service group",
        "Stores received doses correctly (temperature, rotation, shelf-life)",
        "Rejects and escalates any out-of-specification semen per the SOP",
      ],
    },
  ],
  "Grower-Finisher (Multiplication Farm Output)": [
    {
      title: "Weaner, Grower, and Finisher Husbandry",
      skills: [
        "Identifies animals by class correctly",
        "Follows phase-feeding programme correctly",
        "Checks feeders and water access correctly",
        "Maintains pen cleanliness and order",
        "Maintains correct stocking density",
        "Observes appetite, behaviour, and welfare correctly",
        "Recognises and reports lameness, tail-biting, skin issues, respiratory signs promptly",
      ],
    },
    {
      title: "Growth Monitoring",
      skills: [
        "Supports weighing protocols correctly",
        "Records pen and batch weights accurately",
        "Calculates batch ADG correctly (L3+)",
        "Identifies under-performing animals or pens and reports",
        "Identifies dispatch-ready animals against weight targets",
      ],
    },
    {
      title: "Mortality and Welfare",
      skills: [
        "Records mortality daily with cause-of-death note",
        "Supports post-mortem activities under veterinary direction",
        "Handles welfare interventions per SOP and veterinary instruction",
        "Manages sick pens and recovery animals correctly",
        "Escalates unusual mortality patterns immediately",
      ],
    },
    {
      title: "Dispatch Preparation and Loading",
      skills: [
        "Confirms dispatch readiness against weight band",
        "Confirms withdrawal-period clearance with the Veterinarian",
        "Confirms animal ID against dispatch list",
        "Loads animals calmly and safely; uses correct ramp angle and gates",
        "Refuses dispatch of welfare- or health-compromised animals",
        "Completes dispatch documentation correctly",
        "Maintains transport biosecurity (vehicle cleaned, driver briefed)",
      ],
    },
    {
      title: "Biosecurity, Hygiene, and Records",
      skills: [
        "Maintains separation between grower-finisher and breeding-side flows",
        "Performs end-of-batch cleaning and disinfection correctly",
        "Records all feed deliveries, mortality, treatments, and dispatch movements accurately",
        "Complies with PPE requirements",
        "Maintains strict biosecurity discipline",
      ],
    },
  ],
};
