"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ArrowLeft, FileText } from "lucide-react";
import api from "@/lib/api";
import { RouteGuardSkeleton } from "@/components/skeletons/PageSkeletons";
import AppraisalDetail from "../component/AppraisalDetail";
import { useAppraisalViewer } from "../component/useAppraisalViewer";
import type { Appraisal } from "../component/appraisalTypes";

const BACK_HREF = "/dashboard/humanCapital/appraisal";

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
      <FileText className="w-10 h-10 mx-auto mb-3 text-gray-200" />
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="text-xs text-gray-400 mt-1">{message}</p>
      <Link
        href={BACK_HREF}
        className="inline-block mt-5 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition"
      >
        Back to appraisals
      </Link>
    </div>
  );
}

export default function AppraisalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const appraisalId = params?.id;
  const { viewer, isLoading: viewerLoading } = useAppraisalViewer();

  const {
    data: appraisal,
    isLoading,
    error,
  } = useQuery<Appraisal>({
    queryKey: ["appraisal", appraisalId],
    enabled: !!appraisalId,
    queryFn: async () => {
      const res = await api.get(`/appraisal/${appraisalId}`);
      return res.data.data as Appraisal;
    },
    retry: false,
  });

  const status = (error as AxiosError | null)?.response?.status;

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
      <Link
        href={BACK_HREF}
        className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-gray-500 hover:text-gray-800 transition mb-4 sm:mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to appraisals
      </Link>

      <div className="max-w-5xl">
        {isLoading || viewerLoading ? (
          <RouteGuardSkeleton />
        ) : status === 403 ? (
          <EmptyState
            title="You do not have access to this appraisal"
            message="Only the employee, their supervisor, and senior management can open it."
          />
        ) : error || !appraisal ? (
          <EmptyState
            title="Appraisal not found"
            message="It may have been removed, or the link is no longer valid."
          />
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
            <AppraisalDetail
              appraisal={appraisal}
              viewer={viewer}
              onFillForm={() =>
                router.push(
                  `/dashboard/humanCapital/appraisal/appraisalForms?id=${appraisal.id}`,
                )
              }
              onFinalReview={() =>
                router.push(
                  `/dashboard/humanCapital/appraisal/appraisalForms?id=${appraisal.id}&step=final`,
                )
              }
              onSubmitJustification={() =>
                router.push(
                  `/dashboard/humanCapital/appraisal/justifications/new?appraisal_id=${appraisal.id}`,
                )
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
