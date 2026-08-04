"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { isSeniorManagement } from "@/lib/taskAccessControl";

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
  const role = profile?.role ?? session?.user?.user_metadata?.role ?? null;

  return {
    isLoading: sessionLoading || usersLoading,
    userId,
    profile,
    role,
    name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : "",
    isSeniorManagement: isSeniorManagement(role),
    allUsers: users ?? [],
  };
}
