"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import AppraisalLandingPage, {
  ViewerContext,
} from "./component/AppraisalPageView";

const AppraisalsHomePage = () => {
  const router = useRouter();

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

  const role = (profile?.role ?? session?.user?.user_metadata?.role) as
    | "employee"
    | "manager"
    | "admin"
    | "super_admin";

  // Supervisor (fill-side) is determined by grade_level (L4+), NOT by role.
  // "Full access" (see everyone) is a separate, L5+/Manager/Admin/Super
  // Admin concept — the landing page derives that itself via
  // hasFullAppraisalAccess(). We just pass the full viewer context.
  const viewer: ViewerContext = {
    role: role ?? "employee",
    gradeLevel: profile?.grade_level ?? null,
    companyId: profile?.company_id,
    userId,
  };

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
      onNavigateToFinalReview={(appraisalId) =>
        router.push(
          `/dashboard/humanCapital/appraisal/appraisalForms?id=${appraisalId}&step=final`,
        )
      }
      onNavigateToJustification={(appraisalId) =>
        router.push(
          `/dashboard/humanCapital/appraisal/justifications/new?appraisal_id=${appraisalId}`,
        )
      }
    />
  );
};

export default AppraisalsHomePage;
