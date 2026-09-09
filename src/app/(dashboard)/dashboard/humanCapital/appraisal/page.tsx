"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hasFullAppraisalAccess } from "@/lib/accessControl";
import AppraisalLandingPage from "./component/AppraisalPageView";
import AppraisalGradeTemplatesManager from "./component/AppraisalGradeTemplatesManager";
import { useAppraisalViewer } from "./component/useAppraisalViewer";

// Same toggle shape as SOPHubPage: one route, "Appraisals" vs "Manage
// appraisals" — instead of the appraisal question-set builder living under
// System Definitions. Manage side gated by hasFullAppraisalAccess, the same
// check already used elsewhere in AppraisalPageView for admin-only actions
// (browse all periods, archive) — Super Admin, Executive, or HR.
const AppraisalsHomePage = () => {
  const router = useRouter();
  const { viewer } = useAppraisalViewer();
  const [viewMode, setViewMode] = useState<"appraisals" | "manage">("appraisals");

  const canManage = hasFullAppraisalAccess(viewer.role);

  return (
    <div>
      {canManage && (
        <div className="flex items-center gap-1 p-6 pb-0">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setViewMode("appraisals")}
              className={`px-4 py-2 text-sm font-medium transition ${
                viewMode === "appraisals"
                  ? "bg-red-600 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              Appraisals
            </button>
            <button
              onClick={() => setViewMode("manage")}
              className={`px-4 py-2 text-sm font-medium transition ${
                viewMode === "manage"
                  ? "bg-red-600 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              Manage appraisals
            </button>
          </div>
        </div>
      )}

      {canManage && viewMode === "manage" ? (
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900">Manage appraisals</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 mb-4">
            Build the appraisal question set for an exact Site/Business
            unit/Department/Section/Position/Grade level combination —
            matched against each employee&apos;s own org placement.
          </p>
          <AppraisalGradeTemplatesManager canAdd canEdit />
        </div>
      ) : (
        <AppraisalLandingPage
          viewer={viewer}
          onNavigateToForm={(appraisalId) =>
            router.push(
              appraisalId
                ? `/dashboard/humanCapital/appraisal/appraisalForms?id=${appraisalId}`
                : "/dashboard/humanCapital/appraisal/appraisalForms",
            )
          }
        />
      )}
    </div>
  );
};

export default AppraisalsHomePage;
