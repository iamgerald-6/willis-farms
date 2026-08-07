"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { canManageAccessControl } from "@/lib/pagePermissions";
import { Search, ShieldCheck } from "lucide-react";
import { AccessControlTableSkeleton } from "@/components/skeletons/PageSkeletons";

export default function AccessControlPage() {
  const [search, setSearch] = useState("");

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (u.role === "super_admin") return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.first_name?.toLowerCase().includes(q) ||
        u.last_name?.toLowerCase().includes(q) ||
        u.company_id?.toLowerCase().includes(q)
      );
    });
  }, [users, search]);

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
    return <AccessControlTableSkeleton />;
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-red-600" />
            System Users Listing
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage page access and account status for each user
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white"
          />
        </div>
      </div>

      {/* Mobile: card list */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-12 text-center text-gray-400 text-sm">
            No users found.
          </div>
        ) : (
          filtered.map((u) => (
            <div
              key={u.user_id}
              className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
            >
              <p className="font-semibold text-gray-900 text-sm">
                {u.first_name} {u.last_name}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 break-all">{u.email}</p>
              <div className="flex items-center justify-between mt-3 gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={!!u.is_disabled}
                    readOnly
                    disabled
                    className="accent-red-600 w-4 h-4 cursor-default opacity-80"
                    aria-label={`${u.first_name} ${u.last_name} disabled status`}
                  />
                  Is Disabled
                </label>
                <Link
                  href={`/dashboard/access-control/${u.user_id}`}
                  className="inline-flex shrink-0 items-center justify-center whitespace-nowrap px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg border border-red-600 hover:bg-red-700 hover:border-red-700 transition shadow-sm"
                >
                  Manage User
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto bg-white shadow-sm rounded-xl border border-gray-200">
        <table className="w-full text-left text-sm min-w-[640px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold text-gray-600">
                User Full Name
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-center w-28">
                Is Disabled
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Login Id
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="py-16 text-center text-gray-400 text-sm"
                >
                  No users found.
                </td>
              </tr>
            ) : (
              filtered.map((u, i) => (
                <tr
                  key={u.user_id}
                  className={`border-b border-gray-100 ${
                    i % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.first_name} {u.last_name}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={!!u.is_disabled}
                      readOnly
                      disabled
                      className="accent-red-600 w-4 h-4 cursor-default opacity-80"
                      aria-label={`${u.first_name} ${u.last_name} disabled status`}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/dashboard/access-control/${u.user_id}`}
                      className="inline-flex items-center justify-center whitespace-nowrap px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg border border-red-600 hover:bg-red-700 hover:border-red-700 transition shadow-sm"
                    >
                      Manage User
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
