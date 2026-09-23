import type { MedicalFormSchema, MedicalSection } from "./medicalFormSchema";
import { HEARING_RESULT_OPTIONS, VISUAL_ACUITY_RESULT_OPTIONS } from "./medicalClinicalVitals";
import { MEDICAL_INVESTIGATION_DEFS } from "./medicalInvestigationDefs";

const YES_NO = ["Yes", "No"];

/** Job categories from the occupational medical examination form (Part 1 matrix). */
export const MEDICAL_JOB_CATEGORY_OPTIONS = [
  {
    value: "Animal contact (breeding, farrowing, nursery, grow-out, herd health)",
    label: "A — Animal contact (breeding, farrowing, nursery, grow-out, herd health)",
  },
  {
    value: "Machinery / maintenance / drivers",
    label: "B — Machinery / maintenance / drivers",
  },
  {
    value: "Feed mill / stores",
    label: "C — Feed mill / stores",
  },
  {
    value: "Office, admin, sales, genetics & data",
    label: "D — Office, admin, sales, genetics & data",
  },
] as const;

/** Map legacy stored values (A/B/C/D) to the full category label. */
export function resolveMedicalJobCategory(stored: string | null | undefined): string | undefined {
  if (!stored?.trim()) return undefined;
  const trimmed = stored.trim();
  const byValue = MEDICAL_JOB_CATEGORY_OPTIONS.find((o) => o.value === trimmed);
  if (byValue) return byValue.value;
  const byLetter = MEDICAL_JOB_CATEGORY_OPTIONS.find((o) =>
    o.label.startsWith(`${trimmed} —`),
  );
  if (byLetter) return byLetter.value;
  return trimmed;
}

/** Default occupational medical form (Parts 2–6). Part 1 referral is HR-side only. */
export function getDefaultMedicalFormSchema(): MedicalFormSchema {
  return {
    title: "Occupational Medical Examination Form",
    intro:
      "Parts 2–6 are completed at the designated medical facility. " +
      "Clinical detail is confidential. Submit the completed form directly to Wills Farms HR — not through the employee.",
    sections: [
      {
        kind: "table",
        key: "medical_history",
        title: "Part 2 — Medical history",
        helpText:
          "Complete with the candidate. Tick Yes or No for each item and give details where applicable.",
        minRows: 11,
        columns: [
          { key: "item", label: "History item", type: "text" },
          { key: "yes_no", label: "Yes / No", type: "select", options: YES_NO },
          { key: "details", label: "Details", type: "text" },
        ],
      },
      {
        kind: "fields",
        key: "clinical_vitals",
        title: "Part 3 — Clinical examination (vitals)",
        helpText: "BMI is calculated automatically from height and weight.",
        fields: [
          { key: "height_cm", label: "Height (cm)", type: "number", required: true },
          { key: "weight_kg", label: "Weight (kg)", type: "number", required: true },
          { key: "bmi", label: "BMI (automatic)", type: "text" },
          { key: "bp_systolic", label: "Blood pressure — systolic (mmHg)", type: "number", required: true },
          { key: "bp_diastolic", label: "Blood pressure — diastolic (mmHg)", type: "number", required: true },
          { key: "pulse", label: "Pulse (bpm)", type: "text", required: true },
          {
            key: "visual_acuity_right",
            label: "Visual acuity — right eye",
            type: "select",
            required: true,
            options: [...VISUAL_ACUITY_RESULT_OPTIONS],
          },
          {
            key: "visual_acuity_left",
            label: "Visual acuity — left eye",
            type: "select",
            required: true,
            options: [...VISUAL_ACUITY_RESULT_OPTIONS],
          },
          {
            key: "hearing_left",
            label: "Hearing — left ear",
            type: "select",
            required: true,
            options: [...HEARING_RESULT_OPTIONS],
          },
          {
            key: "hearing_right",
            label: "Hearing — right ear",
            type: "select",
            required: true,
            options: [...HEARING_RESULT_OPTIONS],
          },
        ],
      },
      {
        kind: "table",
        key: "clinical_systems",
        title: "Part 3 — Systems examination",
        minRows: 8,
        columns: [
          { key: "system", label: "System", type: "text" },
          {
            key: "finding",
            label: "Normal / Abnormal",
            type: "select",
            options: ["Normal", "Abnormal"],
          },
          { key: "comments", label: "Findings / comments", type: "text" },
        ],
      },
      {
        kind: "fields",
        key: "investigations",
        title: "Part 4 — Investigations",
        fields: [],
        // Side-channel property (not part of the generic PIP section shape) —
        // seeds the admin-editable Part 4 test list. See getInvestigationDefs
        // / setInvestigationDefs in medicalFormSchema.ts.
        investigationDefs: JSON.parse(JSON.stringify(MEDICAL_INVESTIGATION_DEFS)),
      } as unknown as MedicalSection,
      {
        kind: "fields",
        key: "physician_report",
        title: "Part 5 — Physician's report",
        fields: [
          {
            key: "narrative",
            label: "Summary of history, findings, investigations, and clinical impression",
            type: "textarea",
            required: true,
          },
        ],
      },
      {
        kind: "fields",
        key: "fitness",
        title: "Part 6 — Fitness determination",
        fields: [
          {
            key: "fitness",
            label: "Assessed against job demands in referral (Part 1)",
            type: "select",
            required: true,
            options: [
              "Fit",
              "Fit with restrictions",
              "Temporarily unfit",
              "Not fit for this role",
            ],
          },
          {
            key: "restrictions",
            label: "Restrictions or accommodations (if any)",
            type: "textarea",
          },
          {
            key: "swine_contact_fit",
            label: "Fit for daily swine contact and barn environment work?",
            type: "select",
            required: true,
            options: ["Yes", "No", "N/A"],
          },
          {
            key: "next_review",
            label: "Recommended next periodic review",
            type: "text",
          },
          { key: "physician_name", label: "Physician's name", type: "text", required: true },
          { key: "facility_name", label: "Facility name", type: "text", required: true },
          { key: "examination_date", label: "Date of examination", type: "date", required: true },
          { key: "physician_signature", label: "Physician signature (type full name)", type: "text", required: true },
        ],
      },
    ],
  };
}

export const MEDICAL_HISTORY_ITEMS = [
  "Chronic illness (diabetes, hypertension, heart disease, etc.)",
  "Asthma, allergies, or other respiratory conditions",
  "Skin conditions (eczema, dermatitis)",
  "Epilepsy, fits, blackouts, or fainting episodes",
  "Back, joint, or musculoskeletal problems",
  "Previous surgery or hospital admission",
  "Current medications",
  "Known drug or food allergies",
  "Tetanus vaccination in the last 10 years",
  "Previous occupational illness or injury claim",
  "Prior work with livestock; any zoonotic illness (e.g. brucellosis)",
];

export const CLINICAL_SYSTEM_ROWS = [
  "Cardiovascular",
  "Respiratory",
  "Musculoskeletal (incl. lifting capacity)",
  "Skin",
  "ENT / eyes",
  "Abdomen",
  "Neurological",
  "Mental wellbeing (brief screen)",
];

