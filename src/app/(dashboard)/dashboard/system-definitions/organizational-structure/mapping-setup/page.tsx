"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import {
  ORG_MAPPING_PAIR_KEYS,
  type OrgMappingPairKey,
} from "@/lib/organizationalStructureMappings";
import MappingPanel from "./MappingPanel";

export default function MappingSetupPage() {
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

  const profile = users?.find((u) => u.user_id === session?.user?.id);
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const accessProfile = resolveAccessProfile(profile, sessionRole);
  const { data: groupPresetData } = useGroupPresets();
  const groupPresets = groupPresetData?.presets;
  const canView =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "view", sessionRole, groupPresets);
  const canAdd =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "add", sessionRole, groupPresets);
  const canEdit =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "edit", sessionRole, groupPresets);

  const [openPair, setOpenPair] = useState<OrgMappingPairKey | null>(
    ORG_MAPPING_PAIR_KEYS[0],
  );

  if (sessionLoading || usersLoading) {
    return (
      <div className="p-4 md:p-6 bg-gray-50 min-h-full">
        <div className="h-8 w-56 bg-gray-100 rounded animate-pulse mb-2" />
        <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 text-sm">
            System Definitions view access is required to open this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <Link
        href="/dashboard/system-definitions"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to System Definitions
      </Link>

      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900">Mapping set up</h2>
        <p className="text-sm text-gray-500 mt-1">
          Link the items set up in Organizational structure to each other. Expand a
          section to add or remove a mapping.
        </p>
      </div>

      <div className="space-y-3 max-w-3xl">
        {ORG_MAPPING_PAIR_KEYS.map((pairKey) => (
          <MappingPanel
            key={pairKey}
            pairKey={pairKey}
            open={openPair === pairKey}
            onToggle={() =>
              setOpenPair((prev) => (prev === pairKey ? null : pairKey))
            }
            canView={!!canView}
            canAdd={!!canAdd}
            canEdit={!!canEdit}
          />
        ))}
      </div>
    </div>
  );
}
