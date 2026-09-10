"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FileText, Loader2 } from "lucide-react";
import api from "@/lib/api";
import type { EmployeeOnboardingRecord } from "@/lib/careers/fetchEmployeeOnboardingRecord";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import CandidateProfileReview from "@/components/onboarding/CandidateProfileReview";
import OnboardingHrFieldsForm from "./OnboardingHrFieldsForm";
import {
  RECRUITMENT_MODULE_ID,
} from "@/lib/systemDefinitions/onboardingDefaults";
import {
  ONBOARDING_HR_FIELDS_LIST,
} from "@/lib/systemDefinitions/onboardingHrDefaults";
import {
  resolveOnboardingHrFields,
} from "@/lib/careers/onboardingHrFormSchema";
import type { SystemOption } from "@/lib/systemDefinitions";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Accra",
  });
}

export default function EmployeeOnboardingSection({
  userId,
  applicationId,
  fallbackName,
  referenceNumber,
}: {
  userId: string;
  applicationId: string | null;
  fallbackName: string;
  referenceNumber: string | null;
}) {
  const [profileOpen, setProfileOpen] = useState(false);

  const { data: record, isLoading, isError } = useQuery({
    queryKey: ["employee-onboarding", userId],
    queryFn: async () => {
      const res = await api.get("/careers/employees/onboarding", {
        params: { user_id: userId },
      });
      return res.data.data as EmployeeOnboardingRecord;
    },
    enabled: Boolean(applicationId || userId),
    retry: false,
  });

  const { data: hrFieldDefs = [] } = useQuery({
    queryKey: ["onboarding-hr-fields", ONBOARDING_HR_FIELDS_LIST],
    queryFn: async () => {
      const res = await api.get("/system-definitions/options", {
        params: {
          module_id: RECRUITMENT_MODULE_ID,
          option_list: ONBOARDING_HR_FIELDS_LIST,
        },
      });
      return resolveOnboardingHrFields((res.data.data ?? []) as SystemOption[]);
    },
  });

  const readOnlyFieldKeys = useMemo(
    () => hrFieldDefs.map((f) => f.fieldKey),
    [hrFieldDefs],
  );

  if (!applicationId && !record && !isLoading) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading onboarding information…
      </div>
    );
  }

  if (isError || !record) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        No onboarding submission on file for this employee yet.
      </div>
    );
  }

  const app = record.application;
  const hrData = record.hr_data;
  const offerTermsSaved = Boolean(hrData.offer_terms_saved_at?.trim());

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">Onboarding information</p>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          Section O and the candidate&apos;s submitted onboarding form — read-only
          after the WillsOne invite.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Submitted {formatDate(record.submitted_at)}
          {referenceNumber || app.reference_number
            ? ` · Ref ${referenceNumber ?? app.reference_number}`
            : ""}
        </p>
      </div>

      <OnboardingHrFieldsForm
        hrData={hrData}
        setHrData={(() => {}) as Dispatch<SetStateAction<OnboardingHrData>>}
        readOnlyFields={readOnlyFieldKeys}
        showOfferTermsReference
        offerTermsSaved={offerTermsSaved}
        hideFieldHints
      />

      <div className="border border-gray-100 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setProfileOpen((open) => !open)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-gray-50 text-sm font-medium text-gray-800 hover:bg-gray-100"
        >
          <span className="inline-flex items-center gap-2">
            <FileText className="w-4 h-4 text-red-600" />
            Complete employee profile
          </span>
          {profileOpen ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>
        {profileOpen && (
          <div className="p-3 border-t border-gray-100 max-h-[420px] overflow-y-auto">
            <CandidateProfileReview
              applicationFormData={app.application_form_data}
              onboardingFormData={record.form_data}
              onboardingHrData={hrData}
              showPrintButton={false}
              profileDownloadUrl={`/api/careers/onboarding/profile/pdf?application_id=${record.application_id}`}
              header={{
                fullName: app.full_name || fallbackName,
                roleTitle: app.role_title,
                referenceNumber: app.reference_number,
                submittedAt: record.submitted_at,
                email: app.email,
                phone: app.phone ?? undefined,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
