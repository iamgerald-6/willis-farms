"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Network } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import type { OrgCustomListType } from "@/lib/organizationalStructureCustomLists";

const selectClass =
  "w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 mt-1 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50 disabled:text-gray-500";

type Item = { id: string; label: string; is_active?: boolean; sort_order?: number };

type SiteBuRow = { id: string; site_id: string; business_unit_id: string };
type BuDeptRow = { id: string; site_id: string; business_unit_id: string; department_id: string };
type DeptSectionRow = {
  id: string;
  site_id: string;
  business_unit_id: string;
  department_id: string;
  section_id: string;
};
type SectionPositionRow = {
  id: string;
  site_id: string;
  business_unit_id: string;
  department_id: string;
  section_id: string;
  position_id: string;
};

type TabId = "site" | "business_unit" | "department" | "section";

const TAB_LABELS: Record<TabId, string> = {
  site: "Site set up",
  business_unit: "Business unit set up",
  department: "Department set up",
  section: "Section set up",
};

/** Every item id that appears under `key` across a set of mapping rows, filtered down to a specific parent combination first (if given), in the order `items` itself lists them. */
function optionsFromRows(
  rows: Record<string, string>[],
  key: string,
  items: Item[],
  filter?: Record<string, string | undefined>,
): Item[] {
  const matching = filter
    ? rows.filter((r) => Object.entries(filter).every(([k, v]) => !v || r[k] === v))
    : rows;
  const ids = new Set(matching.map((r) => r[key]));
  return items.filter((i) => ids.has(i.id));
}

function labelFor(items: Item[], id: string | undefined): string {
  return items.find((i) => i.id === id)?.label ?? "";
}

export default function OrgStructureMappingSetupPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("site");

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
  const canEdit =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "edit", sessionRole, groupPresets);

  const { data: customListTypes } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/custom-list-types");
      return res.data.data as OrgCustomListType[];
    },
    enabled: !!canView,
  });

  const siteListType = customListTypes?.find((lt) => lt.table_name === "sites");
  const buListType = customListTypes?.find((lt) => lt.table_name === "business_units");
  const deptListType = customListTypes?.find((lt) => lt.table_name === "departments");
  const sectionListType = customListTypes?.find((lt) => lt.table_name === "sections");
  const positionListType = customListTypes?.find((lt) => lt.table_name === "custom_position");

  function useListItems(listTypeId: string | undefined) {
    return useQuery<Item[]>({
      queryKey: ["org_mapping_list_items", listTypeId],
      queryFn: async () => {
        const res = await api.get(`/organizational-structure/custom-list-types/${listTypeId}/items`);
        return (res.data.data as Item[])
          .filter((i) => i.is_active !== false)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      },
      enabled: !!listTypeId && !!canView,
    });
  }

  const { data: sites = [] } = useListItems(siteListType?.id);
  const { data: businessUnits = [] } = useListItems(buListType?.id);
  const { data: departments = [] } = useListItems(deptListType?.id);
  const { data: sections = [] } = useListItems(sectionListType?.id);
  const { data: positions = [] } = useListItems(positionListType?.id);

  const { data: siteBuRows = [] } = useQuery<SiteBuRow[]>({
    queryKey: ["org_mapping_site_business_units"],
    queryFn: async () => (await api.get("/organizational-structure/mapping/site-business-units")).data.data,
    enabled: !!canView,
  });
  const { data: buDeptRows = [] } = useQuery<BuDeptRow[]>({
    queryKey: ["org_mapping_business_unit_departments"],
    queryFn: async () =>
      (await api.get("/organizational-structure/mapping/business-unit-departments")).data.data,
    enabled: !!canView,
  });
  const { data: deptSectionRows = [] } = useQuery<DeptSectionRow[]>({
    queryKey: ["org_mapping_department_sections"],
    queryFn: async () =>
      (await api.get("/organizational-structure/mapping/department-sections")).data.data,
    enabled: !!canView,
  });
  const { data: sectionPositionRows = [] } = useQuery<SectionPositionRow[]>({
    queryKey: ["org_mapping_section_positions"],
    queryFn: async () =>
      (await api.get("/organizational-structure/mapping/section-positions")).data.data,
    enabled: !!canView,
  });

  function useMappingMutations(endpoint: string, queryKey: string) {
    const add = useMutation({
      mutationFn: async (body: Record<string, string>) => {
        const res = await api.post(endpoint, body);
        return res.data.data;
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
      onError: (err: { response?: { data?: { error?: string } } }) =>
        toast.error(err?.response?.data?.error ?? "Could not add mapping."),
    });
    const remove = useMutation({
      mutationFn: async (id: string) => {
        await api.delete(`${endpoint}/${id}`);
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
      onError: (err: { response?: { data?: { error?: string } } }) =>
        toast.error(err?.response?.data?.error ?? "Could not remove mapping."),
    });
    return { add, remove };
  }

  const siteBuMut = useMappingMutations(
    "/organizational-structure/mapping/site-business-units",
    "org_mapping_site_business_units",
  );
  const buDeptMut = useMappingMutations(
    "/organizational-structure/mapping/business-unit-departments",
    "org_mapping_business_unit_departments",
  );
  const deptSectionMut = useMappingMutations(
    "/organizational-structure/mapping/department-sections",
    "org_mapping_department_sections",
  );
  const sectionPositionMut = useMappingMutations(
    "/organizational-structure/mapping/section-positions",
    "org_mapping_section_positions",
  );

  function toggle(
    existing: { id: string } | undefined,
    checked: boolean,
    add: ReturnType<typeof useMappingMutations>["add"],
    remove: ReturnType<typeof useMappingMutations>["remove"],
    body: Record<string, string>,
  ) {
    if (checked) {
      if (!existing) add.mutate(body);
    } else if (existing) {
      remove.mutate(existing.id);
    }
  }

  // Level 1 — Site set up
  const [site1, setSite1] = useState("");

  // Level 2 — Business unit set up (chain: site -> business unit)
  const [site2, setSite2] = useState("");
  const [bu2, setBu2] = useState("");
  const sitesForLevel2 = optionsFromRows(siteBuRows, "site_id", sites);
  const busForLevel2 = optionsFromRows(siteBuRows, "business_unit_id", businessUnits, {
    site_id: site2,
  });

  // Level 3 — Department set up (chain: site -> business unit -> department)
  const [site3, setSite3] = useState("");
  const [bu3, setBu3] = useState("");
  const [dept3, setDept3] = useState("");
  const sitesForLevel3 = optionsFromRows(buDeptRows, "site_id", sites);
  const busForLevel3 = optionsFromRows(buDeptRows, "business_unit_id", businessUnits, {
    site_id: site3,
  });
  const deptsForLevel3 = optionsFromRows(buDeptRows, "department_id", departments, {
    site_id: site3,
    business_unit_id: bu3,
  });

  // Level 4 — Section set up (chain: site -> business unit -> department -> section)
  const [site4, setSite4] = useState("");
  const [bu4, setBu4] = useState("");
  const [dept4, setDept4] = useState("");
  const [section4, setSection4] = useState("");
  const sitesForLevel4 = optionsFromRows(deptSectionRows, "site_id", sites);
  const busForLevel4 = optionsFromRows(deptSectionRows, "business_unit_id", businessUnits, {
    site_id: site4,
  });
  const deptsForLevel4 = optionsFromRows(deptSectionRows, "department_id", departments, {
    site_id: site4,
    business_unit_id: bu4,
  });
  const sectionsForLevel4 = optionsFromRows(deptSectionRows, "section_id", sections, {
    site_id: site4,
    business_unit_id: bu4,
    department_id: dept4,
  });

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
        href="/dashboard/system-definitions/organizational-structure"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Organizational structure
      </Link>

      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Network className="w-5 h-5 text-red-600" />
          Org structure mapping set up
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Link each level to the level above it — Site to Business unit, Business unit to
          Department, Department to Section, Section to Position. Create job posting then only
          offers items that have been mapped here, cascading one field at a time.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-wrap gap-1 border-b border-gray-100 pb-2 mb-4">
          {(Object.keys(TAB_LABELS) as TabId[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                activeTab === tab
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {activeTab === "site" && (
          <div className="space-y-4 max-w-lg">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Site</span>
              <select
                value={site1}
                onChange={(e) => setSite1(e.target.value)}
                className={selectClass}
              >
                <option value="">Select a site…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            {site1 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Business units available at {labelFor(sites, site1)}
                </p>
                {businessUnits.length === 0 ? (
                  <p className="text-sm text-gray-400">No business units set up yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {businessUnits.map((bu) => {
                      const row = siteBuRows.find(
                        (r) => r.site_id === site1 && r.business_unit_id === bu.id,
                      );
                      return (
                        <label
                          key={bu.id}
                          className="flex items-center gap-2 text-sm text-gray-800 border border-gray-100 rounded-lg px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={!!row}
                            disabled={!canEdit}
                            onChange={(e) =>
                              toggle(row, e.target.checked, siteBuMut.add, siteBuMut.remove, {
                                site_id: site1,
                                business_unit_id: bu.id,
                              })
                            }
                            className="accent-red-600 w-4 h-4"
                          />
                          {bu.label}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "business_unit" && (
          <div className="space-y-4 max-w-lg">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Site</span>
              <select
                value={site2}
                onChange={(e) => {
                  setSite2(e.target.value);
                  setBu2("");
                }}
                className={selectClass}
              >
                <option value="">Select a site…</option>
                {sitesForLevel2.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              {sitesForLevel2.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  No sites have any business units mapped yet — set that up under Site set up first.
                </p>
              )}
            </label>

            {site2 && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Business unit</span>
                <select
                  value={bu2}
                  onChange={(e) => setBu2(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select a business unit…</option>
                  {busForLevel2.map((bu) => (
                    <option key={bu.id} value={bu.id}>
                      {bu.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {site2 && bu2 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Departments available at {labelFor(sites, site2)} / {labelFor(businessUnits, bu2)}
                </p>
                {departments.length === 0 ? (
                  <p className="text-sm text-gray-400">No departments set up yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {departments.map((dept) => {
                      const row = buDeptRows.find(
                        (r) =>
                          r.site_id === site2 &&
                          r.business_unit_id === bu2 &&
                          r.department_id === dept.id,
                      );
                      return (
                        <label
                          key={dept.id}
                          className="flex items-center gap-2 text-sm text-gray-800 border border-gray-100 rounded-lg px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={!!row}
                            disabled={!canEdit}
                            onChange={(e) =>
                              toggle(row, e.target.checked, buDeptMut.add, buDeptMut.remove, {
                                site_id: site2,
                                business_unit_id: bu2,
                                department_id: dept.id,
                              })
                            }
                            className="accent-red-600 w-4 h-4"
                          />
                          {dept.label}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "department" && (
          <div className="space-y-4 max-w-lg">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Site</span>
              <select
                value={site3}
                onChange={(e) => {
                  setSite3(e.target.value);
                  setBu3("");
                  setDept3("");
                }}
                className={selectClass}
              >
                <option value="">Select a site…</option>
                {sitesForLevel3.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              {sitesForLevel3.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  No site + business unit has any department mapped yet — set that up under
                  Business unit set up first.
                </p>
              )}
            </label>

            {site3 && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Business unit</span>
                <select
                  value={bu3}
                  onChange={(e) => {
                    setBu3(e.target.value);
                    setDept3("");
                  }}
                  className={selectClass}
                >
                  <option value="">Select a business unit…</option>
                  {busForLevel3.map((bu) => (
                    <option key={bu.id} value={bu.id}>
                      {bu.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {site3 && bu3 && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Department</span>
                <select
                  value={dept3}
                  onChange={(e) => setDept3(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select a department…</option>
                  {deptsForLevel3.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {site3 && bu3 && dept3 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Sections available at {labelFor(sites, site3)} / {labelFor(businessUnits, bu3)} /{" "}
                  {labelFor(departments, dept3)}
                </p>
                {sections.length === 0 ? (
                  <p className="text-sm text-gray-400">No sections set up yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {sections.map((section) => {
                      const row = deptSectionRows.find(
                        (r) =>
                          r.site_id === site3 &&
                          r.business_unit_id === bu3 &&
                          r.department_id === dept3 &&
                          r.section_id === section.id,
                      );
                      return (
                        <label
                          key={section.id}
                          className="flex items-center gap-2 text-sm text-gray-800 border border-gray-100 rounded-lg px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={!!row}
                            disabled={!canEdit}
                            onChange={(e) =>
                              toggle(
                                row,
                                e.target.checked,
                                deptSectionMut.add,
                                deptSectionMut.remove,
                                {
                                  site_id: site3,
                                  business_unit_id: bu3,
                                  department_id: dept3,
                                  section_id: section.id,
                                },
                              )
                            }
                            className="accent-red-600 w-4 h-4"
                          />
                          {section.label}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "section" && (
          <div className="space-y-4 max-w-lg">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Site</span>
              <select
                value={site4}
                onChange={(e) => {
                  setSite4(e.target.value);
                  setBu4("");
                  setDept4("");
                  setSection4("");
                }}
                className={selectClass}
              >
                <option value="">Select a site…</option>
                {sitesForLevel4.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              {sitesForLevel4.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  No site + business unit + department has any section mapped yet — set that up
                  under Department set up first.
                </p>
              )}
            </label>

            {site4 && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Business unit</span>
                <select
                  value={bu4}
                  onChange={(e) => {
                    setBu4(e.target.value);
                    setDept4("");
                    setSection4("");
                  }}
                  className={selectClass}
                >
                  <option value="">Select a business unit…</option>
                  {busForLevel4.map((bu) => (
                    <option key={bu.id} value={bu.id}>
                      {bu.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {site4 && bu4 && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Department</span>
                <select
                  value={dept4}
                  onChange={(e) => {
                    setDept4(e.target.value);
                    setSection4("");
                  }}
                  className={selectClass}
                >
                  <option value="">Select a department…</option>
                  {deptsForLevel4.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {site4 && bu4 && dept4 && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Section</span>
                <select
                  value={section4}
                  onChange={(e) => setSection4(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select a section…</option>
                  {sectionsForLevel4.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {site4 && bu4 && dept4 && section4 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Positions available at {labelFor(sites, site4)} / {labelFor(businessUnits, bu4)} /{" "}
                  {labelFor(departments, dept4)} / {labelFor(sections, section4)}
                </p>
                {positions.length === 0 ? (
                  <p className="text-sm text-gray-400">No job positions set up yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {positions.map((position) => {
                      const row = sectionPositionRows.find(
                        (r) =>
                          r.site_id === site4 &&
                          r.business_unit_id === bu4 &&
                          r.department_id === dept4 &&
                          r.section_id === section4 &&
                          r.position_id === position.id,
                      );
                      return (
                        <label
                          key={position.id}
                          className="flex items-center gap-2 text-sm text-gray-800 border border-gray-100 rounded-lg px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={!!row}
                            disabled={!canEdit}
                            onChange={(e) =>
                              toggle(
                                row,
                                e.target.checked,
                                sectionPositionMut.add,
                                sectionPositionMut.remove,
                                {
                                  site_id: site4,
                                  business_unit_id: bu4,
                                  department_id: dept4,
                                  section_id: section4,
                                  position_id: position.id,
                                },
                              )
                            }
                            className="accent-red-600 w-4 h-4"
                          />
                          {position.label}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
