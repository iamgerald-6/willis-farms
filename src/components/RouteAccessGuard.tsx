"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import {
  hasUnrestrictedAccess,
  pageKeyFromPath,
  resolveAccessProfile,
} from "@/lib/pagePermissions";
import { canAccessPage } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import {
  canManageUserAccounts,
  canOpenUserManagement,
} from "@/lib/permissionLevels";
import { toast } from "sonner";
import { RouteGuardSkeleton } from "@/components/skeletons/PageSkeletons";
import { isEmailVerified } from "@/lib/userAccountStatus";
import { staffAuthBlockMessage } from "@/lib/staffAccount";

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
  const { data: groupPresetData, isLoading: presetsLoading } = useGroupPresets();
  const groupPresets = groupPresetData?.presets;
  const loading = sessionLoading || usersLoading || presetsLoading;

  const isAccessControlRoute = pathname?.startsWith(
    "/dashboard/access-control",
  );
  const isManageUserRoute =
    isAccessControlRoute && pathname !== "/dashboard/access-control";

  useEffect(() => {
    if (loading) return;
    if (unrestricted) return;

    if (!accessProfile && !profile) return;

    if (!profile) {
      toast.error(staffAuthBlockMessage("not_found"));
      supabase.auth.signOut().then(() => router.replace("/login"));
      return;
    }

    if (profile.is_disabled) {
      toast.error(staffAuthBlockMessage("disabled"));
      supabase.auth.signOut().then(() => router.replace("/login"));
      return;
    }

    if (!isEmailVerified(profile)) {
      toast.error(staffAuthBlockMessage("pending"));
      supabase.auth.signOut().then(() => router.replace("/login"));
      return;
    }

    if (!accessProfile) return;

    if (isAccessControlRoute) {
      if (!canOpenUserManagement(accessProfile, sessionRole)) {
        toast.error("You do not have permission to open User Management.");
        router.replace("/dashboard");
        return;
      }
      if (
        isManageUserRoute &&
        !canManageUserAccounts(accessProfile, sessionRole)
      ) {
        toast.error("Edit access is required to manage a user.");
        router.replace("/dashboard/access-control");
      }
      return;
    }

    const pageKey = pageKeyFromPath(pathname || "");
    if (pageKey && !canAccessPage(accessProfile, pageKey, groupPresets, sessionRole)) {
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
    groupPresets,
    sessionRole,
  ]);

  if (loading && !unrestricted) {
    return <RouteGuardSkeleton />;
  }

  if (unrestricted) {
    return <>{children}</>;
  }

  if (!profile || profile.is_disabled || !isEmailVerified(profile)) {
    return null;
  }

  if (isAccessControlRoute) {
    if (accessProfile && !canOpenUserManagement(accessProfile, sessionRole)) {
      return null;
    }
    if (
      isManageUserRoute &&
      accessProfile &&
      !canManageUserAccounts(accessProfile, sessionRole)
    ) {
      return null;
    }
  }

  const pageKey = pageKeyFromPath(pathname || "");
  if (
    pageKey &&
    accessProfile &&
    !canAccessPage(accessProfile, pageKey, groupPresets, sessionRole)
  ) {
    return null;
  }

  return <>{children}</>;
}
