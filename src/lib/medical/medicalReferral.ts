import type { OnboardingFormData, OnboardingHrData } from "@/lib/careers/onboardingTypes";
import type { MedicalReferralData } from "./medicalFormSchema";
import { resolveMedicalJobCategory } from "./medicalFormDefaults";

function hrText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

type ApplicationRow = {
  full_name?: string | null;
  reference_number?: string | null;
  role_title?: string | null;
  location?: string | null;
  application_form_data?: Record<string, unknown> | null;
};

export function buildMedicalReferralData(params: {
  application: ApplicationRow;
  formData?: OnboardingFormData | null;
  hrData?: OnboardingHrData | null;
  overrides?: Partial<MedicalReferralData>;
  issuedByName?: string | null;
}): MedicalReferralData {
  const { application, formData, hrData, overrides, issuedByName } = params;
  const personal = formData?.personal ?? {};
  const appForm = application.application_form_data ?? {};

  const ghanaCard =
    hrText(personal.ghana_card_no) ??
    hrText(appForm.ghana_card) ??
    hrText(appForm.ghana_card_number);
  const dob = hrText(personal.date_of_birth) ?? hrText(appForm.date_of_birth);
  const gender = hrText(personal.gender) ?? hrText(appForm.gender);

  const departmentSite = [hrText(hrData?.department), hrText(hrData?.work_location) ?? hrText(application.location)]
    .filter(Boolean)
    .join(" — ");

  return {
    full_name: hrText(application.full_name),
    reference_number: hrText(application.reference_number),
    employee_id: hrText(hrData?.employee_id),
    ghana_card: ghanaCard,
    date_of_birth: dob,
    gender,
    position_offered: hrText(application.role_title) ?? hrText(hrData?.job_title),
    department_site: departmentSite || undefined,
    examination_type: hrText(hrData?.medical_examination_type) ?? "Pre-employment",
    job_category: resolveMedicalJobCategory(hrText(hrData?.medical_job_category)),
    designated_facility: hrText(hrData?.medical_designated_facility),
    appointment_date: hrText(hrData?.medical_appointment_date),
    referral_date: new Date().toISOString().slice(0, 10),
    issued_by: hrText(issuedByName) ?? hrText(hrData?.medical_referral_issued_by),
    issued_by_name: hrText(issuedByName),
    ...overrides,
  };
}
