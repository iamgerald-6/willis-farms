import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeInterviewFormData, type JobApplication } from "@/lib/careers/types";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import { inferGradeLevel } from "@/lib/careers/hrEmployeeDefaults";
import { fetchModuleConfig } from "@/lib/systemDefinitions/getModuleConfig";
import { resolveSalaryForGradeTier, formatGrossSalaryAmount } from "@/lib/systemDefinitions/salaryRanges";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";
import { fetchRequiredMedicalReports } from "@/lib/systemDefinitions/onboardingMedicalReports";

export type OfferLetterContext = {
  candidateName: string;
  candidateEmail: string;
  roleTitle: string;
  referenceNumber: string;
  recommendedStartDate?: string;
  gradeLevel?: string;
  salaryGhs?: string;
  salaryRange?: string;
  salaryTier?: string;
  payFrequency?: string;
  employmentType?: string;
  department?: string;
  workLocation?: string;
  medicalReports: string[];
  letterDate: string;
  salaryDisplay?: string;
  /** Position title of the manager this hire reports to (see reporting_to on OnboardingHrData). */
  reportingTo?: string;
  noticePeriod?: string;
  workingHours?: string;
  /** Formatted for display — e.g. "20 September 2026". */
  acceptanceDeadline?: string;
  /** Annex 1 compensation breakdown — entered by HR verbatim, never computed here. */
  basicSalaryGhs?: string;
  housingAllowance?: string;
  medicalAllowance?: string;
  socialSecurityContribution?: string;
  incomeTax?: string;
  netPayable?: string;
  /** Sign-off — who signed the letter and how (Stage 3). */
  signerName?: string;
  signerTitle?: string;
  signatureType?: "typed" | "drawn";
  signatureText?: string;
  signatureImageUrl?: string;
};

function formatDisplayDate(raw: string | null | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function resolveOfferLetterContext(
  supabase: SupabaseClient,
  application: JobApplication,
  hr: OnboardingHrData = {},
): Promise<OfferLetterContext> {
  const formData = normalizeInterviewFormData(application.interview_form_data);
  const moduleConfig = await fetchModuleConfig(supabase, RECRUITMENT_MODULE_ID);
  const gradeConfig = moduleConfig.businessLogic.gradeLevelsConfig;

  const gradeLevel =
    hr.grade_level?.trim().toUpperCase() ||
    inferGradeLevel(application.role_slug, hr, gradeConfig) ||
    undefined;

  const salaryTier = hr.salary_tier?.trim().toLowerCase() || "mid";
  const salary = gradeLevel
    ? resolveSalaryForGradeTier(gradeLevel, salaryTier, gradeConfig)
    : { salaryGhs: "", formatted: "", tier: salaryTier };

  const medicalReports = await fetchRequiredMedicalReports(supabase);

  const salaryGhs = hr.salary_ghs?.trim() || salary.salaryGhs || undefined;
  const payFrequency = hr.pay_frequency?.trim() || undefined;

  const acceptanceDeadline = formatDisplayDate(hr.acceptance_deadline);
  // Offer Terms' start_date is the single source of truth for the offer letter's
  // appointment/effective date; fall back to the older interview-summary value
  // only for offers generated before this field existed.
  const recommendedStartDate =
    formatDisplayDate(hr.start_date) ||
    formData.summary?.recommended_start_date?.trim() ||
    undefined;

  return {
    candidateName: application.full_name,
    candidateEmail: application.email,
    roleTitle: hr.position_title?.trim() || application.role_title,
    referenceNumber: application.reference_number,
    recommendedStartDate,
    gradeLevel,
    salaryGhs,
    salaryRange: hr.salary_range?.trim() || salary.formatted || undefined,
    salaryTier: hr.salary_tier?.trim() || salary.tier || salaryTier,
    payFrequency,
    employmentType: hr.employment_type?.trim() || undefined,
    department: hr.department?.trim() || undefined,
    workLocation: hr.work_location?.trim() || undefined,
    medicalReports,
    salaryDisplay: formatGrossSalaryAmount(salaryGhs) ?? undefined,
    letterDate: new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    reportingTo: hr.reporting_to?.trim() || undefined,
    noticePeriod: hr.notice_period?.trim() || undefined,
    workingHours: hr.working_hours?.trim() || undefined,
    acceptanceDeadline,
    basicSalaryGhs: hr.basic_salary_ghs?.trim() || undefined,
    housingAllowance: hr.housing_allowance?.trim() || undefined,
    medicalAllowance: hr.medical_allowance?.trim() || undefined,
    socialSecurityContribution: hr.social_security_contribution?.trim() || undefined,
    incomeTax: hr.income_tax?.trim() || undefined,
    netPayable: hr.net_payable?.trim() || undefined,
    signerName: hr.signer_name?.trim() || undefined,
    signerTitle: hr.signer_title?.trim() || undefined,
    signatureType: hr.signature_type,
    signatureText: hr.signature_text?.trim() || undefined,
    signatureImageUrl: hr.signature_image?.secure_url || undefined,
  };
}
