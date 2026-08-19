"use client";

import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { FormShell, usePreventBrowserBack } from "@/components/Forms/FormShell";

export default function ApplySuccessPage() {
  const searchParams = useSearchParams();
  const reference = searchParams?.get("ref") ?? "";
  const role = searchParams?.get("role") ?? "your selected role";

  usePreventBrowserBack(true);

  return (
    <FormShell
      eyebrow="Wills Farms Ltd. — Job application"
      title="Application submitted"
    >
      <div className="text-center py-8">
        <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Thank you</h2>
        <p className="text-sm text-gray-600 mt-3 leading-relaxed max-w-md mx-auto">
          Your application for <strong>{role}</strong> has been received. A
          confirmation email has been sent to you with your reference number.
        </p>
        {reference && (
          <p className="mt-6 text-2xl font-bold tracking-wide text-red-700">
            {reference}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-4">
          Please keep this reference number for follow-up. Our Human Capital team
          will contact you if you are shortlisted.
        </p>
      </div>
    </FormShell>
  );
}
