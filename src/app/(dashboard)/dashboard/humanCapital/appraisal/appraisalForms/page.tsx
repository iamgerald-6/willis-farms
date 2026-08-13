"use client";

import { Suspense } from "react";
import Link from "next/link";
import { FormPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { useSearchParams, useRouter } from "next/navigation";
import { useAppNavigation } from "@/lib/navigation/appNavigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import AppraisalForm from "@/app/(dashboard)/dashboard/humanCapital/appraisal/component/AppraisalPage";
import FinalReviewForm from "@/app/(dashboard)/dashboard/humanCapital/appraisal/component/finalFormReview";
import {
  formatDeadlineDate,
  getActiveAppraisalPeriod,
  isPeriodAlreadyAppraised,
  periodLabel,
} from "@/lib/appraisal/deadlines";
import { canAppraiseOthers } from "@/lib/appraisal/sections";
import { isSuperAdmin } from "@/lib/accessControl";
import { CalendarRange, Info } from "lucide-react";

function AppraisalFormPageContent() {
  const activePeriod = getActiveAppraisalPeriod();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { goBack } = useAppNavigation();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const userId = session?.user?.id;
  const profile = users?.find((u) => u.user_id === userId);

  const existingAppraisalId = searchParams?.get("id");
  const step = searchParams?.get("step");
  const isFinalReview = step === "final" && !!existingAppraisalId;
  const isFreshFill = !isFinalReview && !existingAppraisalId;

  // For a fresh self-start, detect whether this employee already has the
  // active period on file so we can block a duplicate instead of opening
  // the form again.
  const { data: ownActiveAppraisal, isLoading: checkingOwn } = useQuery({
    queryKey: [
      "appraisal-active-own",
      profile?.company_id,
      activePeriod.quarter,
      activePeriod.year,
    ],
    enabled: isFreshFill && !!profile?.company_id,
    queryFn: async () => {
      const params = new URLSearchParams({
        company_id: profile!.company_id!,
        review_quarter: activePeriod.quarter,
        review_year: String(activePeriod.year),
        archived: "all",
      });
      const res = await api.get(`/appraisal/get_appraisal?${params}`);
      const rows = (res.data.data ?? []) as Array<{
        id: string | number;
        status?: string | null;
        submitted_by?: string | null;
        employee_user_id?: string | null;
      }>;
      return (
        rows.find((r) => r.employee_user_id === userId) ?? rows[0] ?? null
      );
    },
  });

  const canSuperviseOthers =
    canAppraiseOthers(profile?.grade_level) || isSuperAdmin(profile?.role);

  // Pure self-appraisal users who already filed this period are done — send
  // them to the existing record. Supervisors still need the form so they can
  // evaluate people under them for the same active period.
  const blockFreshSelfOnly =
    isFreshFill &&
    !canSuperviseOthers &&
    !!ownActiveAppraisal &&
    (isPeriodAlreadyAppraised(ownActiveAppraisal.status) ||
      ownActiveAppraisal.submitted_by === "employee" ||
      ownActiveAppraisal.submitted_by === "both");

  const label = periodLabel(activePeriod.quarter, activePeriod.year);

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      <button
        onClick={() => goBack("/dashboard/humanCapital/appraisal")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition mb-6"
      >
        ← Back to appraisals
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {isFinalReview ? "Final Review Meeting" : "Performance Appraisal"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Performance and Probation Tools
        </p>
      </div>

      {/* Only the active period is available — no free quarter picker. */}
      {isFreshFill && (
        <div className="mb-6 space-y-3 max-w-5xl">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <CalendarRange className="w-4 h-4 text-red-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Applicable period
              </p>
              <p className="text-sm font-bold text-gray-900">{label}</p>
            </div>
            <p className="text-xs text-gray-500 sm:ml-auto">
              Completes by {formatDeadlineDate(activePeriod.lockDate)}
            </p>
          </div>

          {activePeriod.inGracePeriod && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2 text-sm text-amber-800">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                {label} is still open during its completion window.
                {activePeriod.calendarQuarter !== activePeriod.quarter && (
                  <>
                    {" "}
                    {periodLabel(
                      activePeriod.calendarQuarter,
                      activePeriod.calendarYear,
                    )}{" "}
                    will not open until this window closes.
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="max-w-5xl">
        {isFinalReview ? (
          <FinalReviewForm
            appraisalId={existingAppraisalId!}
            onSuccess={() => router.push("/dashboard/humanCapital/appraisal")}
            onBack={() => goBack("/dashboard/humanCapital/appraisal")}
          />
        ) : isFreshFill && checkingOwn ? (
          <FormPageSkeleton />
        ) : blockFreshSelfOnly && ownActiveAppraisal ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm font-semibold text-gray-800">
              You have already submitted {label}
            </p>
            <p className="text-xs text-gray-500 mt-1.5 max-w-md mx-auto">
              Each quarter can only be appraised once. Open the existing record
              to track progress or complete any outstanding supervisor steps —
              the next period opens after this one&apos;s completion window
              closes.
            </p>
            <Link
              href={`/dashboard/humanCapital/appraisal/${ownActiveAppraisal.id}`}
              className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition"
            >
              View {label} appraisal
            </Link>
          </div>
        ) : (
          <AppraisalForm
            key={`${activePeriod.quarter}-${activePeriod.year}`}
            defaultQuarter={activePeriod.quarter}
            defaultYear={activePeriod.year}
            viewerGradeLevel={profile?.grade_level}
            existingAppraisalId={existingAppraisalId}
            onSuccess={() => router.push("/dashboard/humanCapital/appraisal")}
          />
        )}
      </div>
    </div>
  );
}

export default function AppraisalFormPage() {
  return (
    <Suspense fallback={<FormPageSkeleton />}>
      <AppraisalFormPageContent />
    </Suspense>
  );
}
