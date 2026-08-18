"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User, Content } from "@/types";
import {
  isFullRoleAccess,
  resolveAccessProfile,
} from "@/lib/pagePermissions";
import { canAccessPage } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import { isSupervisor } from "@/lib/accessControl";
import SOPBrowsePage from "./components/SOPBrowsePage";
import SOPManagementPage from "./components/SOPManagementPage";

// Single SOP route that toggles between the public browse grid and the
// management table, instead of "SOP" and "SOP Management" being two
// separate sidebar entries — the Management side is still reachable
// directly at /dashboard/addSop for anyone linked straight to it.
export default function SOPHubPage() {
  const [viewMode, setViewMode] = useState<"sops" | "manage">("sops");

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
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const role = profile?.role ?? sessionRole;
  const accessProfile = resolveAccessProfile(profile, sessionRole);
  const { data: groupPresetData } = useGroupPresets();
  const groupPresets = groupPresetData?.presets;

  // Manage side: L4+ (any role) or admin/manager/super_admin, or anyone
  // specifically delegated the "sop:add" permission via Access Control.
  const canManage =
    isFullRoleAccess(role) ||
    isSupervisor(profile?.grade_level) ||
    (accessProfile
      ? canAccessPage(accessProfile, "sop:add", groupPresets, sessionRole)
      : false);

  // Same queryKey as SOPManagementPage's own fetch — React Query dedupes
  // this into a single request, we just read the count here for the header.
  const { data: content } = useQuery<Content[]>({
    queryKey: ["get_content"],
    queryFn: async () => {
      const res = await api.get("/sop/get_content");
      return res.data.data;
    },
    enabled: canManage,
  });
  const contentCount = content?.length ?? 0;

  return (
    <div>
      {/* Header — shown above the toggle while on the Manage tab */}
      {canManage && viewMode === "manage" && (
        <div className="px-6 pt-6">
          <h2 className="text-xl font-bold text-gray-900">SOP Content</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            {contentCount} content item{contentCount !== 1 ? "s" : ""} uploaded
          </p>
        </div>
      )}

      {/* Toggle — manage side only for L4+/managers/delegated sop:add */}
      {canManage && (
        <div className="flex items-center gap-1 p-6 pb-0">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setViewMode("sops")}
              className={`px-4 py-2 text-sm font-medium transition ${
                viewMode === "sops"
                  ? "bg-red-600 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              SOPs
            </button>
            <button
              onClick={() => setViewMode("manage")}
              className={`px-4 py-2 text-sm font-medium transition ${
                viewMode === "manage"
                  ? "bg-red-600 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              SOP Management
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {canManage && viewMode === "manage" ? (
        <SOPManagementPage showHeader={false} />
      ) : (
        <SOPBrowsePage />
      )}
    </div>
  );
}
