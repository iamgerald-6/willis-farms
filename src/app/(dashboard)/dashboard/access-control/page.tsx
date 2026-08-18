"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { isSuperAdmin } from "@/lib/accessControl";
import {
  canAddUser,
  canManageUserAccounts,
  canOpenUserManagement,
} from "@/lib/permissionLevels";
import { Loader2, Mail, Plus, Search, Users } from "lucide-react";
import { AccessControlTableSkeleton } from "@/components/skeletons/PageSkeletons";
import CreateUserModal from "@/app/(dashboard)/dashboard/components/createModal";
import { toast } from "sonner";
import { getAccountStatus } from "@/lib/userAccountStatus";
import {
  gradeBandGroup,
  roleGroup,
  type UserListGroup,
} from "@/lib/permissionActions";
import {
  groupPresetKeyFromListGroup,
  hasIndividualPermissionOverride,
  type GroupPresetKey,
} from "@/lib/groupPermissionPresets";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import GroupPermissionPanel from "./components/GroupPermissionPanel";

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-red-50 text-red-700 border border-red-200",
  admin: "bg-purple-50 text-purple-700 border border-purple-200",
  manager: "bg-blue-50 text-blue-700 border border-blue-200",
  employee: "bg-green-50 text-green-700 border border-green-200",
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
  const [search, setSearch] = useState("");
  const [listGroup, setListGroup] = useState<UserListGroup>("all");
  const [modalOpen, setModalOpen] = useState(false);
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

  const actor = users.find((u) => u.user_id === session?.user?.id);
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const actorProfile = resolveAccessProfile(actor, sessionRole);
  const canOpen = canOpenUserManagement(actorProfile, sessionRole);
  const canAdd = canAddUser(actorProfile, sessionRole);
  const canManageAccounts = canManageUserAccounts(actorProfile, sessionRole);

  const { data: groupPresetData, isLoading: presetsLoading } = useGroupPresets();
  const activeGroupKey = groupPresetKeyFromListGroup(listGroup);
  const activeGroupActions =
    activeGroupKey && groupPresetData?.presets
      ? groupPresetData.presets[activeGroupKey] ?? {}
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (isSuperAdmin(u.role)) return false;

      if (listGroup === "employees" && roleGroup(u.role) !== "employees") {
        return false;
      }
      if (listGroup === "managers" && roleGroup(u.role) !== "managers") {
        return false;
      }
      if (listGroup === "admins" && roleGroup(u.role) !== "admins") {
        return false;
      }
      if (
        listGroup === "grade_l1_l3" &&
        gradeBandGroup(u.grade_level) !== "grade_l1_l3"
      ) {
        return false;
      }
      if (
        listGroup === "grade_l4_l7" &&
        gradeBandGroup(u.grade_level) !== "grade_l4_l7"
      ) {
        return false;
      }

      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.first_name?.toLowerCase().includes(q) ||
        u.last_name?.toLowerCase().includes(q) ||
        u.company_id?.toLowerCase().includes(q) ||
        u.job_position?.toLowerCase().includes(q)
      );
    });
  }, [users, search, listGroup]);

  const groupTabs: { id: UserListGroup; label: string }[] = [
    { id: "all", label: "All users" },
    { id: "employees", label: "Employees" },
    { id: "managers", label: "Managers" },
    { id: "admins", label: "Admins" },
    { id: "grade_l4_l7", label: "L4–L7" },
    { id: "grade_l1_l3", label: "L1–L3" },
  ];

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
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users…"
              className="w-full sm:w-56 pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
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

      <div className="mb-4 flex flex-wrap gap-2">
        {groupTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setListGroup(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              listGroup === tab.id
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
                    </p>
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
              <th className="px-4 py-3 font-semibold text-gray-600 w-[34%]">User</th>
              <th className="px-4 py-3 font-semibold text-gray-600 w-[12%]">Role</th>
              <th className="px-4 py-3 font-semibold text-gray-600 w-[10%]">Status</th>
              <th className="px-4 py-3 font-semibold text-gray-600 w-[22%]">Added</th>
              <th className="px-4 py-3 font-semibold text-gray-600 w-[22%] text-right">
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
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                          ROLE_COLORS[u.role] ??
                          "bg-gray-100 text-gray-600 border border-gray-200"
                        }`}
                      >
                        {u.role.replace("_", " ")}
                      </span>
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
