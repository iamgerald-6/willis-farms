"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import {
  OFFER_TERMS_FIELD_KEYS,
  validateOfferTerms,
} from "@/lib/careers/offerTerms";
import { resolveSalaryForGradeTier } from "@/lib/systemDefinitions/salaryRanges";
import OnboardingHrFieldsForm from "./OnboardingHrFieldsForm";
import { useGradeLevelsConfig } from "@/hooks/useGradeLevelsConfig";

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
      };
    },
  });

  useEffect(() => {
    if (!suggestions || data?.offer_terms_saved_at) return;
    setHrData((prev) => ({
      ...prev,
      grade_level: prev.grade_level?.trim() || suggestions.grade_level || prev.grade_level,
      salary_tier: prev.salary_tier?.trim() || suggestions.salary_tier || prev.salary_tier,
      salary_range: prev.salary_range?.trim() || suggestions.salary_range || prev.salary_range,
      salary_ghs: prev.salary_ghs?.trim() || suggestions.salary_ghs || prev.salary_ghs,
    }));
  }, [suggestions, data?.offer_terms_saved_at]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validation = validateOfferTerms(hrData, gradeConfig);
      if (!validation.valid) {
        throw new Error(validation.message ?? "Offer terms incomplete.");
      }
      const salaryMeta = hrData.grade_level
        ? resolveSalaryForGradeTier(
            hrData.grade_level,
            hrData.salary_tier ?? "mid",
            gradeConfig,
          )
        : null;
      const payload: OnboardingHrData = {
        ...data?.hr_data,
        ...hrData,
        position_title: hrData.position_title?.trim() || roleTitle,
        salary_range: salaryMeta?.formatted || hrData.salary_range,
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
          Set role, compensation, and employment placement before creating the
          offer letter. These details will be prefilled and locked during
          onboarding.
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
        includeFieldKeys={[...OFFER_TERMS_FIELD_KEYS]}
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
