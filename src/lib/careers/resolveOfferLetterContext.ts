import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeInterviewFormData, type JobApplication } from "@/lib/careers/types";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import { inferGradeLevel } from "@/lib/careers/hrEmployeeDefaults";
import { fetchGradeLevelsConfig } from "@/lib/grades/fetchGradeLevelsConfig";
import { formatGrossSalaryAmount } from "@/lib/systemDefinitions/salaryRanges";
import { fetchRequiredMedicalReports } from "@/lib/systemDefinitions/onboardingMedicalReports";
import {
  canBeAssignedAsSupervisorAtOnboardingByRoleLabel,
  resolveUserRoleLabelById,
} from "@/lib/userRoleAccessControl";
import { formatNoticePeriodForOfferLetter } from "@/lib/careers/noticePeriod";

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
  /** Role this hire reports into (job title only, never a person's name —
   * see resolveReportingToRole below), for use in the offer letter itself.
   * The Offer Terms / Section O forms separately show and store the actual
   * "Name (Role)" in hr.reporting_to for HR's own reference. */
  reportingTo?: string;
  noticePeriod?: string;
  noticePeriodFrequency?: string;
  /** Combined display — e.g. "12 Week(s)" for the offer letter. */
  noticePeriodDisplay?: string;
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

/**
 * The offer letter document should only ever state the ROLE this hire
 * reports into (e.g. "Assistant Farm Manager"), never a specific person's
 * name — unlike the Offer Terms / Section O forms, which intentionally show
 * "Name (Role)" so HR can see exactly who was picked. This re-derives the
 * role live from the saved supervisor_id each time a letter is generated,
 * confirming their role still qualifies as a line manager (Supervisory,
 * Executive, or HR), rather than trusting whatever's stored in
 * hr.reporting_to (which is "Name (Role)" text meant for the HR-facing
 * forms). Falls back to hr.reporting_to only if there's no supervisor_id on
 * file or that person no longer qualifies — covers offers saved before
 * supervisor_id existed.
 */
async function resolveReportingToRole(
  supabase: SupabaseClient,
  hr: OnboardingHrData,
): Promise<string | undefined> {
  const supervisorId = hr.supervisor_id?.trim();
  if (supervisorId) {
    const { data: supervisor } = await supabase
      .from("users")
      .select("job_position, user_role_id")
      .eq("user_id", supervisorId)
      .maybeSingle();
    if (supervisor?.job_position?.trim()) {
      const roleLabel = await resolveUserRoleLabelById(supabase, supervisor.user_role_id);
      if (canBeAssignedAsSupervisorAtOnboardingByRoleLabel(roleLabel)) {
        return supervisor.job_position.trim();
      }
    }
  }
  return hr.reporting_to?.trim() || undefined;
}

export async function resolveOfferLetterContext(
  supabase: SupabaseClient,
  application: JobApplication,
  hr: OnboardingHrData = {},
): Promise<OfferLetterContext> {
  const formData = normalizeInterviewFormData(application.interview_form_data);
  const gradeConfig = await fetchGradeLevelsConfig(supabase);

  const gradeLevel =
    hr.grade_level?.trim().toUpperCase() ||
    inferGradeLevel(hr, gradeConfig) ||
    undefined;

  const medicalReports = await fetchRequiredMedicalReports(supabase);
  const reportingToRole = await resolveReportingToRole(supabase, hr);

  const salaryGhs = hr.salary_ghs?.trim() || undefined;
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
    salaryRange: hr.salary_range?.trim() || undefined,
    salaryTier: hr.salary_tier?.trim() || undefined,
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
    reportingTo: reportingToRole,
    noticePeriod: hr.notice_period?.trim() || undefined,
    noticePeriodFrequency: hr.notice_period_frequency?.trim() || undefined,
    noticePeriodDisplay: formatNoticePeriodForOfferLetter(
      hr.notice_period,
      hr.notice_period_frequency,
    ),
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
