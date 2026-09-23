"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import {
  canAddUser,
  canManageUserAccounts,
  canOpenUserManagement,
} from "@/lib/permissionLevels";
import { Loader2, Mail, Plus, Users } from "lucide-react";
import { AccessControlTableSkeleton } from "@/components/skeletons/PageSkeletons";
import { MultiSelectFilter, FilterChip } from "@/components/filters/MultiSelectFilter";
import CreateUserModal from "@/app/(dashboard)/dashboard/components/createModal";
import { toast } from "sonner";
import { getAccountStatus } from "@/lib/userAccountStatus";
import { roleGroup, type UserListGroup } from "@/lib/permissionActions";
import {
  groupPresetKeyFromListGroup,
  hasIndividualPermissionOverride,
  type GroupPresetKey,
} from "@/lib/groupPermissionPresets";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import GroupPermissionPanel from "./components/GroupPermissionPanel";
import {
  isSuperAdminRoleLabel,
  USER_ROLE_GROUP_KEYS,
  userRoleGroupKeyLabel,
} from "@/lib/userRoleAccessControl";
import type { OrgCustomListType, OrgCustomListItem } from "@/lib/organizationalStructureCustomLists";

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-red-50 text-red-700 border border-red-200",
  executive_role: "bg-purple-50 text-purple-700 border border-purple-200",
  system_administrator: "bg-orange-50 text-orange-700 border border-orange-200",
  human_resource: "bg-blue-50 text-blue-700 border border-blue-200",
  supervisory_role: "bg-teal-50 text-teal-700 border border-teal-200",
  consultant: "bg-yellow-50 text-yellow-700 border border-yellow-200",
  standard_role: "bg-green-50 text-green-700 border border-green-200",
};

function UserAvatar({ first, last }: { first: string; last: string }) {
  const initials = `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
      {initials}
    </div>
  );
}

function formatAddedOn(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ user }: { user: User }) {
  const status = getAccountStatus(user);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${status.className}`}
    >
      {status.label}
    </span>
  );
}

export default function UserManagementPage() {
  const [listGroup, setListGroup] = useState<UserListGroup>("all");
  const [modalOpen, setModalOpen] = useState(false);
  // Same multi-select cross-filtering pattern as the Recruitment
  // "Applications" tab (src/components/filters/MultiSelectFilter.tsx):
  // each field's option list is scoped by the OTHER active filters, never
  // by itself, and values from different fields combine with AND.
  const [nameFilters, setNameFilters] = useState<string[]>([]);
  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [siteFilters, setSiteFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users = [], isLoading, refetch } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const { data: groupPresetData, isLoading: presetsLoading } = useGroupPresets();
  const groupPresets = groupPresetData?.presets;

  const actor = users.find((u) => u.user_id === session?.user?.id);
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const actorProfile = resolveAccessProfile(actor, sessionRole);
  const canOpen = canOpenUserManagement(
    actorProfile,
    sessionRole,
    groupPresets,
  );
  const canAdd = canAddUser(actorProfile, sessionRole, groupPresets);
  const canManageAccounts = canManageUserAccounts(
    actorProfile,
    sessionRole,
    groupPresets,
  );

  // This whole page is headquarters-only (see RouteAccessGuard's
  // HEADQUARTERS_ONLY_ROUTE_PREFIXES) — every viewer who can reach it is
  // already a headquarters caller, so the Site column below is shown
  // unconditionally rather than gated again here.
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
  const siteLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sites) map[String(s.id)] = s.label;
    return map;
  }, [sites]);
  const siteLabelForUser = (u: User) =>
    u.site_id != null ? siteLabelById[String(u.site_id)] ?? "Unknown site" : "—";

  const activeGroupKey = groupPresetKeyFromListGroup(listGroup);
  const activeGroupActions =
    activeGroupKey && groupPresets
      ? groupPresets[activeGroupKey] ?? {}
      : null;

  const resendInviteMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const res = await api.post("/access-control/resend-invite", {
        target_user_id: targetUserId,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Setup email sent.");
      queryClient.invalidateQueries({ queryKey: ["get_users"] });
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Could not send email.");
    },
  });

  const creatorNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) {
      map[u.user_id] = `${u.first_name} ${u.last_name}`.trim() || u.email;
    }
    return map;
  }, [users]);

  // Resolved through the same path every other page uses — the new
  // user_role_label, never the stale raw `role` column.
  const resolvedRole = (u: User) => resolveAccessProfile(u, undefined)?.role ?? "Standard Role";

  const userDisplayName = (u: User) =>
    `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email;

  // Coarser role-group tab (e.g. "Human Capital roles") applied first — the
  // granular Name/Role/Site/Status filters below all scope off of this, same
  // as before this feature existed, so the GroupPermissionPanel above stays
  // in sync with what the table shows.
  const groupFiltered = useMemo(() => {
    return users.filter((u) => {
      const role = resolvedRole(u);
      if (isSuperAdminRoleLabel(role)) return false;
      if (listGroup !== "all" && roleGroup(role) !== listGroup) return false;
      return true;
    });
  }, [users, listGroup]);

  // Same cross-filtering pattern as the Applications tab: each field's
  // option list is scoped by the OTHER active filters (never by itself).
  const applyFilters = (
    list: User[],
    active: { name?: string[]; role?: string[]; site?: string[]; status?: string[] },
  ) =>
    list.filter((u) => {
      if (active.name?.length && !active.name.includes(userDisplayName(u))) return false;
      if (active.role?.length && !active.role.includes(resolvedRole(u))) return false;
      if (active.site?.length && !active.site.includes(siteLabelForUser(u))) return false;
      if (active.status?.length && !active.status.includes(getAccountStatus(u).label)) return false;
      return true;
    });

  const nameOptions = useMemo(() => {
    const scoped = applyFilters(groupFiltered, {
      role: roleFilters,
      site: siteFilters,
      status: statusFilters,
    });
    const names = Array.from(new Set(scoped.map(userDisplayName))).sort();
    return names.map((n) => ({ value: n, label: n }));
  }, [groupFiltered, roleFilters, siteFilters, statusFilters]);

  const roleOptions = useMemo(() => {
    const scoped = applyFilters(groupFiltered, {
      name: nameFilters,
      site: siteFilters,
      status: statusFilters,
    });
    const roles = Array.from(new Set(scoped.map(resolvedRole))).sort();
    return roles.map((r) => ({ value: r, label: r }));
  }, [groupFiltered, nameFilters, siteFilters, statusFilters]);

  const siteOptions = useMemo(() => {
    const scoped = applyFilters(groupFiltered, {
      name: nameFilters,
      role: roleFilters,
      status: statusFilters,
    });
    const siteLabels = Array.from(new Set(scoped.map(siteLabelForUser))).sort();
    return siteLabels.map((s) => ({ value: s, label: s }));
  }, [groupFiltered, nameFilters, roleFilters, statusFilters]);

  const statusOptions = useMemo(() => {
    const scoped = applyFilters(groupFiltered, {
      name: nameFilters,
      role: roleFilters,
      site: siteFilters,
    });
    const statuses = Array.from(new Set(scoped.map((u) => getAccountStatus(u).label))).sort();
    return statuses.map((s) => ({ value: s, label: s }));
  }, [groupFiltered, nameFilters, roleFilters, siteFilters]);

  const filtered = useMemo(
    () =>
      applyFilters(groupFiltered, {
        name: nameFilters,
        role: roleFilters,
        site: siteFilters,
        status: statusFilters,
      }),
    [groupFiltered, nameFilters, roleFilters, siteFilters, statusFilters],
  );

  const hasActiveFilters =
    nameFilters.length + roleFilters.length + siteFilters.length + statusFilters.length > 0;
  const clearAllFilters = () => {
    setNameFilters([]);
    setRoleFilters([]);
    setSiteFilters([]);
    setStatusFilters([]);
  };

  const groupTabs: { id: UserListGroup; label: string }[] = useMemo(
    () => [
      { id: "all", label: "All users" },
      ...USER_ROLE_GROUP_KEYS.map((key) => ({
        id: key as UserListGroup,
        label: userRoleGroupKeyLabel(key),
      })),
    ],
    [],
  );

  if (!canOpen) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 text-sm">
            User Management access is required to view this page.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || (activeGroupKey && presetsLoading)) {
    return <AccessControlTableSkeleton />;
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-red-600" />
            User Management
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} user{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canAdd && (
            <button
              onClick={() => setModalOpen(true)}
              className="bg-red-600 text-white flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm font-medium shadow-sm flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add User</span>
              <span className="sm:hidden">Add</span>
            </button>
          )}
        </div>
      </div>

      <div className="mb-4">
        <select
          value={listGroup}
          onChange={(e) => setListGroup(e.target.value as UserListGroup)}
          className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          {groupTabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <MultiSelectFilter
          label="Name"
          options={nameOptions}
          selected={nameFilters}
          onChange={setNameFilters}
        />
        <MultiSelectFilter
          label="Role"
          options={roleOptions}
          selected={roleFilters}
          onChange={setRoleFilters}
        />
        <MultiSelectFilter
          label="Site"
          options={siteOptions}
          selected={siteFilters}
          onChange={setSiteFilters}
        />
        <MultiSelectFilter
          label="Status"
          options={statusOptions}
          selected={statusFilters}
          onChange={setStatusFilters}
        />
      </div>

      {hasActiveFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {nameFilters.map((n) => (
            <FilterChip
              key={`name-${n}`}
              label={n}
              onRemove={() => setNameFilters(nameFilters.filter((v) => v !== n))}
            />
          ))}
          {roleFilters.map((r) => (
            <FilterChip
              key={`role-${r}`}
              label={r}
              onRemove={() => setRoleFilters(roleFilters.filter((v) => v !== r))}
            />
          ))}
          {siteFilters.map((s) => (
            <FilterChip
              key={`site-${s}`}
              label={s}
              onRemove={() => setSiteFilters(siteFilters.filter((v) => v !== s))}
            />
          ))}
          {statusFilters.map((s) => (
            <FilterChip
              key={`status-${s}`}
              label={s}
              onRemove={() => setStatusFilters(statusFilters.filter((v) => v !== s))}
            />
          ))}
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs font-semibold text-gray-400 hover:text-red-600 ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      {activeGroupKey && activeGroupActions && (
        <GroupPermissionPanel
          groupKey={activeGroupKey as GroupPresetKey}
          initialActions={activeGroupActions}
          canEdit={canManageAccounts}
        />
      )}

      {/* Mobile: card list */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-12 text-center text-gray-400 text-sm">
            No users found.
          </div>
        ) : (
          filtered.map((u) => {
            const status = getAccountStatus(u);
            const showResend = canAdd && status.canResend;

            return (
              <div
                key={u.user_id}
                className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <UserAvatar first={u.first_name ?? ""} last={u.last_name ?? ""} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">
                          {u.first_name} {u.last_name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 break-all">{u.email}</p>
                      </div>
                      <StatusBadge user={u} />
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      {u.job_position ?? "—"}
                      {u.grade_level ? ` · ${u.grade_level}` : ""}
                      {u.company_id ? ` · ${u.company_id}` : ""}
                      {` · ${siteLabelForUser(u)}`}
                    </p>
                    {hasIndividualPermissionOverride(u) && (
                      <p className="text-[10px] text-amber-600 mt-1 font-medium">
                        Individual permissions
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Added {formatAddedOn(u.created_at)}
                      {canManageAccounts && u.created_by && (
                        <> · {creatorNameById[u.created_by] ?? "Unknown"}</>
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  {showResend && (
                    <button
                      type="button"
                      onClick={() => resendInviteMutation.mutate(u.user_id)}
                      disabled={
                        resendInviteMutation.isPending &&
                        resendInviteMutation.variables === u.user_id
                      }
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-3 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition disabled:opacity-60"
                    >
                      {resendInviteMutation.isPending &&
                      resendInviteMutation.variables === u.user_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                      Resend
                    </button>
                  )}
                  {canManageAccounts && (
                    <Link
                      href={`/dashboard/access-control/${u.user_id}`}
                      className="inline-flex shrink-0 items-center justify-center whitespace-nowrap px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg border border-red-600 hover:bg-red-700 transition shadow-sm"
                    >
                      Manage
                    </Link>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop: compact table — fits the content area without horizontal scroll */}
      <div className="hidden md:block bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-left text-sm table-fixed">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold text-gray-600 w-[28%]">User</th>
              <th className="px-4 py-3 font-semibold text-gray-600 w-[12%]">Role</th>
              <th className="px-4 py-3 font-semibold text-gray-600 w-[12%]">Site</th>
              <th className="px-4 py-3 font-semibold text-gray-600 w-[10%]">Status</th>
              <th className="px-4 py-3 font-semibold text-gray-600 w-[18%]">Added</th>
              <th className="px-4 py-3 font-semibold text-gray-600 w-[20%] text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-gray-400 text-sm">
                  No users found.
                </td>
              </tr>
            ) : (
              filtered.map((u, i) => {
                const status = getAccountStatus(u);
                const showResend = canAdd && status.canResend;

                return (
                  <tr
                    key={u.user_id}
                    className={`border-b border-gray-100 ${
                      i % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                    }`}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <UserAvatar
                          first={u.first_name ?? ""}
                          last={u.last_name ?? ""}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {u.first_name} {u.last_name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{u.email}</p>
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {[u.job_position, u.grade_level, u.company_id]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </p>
                          {hasIndividualPermissionOverride(u) && (
                            <p className="text-[10px] text-amber-600 mt-0.5 font-medium">
                              Individual permissions
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          ROLE_COLORS[roleGroup(resolvedRole(u)) ?? ""] ??
                          "bg-gray-100 text-gray-600 border border-gray-200"
                        }`}
                      >
                        {resolvedRole(u)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-gray-600 truncate">
                      {siteLabelForUser(u)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusBadge user={u} />
                    </td>
                    <td className="px-4 py-3 align-top text-gray-500">
                      <p className="whitespace-nowrap">{formatAddedOn(u.created_at)}</p>
                      {canManageAccounts && u.created_by && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          by {creatorNameById[u.created_by] ?? "Unknown"}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {showResend && (
                          <button
                            type="button"
                            onClick={() => resendInviteMutation.mutate(u.user_id)}
                            disabled={
                              resendInviteMutation.isPending &&
                              resendInviteMutation.variables === u.user_id
                            }
                            className="inline-flex items-center justify-center p-2 bg-white text-gray-600 rounded-lg border border-gray-300 hover:bg-gray-50 transition disabled:opacity-60"
                            title="Resend setup email"
                          >
                            {resendInviteMutation.isPending &&
                            resendInviteMutation.variables === u.user_id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Mail className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        {canManageAccounts ? (
                          <Link
                            href={`/dashboard/access-control/${u.user_id}`}
                            className="inline-flex items-center justify-center whitespace-nowrap px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition shadow-sm"
                          >
                            Manage
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400">View only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <CreateUserModal
        open={modalOpen}
        setOpen={setModalOpen}
        refetch={refetch}
      />
    </div>
  );
}
