import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import type { GradeLevelsConfig } from "@/lib/systemDefinitions/gradeLevelsConfig";
import { validateGrossSalaryAgainstBand } from "@/lib/systemDefinitions/salaryRanges";

/** HR fields captured on the Offer tab before generating the offer letter. */
export const OFFER_TERMS_FIELD_KEYS = [
  "position_title",
  "grade_level",
  "salary_tier",
  "salary_ghs",
  "pay_frequency",
  "department",
  "employment_type",
  "work_location",
  "reporting_to",
  "start_date",
  "notice_period",
  "notice_period_frequency",
  "working_hours",
  "acceptance_deadline",
  "basic_salary_ghs",
  "housing_allowance",
  "medical_allowance",
  "social_security_contribution",
  "income_tax",
  "net_payable",
  "hr_notes",
] as const;

export type OfferTermsFieldKey = (typeof OFFER_TERMS_FIELD_KEYS)[number];

/** Locked on the Onboarding tab once offer terms are saved. */
export const OFFER_TERMS_LOCKED_FIELD_KEYS: OfferTermsFieldKey[] = [
  "position_title",
  "grade_level",
  "salary_tier",
  "salary_ghs",
  "pay_frequency",
  "department",
  "employment_type",
  "work_location",
  "reporting_to",
  "start_date",
  "notice_period",
  "notice_period_frequency",
  "working_hours",
  "acceptance_deadline",
  "basic_salary_ghs",
  "housing_allowance",
  "medical_allowance",
  "social_security_contribution",
  "income_tax",
  "net_payable",
];

const REQUIRED_OFFER_TERM_KEYS: OfferTermsFieldKey[] = [
  "position_title",
  "grade_level",
  "salary_tier",
  "salary_ghs",
  "pay_frequency",
  "department",
  "employment_type",
  "work_location",
  "reporting_to",
  "start_date",
  "notice_period",
  "notice_period_frequency",
  "working_hours",
  "acceptance_deadline",
  "basic_salary_ghs",
  "housing_allowance",
  "medical_allowance",
  "social_security_contribution",
  "income_tax",
  "net_payable",
  "hr_notes",
];

const FIELD_LABELS: Record<OfferTermsFieldKey, string> = {
  position_title: "Role / position title",
  grade_level: "Grade level",
  salary_tier: "Salary tier",
  salary_ghs: "Gross salary (GHS)",
  pay_frequency: "Pay frequency",
  department: "Department",
  employment_type: "Employment type",
  work_location: "Work location",
  reporting_to: "Reporting to",
  start_date: "Start date",
  notice_period: "Notice period",
  notice_period_frequency: "Notice period frequency",
  working_hours: "Working hours",
  acceptance_deadline: "Offer acceptance deadline",
  basic_salary_ghs: "Basic salary (GHS)",
  housing_allowance: "Housing allowance",
  medical_allowance: "Medical allowance",
  social_security_contribution: "Social security contribution",
  income_tax: "Income tax",
  net_payable: "Net payable",
  hr_notes: "HR notes",
};

export function validateOfferTerms(
  hr: OnboardingHrData | null | undefined,
  // Kept for call-site compatibility; no longer used — salary-band
  // validation only ever runs against the posting-sourced band (see below).
  _gradeConfig?: GradeLevelsConfig,
): {
  valid: boolean;
  missing: OfferTermsFieldKey[];
  message: string | null;
} {
  const missing = REQUIRED_OFFER_TERM_KEYS.filter(
    (key) => !String(hr?.[key] ?? "").trim(),
  );
  if (missing.length > 0) {
    const labels = missing.map((key) => FIELD_LABELS[key]).join(", ");
    return {
      valid: false,
      missing,
      message: `Complete offer terms before continuing: ${labels}.`,
    };
  }

  // The posting's own Salary field is the sole source of truth for a
  // salary band. If the posting has no band, there's nothing to validate
  // against — skip band validation entirely rather than falling back to
  // the legacy grade-tier pay table.
  if (hr?.salary_band_min != null || hr?.salary_band_max != null) {
    const bandCheck = validateGrossSalaryAgainstBand(
      hr?.salary_ghs,
      hr?.salary_band_min,
      hr?.salary_band_max,
    );
    if (!bandCheck.valid) {
      return {
        valid: false,
        missing: [],
        message: bandCheck.message,
      };
    }
  }

  return { valid: true, missing: [], message: null };
}

export { formatGrossSalaryAmount } from "@/lib/systemDefinitions/salaryRanges";
