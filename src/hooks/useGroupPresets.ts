import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { GroupPresetRow, GroupPresetsMap } from "@/lib/groupPermissionPresets";
import { normalizeGroupPresetsMap } from "@/lib/groupPermissionPresets";

type GroupPresetsResponse = {
  presets: GroupPresetsMap;
  rows: GroupPresetRow[];
};

export function useGroupPresets() {
  return useQuery<GroupPresetsResponse>({
    queryKey: ["access-control-group-presets"],
    queryFn: async () => {
      const res = await api.get("/access-control/group-presets");
      const rows = (res.data?.rows ?? []) as GroupPresetRow[];
      const presets = normalizeGroupPresetsMap(rows);
      return { presets, rows };
    },
    staleTime: 60_000,
  });
}
