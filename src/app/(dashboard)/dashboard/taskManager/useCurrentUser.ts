"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { isSeniorManagement } from "@/lib/taskAccessControl";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { isStandardRoleLabel } from "@/lib/userRoleAccessControl";

export function useCurrentUser() {
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
  });

  const userId = session?.user?.id;
  const profile = users?.find((u) => u.user_id === userId);
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const accessProfile = resolveAccessProfile(profile, sessionRole);
  const role = accessProfile?.role ?? sessionRole ?? null;

  return {
    isLoading: sessionLoading || usersLoading,
    userId,
    profile,
    role,
    name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : "",
    isSeniorManagement: isSeniorManagement(role),
    // A Standard Role creator can add/edit their own task's subtasks but
    // can never delete them (see TaskRow's canDeleteSubtasks / the PUT
    // /subtasks route's own matching check) — surfaced here so callers
    // don't each need their own isStandardRoleLabel import.
    isStandardRole: isStandardRoleLabel(role),
    allUsers: users ?? [],
  };
}
