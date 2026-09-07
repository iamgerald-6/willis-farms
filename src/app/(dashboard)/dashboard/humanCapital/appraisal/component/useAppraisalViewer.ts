"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import type { ViewerContext } from "./appraisalTypes";

/**
 * Resolves who is looking at an appraisal. Role is resolved the same way
 * every other page does (resolveAccessProfile — the new user_role_label,
 * never the stale raw `role` column). "Full access" (see everyone, browse
 * all periods, archive) and "appraises others at all" are role-based —
 * see hasFullAppraisalAccess/canAppraiseOthers. Which SPECIFIC employee a
 * supervisor can act on is a separate, per-record check (canSuperviseAppraisal
 * in appraisal/roles.ts) gated on the actual supervisor_id assignment.
 */
export function useAppraisalViewer(): {
  viewer: ViewerContext;
  isLoading: boolean;
} {
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
    enabled: !!session,
  });

  const userId = session?.user?.id;
  const profile = users?.find((u) => u.user_id === userId);
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const accessProfile = resolveAccessProfile(profile, sessionRole);
  const hasSupervisees =
    !!userId && (users ?? []).some((u) => u.supervisor_id === userId);

  return {
    viewer: {
      role: accessProfile?.role ?? "Standard Role",
      gradeLevel: profile?.grade_level ?? null,
      companyId: profile?.company_id,
      userId,
      accessTier: profile?.access_tier ?? null,
      pagePermissionLevels: profile?.page_permission_levels ?? null,
      hasSupervisees,
    },
    isLoading: sessionLoading || usersLoading,
  };
}
