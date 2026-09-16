import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

type MeSiteScope = {
  site_id?: number | string | null;
  is_headquarters_site?: boolean;
};

/**
 * Whether the current caller is placed at the headquarters site — the
 * frontend counterpart to isHeadquartersCaller in apiRequestAuth.ts.
 * Several "manage"-type actions (User Management, System Definitions,
 * Recruitment, uploading Policies/SOPs, uploading a User Manual version,
 * the Appraisal grade-template and Skill Log template admin screens) are
 * headquarters-only regardless of role — this hides the entry point on
 * the frontend to match what the server will actually accept, the same
 * "me" query already used by SiteTagPicker/AutomationSettingsModal.
 *
 * Returns `isLoading: true` (and `isHeadquarters: false`) until the /me
 * call resolves — callers that gate a whole page should wait for
 * `isLoading` to settle before hiding content, so a headquarters user
 * doesn't see a flash of "not available" while the query is in flight.
 */
export function useIsHeadquarters() {
  const { data, isLoading } = useQuery<MeSiteScope>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/me")).data,
    staleTime: 60_000,
  });

  return { isHeadquarters: data?.is_headquarters_site === true, isLoading, me: data };
}
