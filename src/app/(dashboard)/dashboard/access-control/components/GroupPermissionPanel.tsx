"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import type { PagePermissionActions } from "@/lib/moduleRegistry/types";
import {
  GROUP_PRESET_LABELS,
  getDefaultGroupPreset,
  type GroupPresetKey,
} from "@/lib/groupPermissionPresets";
import { permissionActionModuleCount } from "@/lib/permissionActions";
import PermissionMatrix from "./PermissionMatrix";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";

type Props = {
  groupKey: GroupPresetKey;
  initialActions: PagePermissionActions;
  canEdit: boolean;
};

export default function GroupPermissionPanel({
  groupKey,
  initialActions,
  canEdit,
}: Props) {
  const queryClient = useQueryClient();
  const [actions, setActions] = useState<PagePermissionActions>(initialActions);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    setActions(initialActions);
    setInitialized(true);
  }, [initialActions, initialized]);

  useEffect(() => {
    setInitialized(false);
  }, [groupKey]);

  const moduleCount = permissionActionModuleCount(actions);
  const label = GROUP_PRESET_LABELS[groupKey];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) throw new Error("Not signed in.");
      const res = await api.patch(
        `/access-control/group-presets/${encodeURIComponent(groupKey)}`,
        {
          page_permission_actions: actions,
          updated_by: userId,
        },
      );
      return res.data;
    },
    onSuccess: () => {
      toast.success(`${label} permissions saved.`);
      queryClient.invalidateQueries({
        queryKey: ["access-control-group-presets"],
      });
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not save group permissions.");
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const defaults = getDefaultGroupPreset(groupKey);
      setActions(defaults);
      return defaults;
    },
    onSuccess: () => {
      toast.message("Reset to built-in defaults — save to apply.");
    },
  });

  return (
    <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-red-600" />
            Group permissions — {label}
          </h3>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Changes here apply to everyone in this group who follows group
            defaults. To customize one person, open{" "}
            <span className="font-medium">Manage</span> on their row — individual
            overrides are not changed when you save here.
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || moduleCount === 0}
              className="px-4 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 transition flex items-center gap-1.5"
            >
              {saveMutation.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              Save group permissions
            </button>
          </div>
        )}
      </div>

      <PermissionMatrix
        actions={actions}
        onChange={setActions}
        readOnly={!canEdit}
      />
    </div>
  );
}
