"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import type { ViewerContext } from "./appraisalTypes";

/**
 * Resolves who is looking at an appraisal. Supervisor (fill-side) comes from
 * grade_level (L4+), not role; "full access" (see everyone) is a separate,
 * L5+/Manager/Admin/Super Admin concept resolved by the consumer.
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

  const role = (profile?.role ?? session?.user?.user_metadata?.role) as
    | "employee"
    | "manager"
    | "admin"
    | "super_admin";

  return {
    viewer: {
      role: role ?? "employee",
      gradeLevel: profile?.grade_level ?? null,
      companyId: profile?.company_id,
      userId,
      accessTier: profile?.access_tier ?? null,
      pagePermissionLevels: profile?.page_permission_levels ?? null,
    },
    isLoading: sessionLoading || usersLoading,
  };
}
