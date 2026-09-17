"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormPageSkeleton } from "@/components/skeletons/PageSkeletons";
import PipInstanceForm from "../component/PipInstanceForm";

const BACK_HREF = "/dashboard/humanCapital/appraisal";

function PipFormPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const appraisalId = searchParams?.get("id");

  if (!appraisalId) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center max-w-lg mx-auto">
        <p className="text-sm font-semibold text-gray-700">Missing appraisal</p>
        <p className="text-xs text-gray-400 mt-1">
          Open a PIP from an employee&apos;s appraisal detail page after final review.
        </p>
        <Link
          href={BACK_HREF}
          className="inline-block mt-5 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
        >
          Back to appraisals
        </Link>
      </div>
    );
  }

  return (
    <PipInstanceForm
      appraisalId={appraisalId}
      onBack={() => router.push(`/dashboard/humanCapital/appraisal/${appraisalId}`)}
    />
  );
}

export default function PipFormPage() {
  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <Suspense fallback={<FormPageSkeleton />}>
          <PipFormPageContent />
        </Suspense>
      </div>
    </div>
  );
}
