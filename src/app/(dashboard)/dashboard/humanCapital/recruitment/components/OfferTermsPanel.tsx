"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import { validateOfferTerms } from "@/lib/careers/offerTerms";
import { OFFER_TERMS_FIELDS_LIST } from "@/lib/systemDefinitions/onboardingHrDefaults";
import OnboardingHrFieldsForm from "./OnboardingHrFieldsForm";
import { useGradeLevelsConfig } from "@/hooks/useGradeLevelsConfig";
import { usePayrollTaxConfig } from "@/hooks/usePayrollTaxConfig";
import { computePayrollDeductions, parseSalaryAmount } from "@/lib/systemDefinitions/payrollTaxConfig";

type Props = {
  applicationId: string;
  roleTitle: string;
  onSaved: () => void;
};

export default function OfferTermsPanel({
  applicationId,
  roleTitle,
  onSaved,
}: Props) {
  const [hrData, setHrData] = useState<OnboardingHrData>({
    position_title: roleTitle,
  });
  const { config: gradeConfig } = useGradeLevelsConfig();
  const { config: payrollTaxConfig } = usePayrollTaxConfig();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["offer-letter", applicationId],
    queryFn: async () => {
      const res = await api.get(
        `/careers/onboarding/offer-letter?application_id=${applicationId}`,
      );
      return res.data.data as {
        hr_data: OnboardingHrData;
        offer_terms_saved_at: string | null;
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    setHrData((prev) => ({
      ...prev,
      ...data.hr_data,
      position_title: data.hr_data.position_title?.trim() || roleTitle,
    }));
  }, [data, roleTitle]);

  const { data: suggestions } = useQuery({
    queryKey: ["onboarding-hr-suggest-offer", applicationId],
    queryFn: async () => {
      const res = await api.get(
        `/careers/onboarding/suggest-hr-fields?application_id=${applicationId}`,
      );
      return res.data.data as {
        grade_level: string | null;
        salary_tier: string | null;
        salary_range: string | null;
        salary_ghs: string | null;
        salary_band_min: string | null;
        salary_band_max: string | null;
        position_title: string | null;
        employment_type: string | null;
        department: string | null;
        work_location: string | null;
      };
    },
  });

  // Fields the linked job posting can source directly (see
  // resolveOfferTermsFromPosting) — locked here (shown read-only below)
  // rather than typed by HR, so the offer letter always matches the
  // posting. Salary amount itself stays HR-entered; only the tier/range
  // hint it's validated against comes from the posting. Only actually
  // lock a field once the posting has supplied a value for it — an
  // application with no linked posting (from before this existed) falls
  // back to the old HR-fillable behavior instead of locking onto nothing.
  const postingLockedFields = (
    [
      ["position_title", suggestions?.position_title],
      ["employment_type", suggestions?.employment_type],
      ["department", suggestions?.department],
      ["work_location", suggestions?.work_location],
      ["grade_level", suggestions?.grade_level],
      ["salary_tier", suggestions?.salary_tier],
    ] as const
  )
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);

  useEffect(() => {
    if (!suggestions) return;
    setHrData((prev) => ({
      ...prev,
      position_title: suggestions.position_title || prev.position_title,
      employment_type: suggestions.employment_type || prev.employment_type,
      department: suggestions.department || prev.department,
      work_location: suggestions.work_location || prev.work_location,
      grade_level: suggestions.grade_level || prev.grade_level,
      salary_tier: suggestions.salary_tier || prev.salary_tier,
      salary_range: suggestions.salary_range || prev.salary_range,
      salary_band_min: suggestions.salary_band_min || prev.salary_band_min,
      salary_band_max: suggestions.salary_band_max || prev.salary_band_max,
      // salary_ghs is the one number HR actually enters — only default it
      // once, never overwrite something HR (or a saved offer) already has.
      salary_ghs: prev.salary_ghs?.trim() || suggestions.salary_ghs || prev.salary_ghs,
    }));
  }, [suggestions]);

  // Social security contribution, Income tax, and Net payable are derived
  // from Basic salary (GHS) — HR fills in the allowance fields manually,
  // these three are computed and shown read-only (see
  // computedReadOnlyFields below). Recomputes whenever the basic salary,
  // allowances, or the payroll tax settings (System Definitions > Offer
  // letter > Payroll tax settings) change; leaves them blank when basic
  // salary is empty or not a valid number rather than showing a
  // stale/zero figure. SSNIT and Income tax are based on basic salary
  // alone (allowances aren't SSNIT-deductible or taxed here); Net payable
  // is basic salary + housing + medical allowance, minus SSNIT and tax —
  // the actual amount the employee takes home.
  useEffect(() => {
    const basicSalary = parseSalaryAmount(hrData.basic_salary_ghs);
    if (basicSalary === null) {
      setHrData((prev) => {
        if (
          !prev.social_security_contribution &&
          !prev.income_tax &&
          !prev.net_payable &&
          !prev.employer_tier2_contribution
        ) {
          return prev;
        }
        return {
          ...prev,
          social_security_contribution: undefined,
          income_tax: undefined,
          net_payable: undefined,
          employer_tier2_contribution: undefined,
        };
      });
      return;
    }
    const otherAllowances =
      (parseSalaryAmount(hrData.housing_allowance) ?? 0) +
      (parseSalaryAmount(hrData.medical_allowance) ?? 0);
    const { ssnit, incomeTax, netPayable, employerTier2Contribution } = computePayrollDeductions(
      basicSalary,
      payrollTaxConfig,
      otherAllowances,
    );
    setHrData((prev) => ({
      ...prev,
      social_security_contribution: ssnit.toFixed(2),
      income_tax: incomeTax.toFixed(2),
      net_payable: netPayable.toFixed(2),
      // Only set when an Employer Tier 2 rate is actually configured —
      // stays blank (never "0.00") otherwise, so the field just reads
      // empty rather than implying a rate of zero was intentional.
      employer_tier2_contribution: payrollTaxConfig.employerTier2RatePercent
        ? employerTier2Contribution.toFixed(2)
        : undefined,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hrData.basic_salary_ghs,
    hrData.housing_allowance,
    hrData.medical_allowance,
    payrollTaxConfig,
  ]);

  const computedReadOnlyFields = [
    "social_security_contribution",
    "income_tax",
    "net_payable",
    "employer_tier2_contribution",
  ];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validation = validateOfferTerms(hrData, gradeConfig);
      if (!validation.valid) {
        throw new Error(validation.message ?? "Offer terms incomplete.");
      }
      // salary_range comes exclusively from the linked job posting's own
      // Salary field (see resolveOfferTermsFromPosting) — never recomputed
      // from the legacy grade-tier table here. If hrData already has one
      // (posting-sourced, or blank), it's kept as-is.
      const payload: OnboardingHrData = {
        ...data?.hr_data,
        ...hrData,
        position_title: hrData.position_title?.trim() || roleTitle,
        offer_terms_saved_at: new Date().toISOString(),
      };
      await api.patch("/careers/onboarding", {
        application_id: applicationId,
        hr_data: payload,
      });
    },
    onSuccess: () => {
      toast.success("Offer terms saved.");
      void refetch();
      onSaved();
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Save failed.");
    },
  });

  const validation = validateOfferTerms(hrData, gradeConfig);
  const termsSaved = Boolean(data?.offer_terms_saved_at);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">Offer terms</p>
        <p className="text-xs text-gray-500 mt-1">
          Role, grade, salary tier, department, employment type, and work location come
          straight from the job posting this applicant applied to — to change one of those,
          edit the job posting itself. Social security contribution and Income tax are
          calculated automatically from Basic salary (GHS); Net payable adds Housing and
          Medical allowance on top and subtracts both of those. Fill in the allowance fields
          manually. All of it will be locked once saved and prefilled during onboarding.
        </p>
      </div>

      {termsSaved && (
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Offer terms saved — you can create the offer letter below.
        </p>
      )}

      <OnboardingHrFieldsForm
        hrData={hrData}
        setHrData={setHrData}
        optionList={OFFER_TERMS_FIELDS_LIST}
        readOnlyFields={[...postingLockedFields, ...computedReadOnlyFields]}
        hideFieldHints
      />

      <button
        type="button"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
      >
        {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        {termsSaved ? "Update offer terms" : "Save offer terms"}
      </button>

      {!validation.valid && !termsSaved && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {validation.message}
        </p>
      )}
    </div>
  );
}

export function useOfferTermsReady(applicationId: string, enabled: boolean) {
  const { data } = useQuery({
    queryKey: ["offer-letter", applicationId],
    queryFn: async () => {
      const res = await api.get(
        `/careers/onboarding/offer-letter?application_id=${applicationId}`,
      );
      return res.data.data as {
        offer_terms_saved_at: string | null;
        hr_data: OnboardingHrData;
      };
    },
    enabled,
  });

  return Boolean(data?.offer_terms_saved_at && validateOfferTerms(data.hr_data).valid);
}
