"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User, type Role } from "@/types";
import {
  groupedPagePermissions,
  PAGE_PERMISSION_LABELS,
  type PagePermissionKey,
} from "@/lib/pagePermissions";
import { canManageAccessControl } from "@/lib/pagePermissions";
import { GRADE_ORDER } from "@/lib/accessControl";
import { Loader2, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type AccessMode = "standard" | "full" | "delegated";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "manager", label: "Manager (full access)" },
  { value: "admin", label: "Admin (full access)" },
];

export default function AccessControlPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>("standard");
  const [role, setRole] = useState<Role>("employee");
  const [gradeLevel, setGradeLevel] = useState<string>("L1");
  const [pagePerms, setPagePerms] = useState<PagePermissionKey[]>([]);

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
  const canManage = canManageAccessControl(actor?.role, actor?.grade_level);

  const selected = users.find((u) => u.user_id === selectedId);

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

  const loadUserIntoForm = (user: User) => {
    setSelectedId(user.user_id);
    if (user.access_tier === "delegated") {
      setAccessMode("delegated");
      setPagePerms((user.page_permissions ?? []) as PagePermissionKey[]);
      setRole("employee");
    } else if (user.role === "admin" || user.role === "manager") {
      setAccessMode("full");
      setRole(user.role);
      setPagePerms([]);
    } else {
      setAccessMode("standard");
      setRole(user.role);
      setPagePerms([]);
    }
    setGradeLevel(user.grade_level ?? "L1");
  };

  const togglePerm = (key: PagePermissionKey) => {
    setPagePerms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !session?.user?.id) {
        throw new Error("Select a user first.");
      }
      const res = await api.patch("/access-control", {
        target_user_id: selectedId,
        updated_by: session.user.id,
        access_mode: accessMode,
        role: accessMode === "full" ? role : accessMode === "standard" ? role : "employee",
        grade_level: gradeLevel,
        page_permissions: accessMode === "delegated" ? pagePerms : [],
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Access updated.");
      queryClient.invalidateQueries({ queryKey: ["get_users"] });
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

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-red-600" />
          Access Control
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Grant full admin/manager access or delegated (sub-admin) page access
        </p>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-5">
        {/* User list */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl"
              />
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {isLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No users.</p>
            ) : (
              filtered.map((u) => {
                const active = selectedId === u.user_id;
                const badge =
                  u.access_tier === "delegated"
                    ? "Delegated"
                    : u.role === "admin" || u.role === "manager"
                      ? u.role
                      : u.grade_level ?? "employee";
                return (
                  <button
                    key={u.user_id}
                    type="button"
                    onClick={() => loadUserIntoForm(u)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 transition ${
                      active ? "bg-red-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">
                      {u.first_name} {u.last_name}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 capitalize">
                      {badge}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          {!selected ? (
            <p className="text-sm text-gray-400 text-center py-16">
              Select a user to manage their access.
            </p>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {selected.first_name} {selected.last_name}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selected.email} · {selected.company_id}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Access type
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  {(
                    [
                      ["standard", "Standard employee"],
                      ["full", "Full access (role)"],
                      ["delegated", "Sub-admin (pages only)"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setAccessMode(mode)}
                      className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border ${
                        accessMode === mode
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {(accessMode === "full" || accessMode === "standard") && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as Role)}
                      disabled={accessMode === "full" && false}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    >
                      {ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">
                      Grade level
                    </label>
                    <select
                      value={gradeLevel}
                      onChange={(e) => setGradeLevel(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    >
                      {GRADE_ORDER.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-gray-400 mt-1">
                      L5+ grants full appraisal access regardless of role.
                    </p>
                  </div>
                </div>
              )}

              {accessMode === "full" && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Full access via Admin or Manager role — user sees all pages.
                  Even 9/10 pages on delegated mode stays sub-admin; use this for
                  full access.
                </p>
              )}

              {accessMode === "delegated" && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Allowed pages
                  </p>
                  <div className="space-y-4">
                    {groupedPagePermissions().map(({ group, keys }) => (
                      <div key={group}>
                        <p className="text-xs font-bold text-gray-700 mb-2">
                          {group}
                        </p>
                        <div className="grid sm:grid-cols-2 gap-2">
                          {keys.map((key) => (
                            <label
                              key={key}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${
                                pagePerms.includes(key)
                                  ? "border-red-300 bg-red-50 text-red-800"
                                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={pagePerms.includes(key)}
                                onChange={() => togglePerm(key)}
                                className="accent-red-600"
                              />
                              {PAGE_PERMISSION_LABELS[key].label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="w-full py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saveMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Save access
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
