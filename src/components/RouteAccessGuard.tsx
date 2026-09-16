"use client";

import { useEffect, useRef } from "react";
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
import {
  canAccessPage,
  resolveDefaultLandingPath,
} from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import {
  canManageUserAccounts,
  canOpenUserManagement,
} from "@/lib/permissionLevels";
import { toast } from "sonner";
import { RouteGuardSkeleton } from "@/components/skeletons/PageSkeletons";
import { isEmailVerified } from "@/lib/userAccountStatus";
import { staffAuthBlockMessage } from "@/lib/staffAccount";
import { performLogout } from "@/lib/auth/performLogout";
import { useIsHeadquarters } from "@/hooks/useIsHeadquarters";

// Whole modules that are headquarters-only regardless of role — see
// isHeadquartersCaller in apiRequestAuth.ts, the server-side rule this
// mirrors. User Management (access-control), System Definitions, and
// Recruitment are entire modules, not single buttons on an otherwise-shared
// page, so they're blocked here centrally rather than page-by-page like the
// narrower "manage" actions (Policies upload, SOP Management, User Manual
// upload, Appraisal/Skill Log template admin) gated individually where they
// live.
const HEADQUARTERS_ONLY_ROUTE_PREFIXES = [
  "/dashboard/access-control",
  "/dashboard/system-definitions",
  "/dashboard/humanCapital/recruitment",
];

export default function RouteAccessGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const redirectGuardRef = useRef<string | null>(null);

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
  const { isHeadquarters, isLoading: hqLoading } = useIsHeadquarters();
  const loading = sessionLoading || usersLoading || presetsLoading || hqLoading;

  const isAccessControlRoute = pathname?.startsWith(
    "/dashboard/access-control",
  );
  const isManageUserRoute =
    isAccessControlRoute && pathname !== "/dashboard/access-control";
  const isHeadquartersOnlyRoute = HEADQUARTERS_ONLY_ROUTE_PREFIXES.some((prefix) =>
    pathname?.startsWith(prefix),
  );

  useEffect(() => {
    if (loading) return;

    // Headquarters-only modules are checked before the `unrestricted`
    // bypass below — WHERE someone is placed, not their role, decides this
    // one, same as every other site-access rule this session (see
    // isHeadquartersCaller in apiRequestAuth.ts). A Super Admin/Executive
    // account that would otherwise skip every other check here still can't
    // open these modules unless placed at headquarters.
    if (isHeadquartersOnlyRoute && !isHeadquarters) {
      toast.error("This section is available only to headquarters staff.");
      router.replace("/dashboard");
      return;
    }

    if (unrestricted) return;

    if (!accessProfile && !profile) return;

    if (!profile) {
      toast.error(staffAuthBlockMessage("not_found"));
      void performLogout(router);
      return;
    }

    if (profile.is_disabled) {
      toast.error(staffAuthBlockMessage("disabled"));
      void performLogout(router);
      return;
    }

    if (!isEmailVerified(profile)) {
      toast.error(staffAuthBlockMessage("pending"));
      void performLogout(router);
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
    if (
      pageKey &&
      !canAccessPage(accessProfile, pageKey, groupPresets, sessionRole)
    ) {
      const landingPath = resolveDefaultLandingPath(
        accessProfile,
        groupPresets,
        sessionRole,
      );
      const currentPath = pathname || "";
      if (currentPath === landingPath) return;

      const redirectKey = `${currentPath}->${landingPath}`;
      if (redirectGuardRef.current === redirectKey) return;
      redirectGuardRef.current = redirectKey;

      toast.error("You do not have access to this page.");
      router.replace(landingPath);
    }
  }, [
    loading,
    accessProfile,
    profile,
    unrestricted,
    pathname,
    router,
    isAccessControlRoute,
    isHeadquartersOnlyRoute,
    isHeadquarters,
    groupPresets,
    sessionRole,
  ]);

  if (loading) {
    return <RouteGuardSkeleton />;
  }

  if (isHeadquartersOnlyRoute && !isHeadquarters) {
    return null;
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
