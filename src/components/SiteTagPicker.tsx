"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { OrgCustomListType, OrgCustomListItem } from "@/lib/organizationalStructureCustomLists";

/**
 * Reusable "which site(s) does this document apply to" picker — used by
 * Policies (manuals) and SOPs (content). Both default to "All Sites" when
 * nothing is selected (see docs/multi-site/add-site-tagging-policies-sop.sql
 * for the storage convention: empty selection = no rows in the join table =
 * applies everywhere). This is the data-tagging step only — it does not
 * filter who can see the document, that's a separate, later step.
 */
type MeSiteScope = {
  site_id?: number | string | null;
  is_headquarters_site?: boolean;
};

export default function SiteTagPicker({
  selectedSiteIds,
  onChange,
}: {
  selectedSiteIds: number[];
  onChange: (siteIds: number[]) => void;
}) {
  const { data: listTypes = [] } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => (await api.get("/organizational-structure/custom-list-types")).data.data,
  });

  const sitesListType = listTypes.find((lt) => lt.table_name === "sites");

  const { data: sites = [] } = useQuery<OrgCustomListItem[]>({
    queryKey: ["org_custom_list_items", sitesListType?.id],
    queryFn: async () =>
      (await api.get(`/organizational-structure/custom-list-types/${sitesListType!.id}/items`)).data.data,
    enabled: !!sitesListType,
  });

  // Whether this caller can tag content to any site at all ("All Sites",
  // or a site other than their own) is a headquarters-only ability — same
  // rule the backend now enforces on every write (see
  // docs/SITE_ACCESS_ARCHITECTURE.md §6.3 item 7: "only offer a site picker
  // where ALL_SITES actually permits one"). A caller not at headquarters
  // gets a fixed, non-interactive badge showing their own site instead of
  // the full picker — matching what the server will actually accept.
  const { data: me } = useQuery<MeSiteScope>({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/me")).data,
  });

  const isAllSitesCaller = me?.is_headquarters_site === true;
  const callerSiteId = me?.site_id != null ? Number(me.site_id) : null;

  const allSites = selectedSiteIds.length === 0;

  const toggleSite = (siteId: number) => {
    if (selectedSiteIds.includes(siteId)) {
      onChange(selectedSiteIds.filter((id) => id !== siteId));
    } else {
      onChange([...selectedSiteIds, siteId]);
    }
  };

  if (me && !isAllSitesCaller) {
    const ownSite = sites.find((s) => Number(s.id) === callerSiteId);
    return (
      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
          Applies to
        </label>
        <div className="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 bg-red-600 text-white border-red-600 inline-block">
          {ownSite?.label ?? "Your site"}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Visible to your site only — tagging other sites or "All Sites" requires headquarters access.
        </p>
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
        Applies to
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange([])}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition ${
            allSites
              ? "bg-red-600 text-white border-red-600"
              : "bg-white text-gray-500 border-gray-200"
          }`}
        >
          All Sites
        </button>
        {sites.map((site) => {
          const siteId = Number(site.id);
          const active = selectedSiteIds.includes(siteId);
          return (
            <button
              key={site.id}
              type="button"
              onClick={() => toggleSite(siteId)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition ${
                active
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-gray-500 border-gray-200"
              }`}
            >
              {site.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-1.5">
        {allSites
          ? "Visible to every site (default)."
          : "Tagged to specific sites only."}
      </p>
    </div>
  );
}
