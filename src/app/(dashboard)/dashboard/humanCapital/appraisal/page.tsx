"use client";

import { useRouter } from "next/navigation";
import AppraisalLandingPage from "./component/AppraisalPageView";
import { useAppraisalViewer } from "./component/useAppraisalViewer";

const AppraisalsHomePage = () => {
  const router = useRouter();
  const { viewer } = useAppraisalViewer();

  return (
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
  );
};

export default AppraisalsHomePage;
