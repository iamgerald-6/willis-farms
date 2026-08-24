export type RefereeRating = "Excellent" | "Good" | "Fair" | "Poor" | "N/A" | "";

export const REFEREE_ASSESSMENT_ATTRIBUTES = [
  { key: "reliability_attendance", label: "Reliability & attendance" },
  { key: "honesty_integrity", label: "Honesty & integrity" },
  { key: "quality_of_work", label: "Quality of work" },
  { key: "teamwork_attitude", label: "Teamwork & attitude" },
  { key: "ability_follow_instructions", label: "Ability to follow instructions" },
  { key: "health_safety_awareness", label: "Health & safety awareness" },
  { key: "job_specific_competence", label: "Job-specific technical competence" },
  { key: "confidential_information", label: "Handling of confidential information" },
  { key: "supervision_leadership", label: "Supervision / leadership (if applicable)" },
  { key: "animal_handling_welfare", label: "Animal handling & welfare conduct (if applicable)" },
  { key: "biosecurity_hygiene", label: "Biosecurity / hygiene discipline (if applicable)" },
] as const;

export type RefereeAssessmentKey = (typeof REFEREE_ASSESSMENT_ATTRIBUTES)[number]["key"];

export interface RefereeReferenceFormData {
  referee?: {
    full_name?: string;
    organisation_position?: string;
    phone?: string;
    email?: string;
    relationship?: string;
    known_duration_capacity?: string;
  };
  assessment?: Partial<Record<RefereeAssessmentKey, RefereeRating>>;
  main_duties?: string;
  would_recommend?: "Yes" | "No" | "";
  recommend_explanation?: string;
  concerns?: string;
  other_comments?: string;
  declaration?: {
    signature_name?: string;
    signature_date?: string;
  };
}

export interface RefereeContactFromApplication {
  index: number;
  name: string;
  phone: string;
  email: string;
  relationship: string;
}

export interface RefereeSubmissionSummary {
  referee_index: number;
  referee_name: string;
  referee_email: string;
  relationship: string;
  phone: string;
  submitted_at: string | null;
  form_data: RefereeReferenceFormData;
}

export function extractRefereesFromApplication(
  formData: Record<string, unknown> | null | undefined,
  maxSlots = 5,
): RefereeContactFromApplication[] {
  if (!formData) return [];

  const slots: RefereeContactFromApplication[] = [];
  for (let i = 1; i <= maxSlots; i++) {
    const name = String(formData[`reference_${i}_name`] ?? "").trim();
    const phone = String(formData[`reference_${i}_phone`] ?? "").trim();
    const email = String(formData[`reference_${i}_email`] ?? "").trim().toLowerCase();
    const relationship = String(formData[`reference_${i}_relationship`] ?? "").trim();
    if (!name && !email) continue;
    slots.push({
      index: i as RefereeContactFromApplication["index"],
      name,
      phone,
      email,
      relationship,
    });
  }

  return slots.filter((s) => s.name && s.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email));
}

export function emptyRefereeReferenceForm(
  contact?: Partial<RefereeContactFromApplication>,
): RefereeReferenceFormData {
  return {
    referee: {
      full_name: contact?.name ?? "",
      phone: contact?.phone ?? "",
      email: contact?.email ?? "",
      relationship: contact?.relationship ?? "",
      organisation_position: "",
      known_duration_capacity: "",
    },
    assessment: {},
    main_duties: "",
    would_recommend: "",
    recommend_explanation: "",
    concerns: "",
    other_comments: "",
    declaration: {
      signature_name: contact?.name ?? "",
      signature_date: new Date().toISOString().slice(0, 10),
    },
  };
}

export function mergeRefereeReferenceForm(
  raw: RefereeReferenceFormData | null | undefined,
  contact?: Partial<RefereeContactFromApplication>,
): RefereeReferenceFormData {
  const base = emptyRefereeReferenceForm(contact);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    referee: { ...base.referee, ...raw.referee },
    assessment: { ...base.assessment, ...raw.assessment },
    declaration: { ...base.declaration, ...raw.declaration },
  };
}
