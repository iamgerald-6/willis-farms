"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import {
  canManageAccessControl,
  getEffectivePagePermissions,
  PAGE_PERMISSION_KEYS,
  PAGE_PERMISSION_LABELS,
  type PagePermissionKey,
} from "@/lib/pagePermissions";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { AccessControlManageSkeleton } from "@/components/skeletons/PageSkeletons";
import { toast } from "sonner";

export default function ManageUserAccessPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = (params?.userId as string) ?? "";

  const [pagePerms, setPagePerms] = useState<PagePermissionKey[]>([]);
  const [isDisabled, setIsDisabled] = useState(false);
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
  const canManage = canManageAccessControl(
    actor?.role ?? sessionRole,
    actor?.grade_level,
  );

  const target = useMemo(
    () => users.find((u) => u.user_id === userId),
    [users, userId],
  );

  useEffect(() => {
    if (!target || initialized) return;
    setPagePerms(getEffectivePagePermissions(target));
    setIsDisabled(!!target.is_disabled);
    setInitialized(true);
  }, [target, initialized]);

  const togglePerm = (key: PagePermissionKey) => {
    setPagePerms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!session?.user?.id) throw new Error("Not signed in.");
      const res = await api.patch("/access-control", {
        target_user_id: userId,
        updated_by: session.user.id,
        page_permissions: pagePerms,
        is_disabled: isDisabled,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("User access updated.");
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
            Access Control is available to Super Admin, Admin, and Manager (L5+)
            only.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <AccessControlManageSkeleton />;
  }

  if (!target || target.role === "super_admin") {
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
          System User Maintenance
        </h2>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">
              User Name
            </label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900">
              {target.first_name} {target.last_name}
            </div>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isDisabled}
              onChange={(e) => setIsDisabled(e.target.checked)}
              className="accent-red-600 w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-700">
              Disable User Account
            </span>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 font-semibold text-gray-600">
                  Page Name
                </th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-center w-32">
                  Allow View
                </th>
              </tr>
            </thead>
            <tbody>
              {PAGE_PERMISSION_KEYS.map((key, i) => (
                <tr
                  key={key}
                  className={`border-b border-gray-100 ${
                    i % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                  }`}
                >
                  <td className="px-4 py-3 text-gray-800">
                    {PAGE_PERMISSION_LABELS[key].label}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={pagePerms.includes(key)}
                      onChange={() => togglePerm(key)}
                      className="accent-red-600 w-4 h-4 cursor-pointer"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-5 border-t border-gray-100">
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || pagePerms.length === 0}
            className="w-full sm:w-auto px-8 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saveMutation.isPending && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
