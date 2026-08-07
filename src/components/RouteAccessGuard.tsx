"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import {
  canAccessPage,
  canManageAccessControl,
  hasUnrestrictedAccess,
  pageKeyFromPath,
  resolveAccessProfile,
} from "@/lib/pagePermissions";
import { toast } from "sonner";
import { RouteGuardSkeleton } from "@/components/skeletons/PageSkeletons";

export default function RouteAccessGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

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

  const profile = users?.find((u) => u.user_id === session?.user?.id);
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const accessProfile = resolveAccessProfile(profile, sessionRole);
  const unrestricted = hasUnrestrictedAccess(accessProfile, sessionRole);
  const loading = sessionLoading || usersLoading;

  const isAccessControlRoute = pathname?.startsWith(
    "/dashboard/access-control",
  );

  useEffect(() => {
    if (loading) return;
    if (unrestricted) return;

    if (!accessProfile && !profile) return;

    if (profile?.is_disabled) {
      toast.error("Your account has been disabled.");
      supabase.auth.signOut().then(() => router.replace("/login"));
      return;
    }

    if (!accessProfile) return;

    if (isAccessControlRoute) {
      if (
        !canManageAccessControl(accessProfile.role, accessProfile.grade_level)
      ) {
        toast.error("You do not have permission to open Access Control.");
        router.replace("/dashboard");
      }
      return;
    }

    const pageKey = pageKeyFromPath(pathname || "");
    if (pageKey && !canAccessPage(accessProfile, pageKey)) {
      toast.error("You do not have access to this page.");
      router.replace("/dashboard");
    }
  }, [
    loading,
    accessProfile,
    profile,
    unrestricted,
    pathname,
    router,
    isAccessControlRoute,
  ]);

  if (loading && !unrestricted) {
    return <RouteGuardSkeleton />;
  }

  if (unrestricted) {
    return <>{children}</>;
  }

  if (profile?.is_disabled) {
    return null;
  }

  if (
    isAccessControlRoute &&
    accessProfile &&
    !canManageAccessControl(accessProfile.role, accessProfile.grade_level)
  ) {
    return null;
  }

  const pageKey = pageKeyFromPath(pathname || "");
  if (pageKey && accessProfile && !canAccessPage(accessProfile, pageKey)) {
    return null;
  }

  return <>{children}</>;
}
