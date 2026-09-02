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
};

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

  return {
    candidateName: application.full_name,
    candidateEmail: application.email,
    roleTitle: hr.position_title?.trim() || application.role_title,
    referenceNumber: application.reference_number,
    recommendedStartDate: formData.summary?.recommended_start_date?.trim() || undefined,
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
  };
}
