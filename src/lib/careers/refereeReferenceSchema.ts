import {
  REFEREE_ASSESSMENT_ATTRIBUTES,
  type RefereeReferenceFormData,
} from "@/lib/careers/refereeReferenceTypes";
import type { RefereeAssessmentAttributeDef } from "@/lib/systemDefinitions/refereeReferenceConfig";

const VALID_RATINGS = new Set(["Excellent", "Good", "Fair", "Poor", "N/A"]);

export function validateRefereeReferenceForm(
  form: RefereeReferenceFormData,
  attributes: RefereeAssessmentAttributeDef[] = REFEREE_ASSESSMENT_ATTRIBUTES.map(
    (a) => ({ key: a.key, label: a.label }),
  ),
): string[] {
  const errors: string[] = [];

  if (!form.referee?.full_name?.trim()) {
    errors.push("Please enter your full name.");
  }
  if (!form.referee?.organisation_position?.trim()) {
    errors.push("Please enter your organisation and position.");
  }
  if (!form.referee?.relationship?.trim()) {
    errors.push("Please describe your relationship to the applicant.");
  }
  if (!form.referee?.known_duration_capacity?.trim()) {
    errors.push("Please state how long and in what capacity you have known the applicant.");
  }

  for (const attr of attributes) {
    const rating = form.assessment?.[attr.key as keyof NonNullable<typeof form.assessment>];
    if (!rating || !VALID_RATINGS.has(rating)) {
      errors.push(`Please rate: ${attr.label}.`);
    }
  }

  if (!form.main_duties?.trim()) {
    errors.push("Please describe the applicant's main duties when you worked together.");
  }

  if (form.would_recommend !== "Yes" && form.would_recommend !== "No") {
    errors.push("Please indicate whether you would re-employ or recommend this person.");
  }
  if (!form.recommend_explanation?.trim()) {
    errors.push("Please explain your recommendation answer.");
  }

  if (!form.declaration?.signature_name?.trim()) {
    errors.push("Please type your full name as signature.");
  }
  if (!form.declaration?.signature_date?.trim()) {
    errors.push("Please enter the date of your declaration.");
  }

  return errors;
}
