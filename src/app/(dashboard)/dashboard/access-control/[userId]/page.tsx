"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { isSuperAdmin } from "@/lib/accessControl";
import {
  canManageUserAccounts,
  getEffectivePermissionActionsForProfile,
} from "@/lib/permissionLevels";
import { hasIndividualPermissionOverride } from "@/lib/groupPermissionPresets";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import type { PagePermissionActions } from "@/lib/moduleRegistry/types";
import { permissionActionModuleCount } from "@/lib/permissionActions";
import PermissionMatrix from "../components/PermissionMatrix";
import { ArrowLeft, Loader2, Mail, ShieldCheck } from "lucide-react";
import { AccessControlManageSkeleton } from "@/components/skeletons/PageSkeletons";
import { toast } from "sonner";
import { getAccountStatus } from "@/lib/userAccountStatus";

const inputClass =
  "w-full border border-gray-200 p-2.5 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";

export default function ManageUserAccessPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = (params?.userId as string) ?? "";

  const [permissionActions, setPermissionActions] =
    useState<PagePermissionActions>({});
  const [isDisabled, setIsDisabled] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [initialized, setInitialized] = useState(false);

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const actor = users.find((u) => u.user_id === session?.user?.id);
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const actorProfile = resolveAccessProfile(actor, sessionRole);
  const canManage = canManageUserAccounts(actorProfile, sessionRole);

  const { data: groupPresetData } = useGroupPresets();
  const groupPresets = groupPresetData?.presets;

  const target = useMemo(
    () => users.find((u) => u.user_id === userId),
    [users, userId],
  );

  const isSelf = session?.user?.id === userId;

  useEffect(() => {
    if (!target || initialized) return;
    setPermissionActions(
      getEffectivePermissionActionsForProfile(target, groupPresets),
    );
    setIsDisabled(!!target.is_disabled);
    setFirstName(target.first_name ?? "");
    setLastName(target.last_name ?? "");
    setInitialized(true);
  }, [target, initialized, groupPresets]);

  const usesIndividual = target
    ? hasIndividualPermissionOverride(target)
    : false;

  const nameDirty =
    !!target &&
    (firstName.trim() !== (target.first_name ?? "").trim() ||
      lastName.trim() !== (target.last_name ?? "").trim());

  const permissionModuleCount = permissionActionModuleCount(permissionActions);

  const saveNameMutation = useMutation({
    mutationFn: async () => {
      if (!session?.user?.id) throw new Error("Not signed in.");
      const res = await api.patch("/access-control/name", {
        target_user_id: userId,
        updated_by: session.user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Name updated.");
      queryClient.invalidateQueries({ queryKey: ["get_users"] });
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Failed to update name.");
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/access-control/resend-invite", {
        target_user_id: userId,
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

  const saveMutation = useMutation({
    mutationFn: async (opts?: { resetToGroup?: boolean }) => {
      if (!session?.user?.id) throw new Error("Not signed in.");
      const res = await api.patch("/access-control", {
        target_user_id: userId,
        updated_by: session.user.id,
        page_permission_actions: opts?.resetToGroup ? {} : permissionActions,
        reset_to_group: opts?.resetToGroup === true,
        is_disabled: isSelf ? false : isDisabled,
      });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      toast.success(
        variables?.resetToGroup
          ? "User reset to group defaults."
          : "User access updated.",
      );
      queryClient.invalidateQueries({ queryKey: ["get_users"] });
      router.push("/dashboard/access-control");
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Update failed.");
    },
  });

  if (!canManage) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 text-sm">
            Manage User requires User Management edit access.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <AccessControlManageSkeleton />;
  }

  if (!target || isSuperAdmin(target.role)) {
    return (
      <div className="p-6">
        <Link
          href="/dashboard/access-control"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to listing
        </Link>
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 text-sm">User not found or not editable.</p>
        </div>
      </div>
    );
  }

  const displayName = `${firstName.trim() || target.first_name} ${lastName.trim() || target.last_name}`;
  const accountStatus = getAccountStatus(target);

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <Link
        href="/dashboard/access-control"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to listing
      </Link>

      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-red-600" />
          Manage User — {displayName}
        </h2>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-sm font-semibold text-gray-800">Account details</h3>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="first-name"
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5"
              >
                First name
              </label>
              <input
                id="first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
                placeholder="First name"
              />
            </div>
            <div>
              <label
                htmlFor="last-name"
                className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5"
              >
                Last name
              </label>
              <input
                id="last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => saveNameMutation.mutate()}
              disabled={
                saveNameMutation.isPending ||
                !nameDirty ||
                !firstName.trim() ||
                !lastName.trim()
              }
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center gap-2"
            >
              {saveNameMutation.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              Save name
            </button>
            {nameDirty && (
              <button
                type="button"
                onClick={() => {
                  setFirstName(target.first_name ?? "");
                  setLastName(target.last_name ?? "");
                }}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Login email
            </label>
            <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
              {target.email}
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Account status
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${accountStatus.className}`}
              >
                {accountStatus.label}
              </span>
              {accountStatus.label === "Active" && (
                <p className="text-xs text-gray-500">Password has been set.</p>
              )}
              {accountStatus.label === "Pending" && (
                <>
                  <p className="text-xs text-gray-500">
                    Waiting for them to set a password.
                  </p>
                  <button
                    type="button"
                    onClick={() => resendInviteMutation.mutate()}
                    disabled={resendInviteMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition disabled:opacity-60"
                  >
                    {resendInviteMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    Resend email
                  </button>
                </>
              )}
              {accountStatus.label === "Inactive" && (
                <p className="text-xs text-gray-500">
                  Account is disabled and cannot sign in.
                </p>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <label
              className={`inline-flex items-center gap-2 ${isSelf ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                checked={isDisabled}
                disabled={isSelf}
                onChange={(e) => setIsDisabled(e.target.checked)}
                className="accent-red-600 w-4 h-4 disabled:cursor-not-allowed"
              />
              <span className="text-sm font-medium text-gray-700">
                Disable user account
              </span>
            </label>
            {isSelf && (
              <p className="text-xs text-gray-500 mt-1">
                You cannot disable your own account.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-sm font-semibold text-gray-800">Module access</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {usesIndividual
              ? "This user has individual permissions that override their group defaults."
              : "This user follows group permissions for their role and grade band. Saving here creates an individual override."}
          </p>
        </div>

        <PermissionMatrix
          actions={permissionActions}
          onChange={setPermissionActions}
        />

        <div className="p-5 border-t border-gray-100 flex flex-wrap gap-3">
          {usesIndividual && (
            <button
              type="button"
              onClick={() => saveMutation.mutate({ resetToGroup: true })}
              disabled={saveMutation.isPending}
              className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              Reset to group defaults
            </button>
          )}
          <button
            type="button"
            onClick={() => saveMutation.mutate(undefined)}
            disabled={saveMutation.isPending || permissionModuleCount === 0}
            className="w-full sm:w-auto px-8 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saveMutation.isPending && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
            Save access changes
          </button>
        </div>
      </div>
    </div>
  );
}
