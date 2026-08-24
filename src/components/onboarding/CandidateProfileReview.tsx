"use client";

import { Printer } from "lucide-react";
import { buildMergedCandidateProfile } from "@/lib/careers/buildMergedCandidateProfile";
import type { OnboardingFormData } from "@/lib/careers/onboardingTypes";
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
  header?: CandidateProfileHeader;
  showPrintButton?: boolean;
};

export default function CandidateProfileReview({
  applicationFormData,
  onboardingFormData,
  header,
  showPrintButton = true,
}: Props) {
  const groups = buildMergedCandidateProfile({
    applicationFormData,
    onboardingFormData,
  });

  if (groups.length === 0) {
    return null;
  }

  const submittedLabel = formatDisplayDateTime(header?.submittedAt);

  return (
    <div className="candidate-profile-document">
      {showPrintButton && (
        <div className="flex justify-end mb-4 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Printer className="w-4 h-4" />
            Print full profile
          </button>
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
            Job application and onboarding — full consolidated record for your files
          </p>
        </div>

        <div className="p-5 space-y-8">
          {groups.map((group) => (
            <div key={group.title} className="space-y-4 break-inside-avoid">
              <div className="border-b border-gray-200 pb-2">
                <h3 className="text-sm font-bold text-gray-900">{group.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
              </div>

              {group.sections.map((section) => (
                <section key={`${group.title}-${section.title}`} className="break-inside-avoid">
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">
                    {section.title}
                  </h4>
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
          ))}
        </div>

        <div className="border-t border-gray-100 px-5 py-3 text-[10px] text-gray-400 print:text-gray-600">
          Includes job application and onboarding submissions. Confidential.
        </div>
      </div>
    </div>
  );
}
