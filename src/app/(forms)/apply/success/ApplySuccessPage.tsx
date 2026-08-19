"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { FormShell, usePreventBrowserBack } from "@/components/Forms/FormShell";

const REDIRECT_SECONDS = 8;

export default function ApplySuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reference = searchParams?.get("ref") ?? "";
  const role = searchParams?.get("role") ?? "your selected role";
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);

  usePreventBrowserBack(true);

  useEffect(() => {
    if (secondsLeft <= 0) {
      router.push("/careers");
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, router]);

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
        <button
          type="button"
          onClick={() => router.push("/careers")}
          className="mt-8 inline-flex items-center justify-center rounded-lg bg-red-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-800 transition-colors"
        >
          Back to Careers
        </button>
        <p className="text-xs text-gray-400 mt-3">
          Redirecting to Careers in {secondsLeft}s…
        </p>
      </div>
    </FormShell>
  );
}
