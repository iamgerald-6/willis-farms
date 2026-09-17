"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { hasFullAppraisalAccess } from "@/lib/accessControl";
import AppraisalLandingPage from "./component/AppraisalPageView";
import AppraisalGradeTemplatesManager from "./component/AppraisalGradeTemplatesManager";
import PipFormTemplateManager from "./component/PipFormTemplateManager";
import PipListView from "./component/PipListView";
import { useAppraisalViewer } from "./component/useAppraisalViewer";
import { viewerCanActOnTeamAppraisals } from "@/lib/appraisal/viewerAccess";
import { useIsHeadquarters } from "@/hooks/useIsHeadquarters";

type AppraisalViewMode = "appraisals" | "pip" | "manage";

const AppraisalsHomePage = () => {
  const router = useRouter();
  const { viewer } = useAppraisalViewer();
  const [viewMode, setViewMode] = useState<AppraisalViewMode>("appraisals");
  const [manageTab, setManageTab] = useState<"questions" | "pip">("questions");
  const { isHeadquarters } = useIsHeadquarters();

  const canManageTemplates = hasFullAppraisalAccess(viewer.role) && isHeadquarters;
  const showPipManagementTab =
    viewerCanActOnTeamAppraisals(viewer) || hasFullAppraisalAccess(viewer.role);
  const showTopTabs = showPipManagementTab || canManageTemplates;

  return (
    <div>
      {showTopTabs && (
        <div className="flex items-center gap-1 p-6 pb-0 flex-wrap">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setViewMode("appraisals")}
              className={`px-4 py-2 text-sm font-medium transition ${
                viewMode === "appraisals"
                  ? "bg-red-600 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              Appraisals
            </button>
            {showPipManagementTab && (
              <button
                type="button"
                onClick={() => setViewMode("pip")}
                className={`px-4 py-2 text-sm font-medium transition ${
                  viewMode === "pip"
                    ? "bg-red-600 text-white"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                PIP
              </button>
            )}
            {canManageTemplates && (
              <button
                type="button"
                onClick={() => setViewMode("manage")}
                className={`px-4 py-2 text-sm font-medium transition ${
                  viewMode === "manage"
                    ? "bg-red-600 text-white"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                Manage appraisals
              </button>
            )}
          </div>
        </div>
      )}

      {viewMode === "manage" && canManageTemplates ? (
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900">Manage appraisals</h2>

          <div className="flex items-center gap-1 mt-3 mb-4">
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setManageTab("questions")}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  manageTab === "questions"
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                Appraisal question sets
              </button>
              <button
                type="button"
                onClick={() => setManageTab("pip")}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  manageTab === "pip" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                PIP form setup
              </button>
            </div>
          </div>

          {manageTab === "questions" ? (
            <>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5 mb-4">
                Build the appraisal question set for an exact Site/Business
                unit/Department/Section/Position/Grade level combination —
                matched against each employee&apos;s own org placement.
              </p>
              <AppraisalGradeTemplatesManager canAdd canEdit />
            </>
          ) : (
            <>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5 mb-4">
                Build the PIP form for an exact Site/Business unit/
                Department/Section/Position/Grade level combination —
                matched against the employee&apos;s own org placement when a
                PIP is created for them after a poor final appraisal.
              </p>
              <PipFormTemplateManager canAdd canEdit />
            </>
          )}
        </div>
      ) : viewMode === "pip" && showPipManagementTab ? (
        <PipListView viewer={viewer} />
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
