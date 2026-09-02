"use client";

import { Download, Printer } from "lucide-react";
import { buildMergedCandidateProfile } from "@/lib/careers/buildMergedCandidateProfile";
import type { OnboardingFormData, OnboardingHrData } from "@/lib/careers/onboardingTypes";
import { formatDisplayDateTime } from "@/lib/formatDisplayDate";

export type CandidateProfileHeader = {
  fullName: string;
  roleTitle?: string;
  referenceNumber?: string;
  submittedAt?: string | null;
  email?: string;
  phone?: string;
};

type Props = {
  applicationFormData?: Record<string, unknown> | null;
  onboardingFormData?: OnboardingFormData | null;
  onboardingHrData?: OnboardingHrData | null;
  header?: CandidateProfileHeader;
  showPrintButton?: boolean;
  /** PDF download — e.g. /api/careers/onboarding/profile/pdf?application_id=… */
  profileDownloadUrl?: string;
};

export default function CandidateProfileReview({
  applicationFormData,
  onboardingFormData,
  onboardingHrData,
  header,
  showPrintButton = true,
  profileDownloadUrl,
}: Props) {
  const groups = buildMergedCandidateProfile({
    applicationFormData,
    onboardingFormData,
    onboardingHrData,
  });

  if (groups.length === 0) {
    return null;
  }

  const submittedLabel = formatDisplayDateTime(header?.submittedAt);

  return (
    <div className="candidate-profile-document">
      {(showPrintButton || profileDownloadUrl) && (
        <div className="flex justify-end gap-2 mb-4 print:hidden">
          {profileDownloadUrl && (
            <a
              href={profileDownloadUrl}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </a>
          )}
          {showPrintButton && (
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden print:border-0 print:rounded-none">
        <div className="border-b border-gray-200 bg-gray-50 px-5 py-4 print:bg-white">
          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">
            Wills Farms Ltd. — Complete employee record
          </p>
          {header?.fullName && (
            <h2 className="text-lg font-bold text-gray-900 mt-1">{header.fullName}</h2>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
            {header?.roleTitle && <span>Position: {header.roleTitle}</span>}
            {header?.referenceNumber && <span>Ref: {header.referenceNumber}</span>}
            {header?.email && <span>{header.email}</span>}
            {header?.phone && <span>{header.phone}</span>}
            {submittedLabel && <span>Onboarding submitted: {submittedLabel}</span>}
          </div>
          <p className="text-[11px] text-gray-400 mt-2 print:text-gray-600">
            Consolidated employee record for your files
          </p>
        </div>

        <div className="p-5 space-y-8">
          {groups.flatMap((group) => group.sections).map((section) => (
            <section
              key={section.title}
              className="break-inside-avoid border-t border-gray-100 pt-6 first:border-t-0 first:pt-0"
            >
              <div className="border-b border-gray-200 pb-2 mb-4">
                <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {section.items.map((row) => (
                  <div
                    key={`${section.title}-${row.label}`}
                    className={row.fullWidth ? "sm:col-span-2" : ""}
                  >
                    <p className="text-xs text-gray-400">{row.label}</p>
                    {row.href ? (
                      <a
                        href={row.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-red-700 hover:underline mt-0.5 inline-block print:text-gray-900 print:no-underline"
                      >
                        {row.value}
                      </a>
                    ) : (
                      <p className="font-medium text-gray-900 mt-0.5 whitespace-pre-wrap">
                        {row.value}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="border-t border-gray-100 px-5 py-3 text-[10px] text-gray-400 print:text-gray-600">
          Confidential employee record.
        </div>
      </div>
    </div>
  );
}
