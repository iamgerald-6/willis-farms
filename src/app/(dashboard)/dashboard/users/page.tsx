"use client";

import { useState } from "react";
import { Plus, X, Trash2, Loader2, Search } from "lucide-react";
import CreateUserModal from "@/app/(dashboard)/dashboard/components/createModal";
import { User } from "@/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";

function ConfirmDeleteDialog({
  label,
  isDeleting,
  onConfirm,
  onCancel,
}: {
  label: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-bold text-gray-900 mb-1">
          Confirm Delete
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-red-600">{label}</span>? This
          action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Deleting...
              </>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

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

export default function UserTablePage() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    userIds: string[];
    label: string;
  }>({ open: false, userIds: [], label: "" });
  const [searchValue, setSearchValue] = useState("");

  const { data, refetch } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => (await api.get("/get_user")).data,
  });

  const users = data ?? [];

  const filteredData = users.filter((user) => {
    if (!searchValue) return true;
    const q = searchValue.toLowerCase();
    return (
      user.email.toLowerCase().includes(q) ||
      user.first_name?.toLowerCase().includes(q) ||
      user.last_name?.toLowerCase().includes(q) ||
      user.company_id?.toLowerCase().includes(q) ||
      user.job_position?.toLowerCase().includes(q)
    );
  });

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  const selectAll = () => setSelectedIds(users.map((u) => u.user_id));
  const clearSelection = () => setSelectedIds([]);
  const allSelected = users.length > 0 && selectedIds.length === users.length;
  const promptDelete = (userIds: string[], label: string) =>
    setConfirmDelete({ open: true, userIds, label });

  const { mutate: togglePermission, isPending: isTogglingPermission } = useMutation({
    mutationFn: async ({ userId, value }: { userId: string; value: boolean }) =>
      (await api.patch(`/task-manager/users/${userId}/permissions`, { tm_can_view_all_tasks: value })).data,
    onSuccess: () => refetch(),
    onError: (error: any) => {
      toast.error(error?.response?.data?.error ?? "Failed to update permission");
    },
  });

  const { mutate: handleDelete, isPending: isDeleting } = useMutation({
    mutationFn: async (userIds: string[]) =>
      (await api.delete("/delete_user", { data: { userIds } })).data,
    onSuccess: () => {
      toast.success(
        confirmDelete.userIds.length > 1
          ? `${confirmDelete.userIds.length} users deleted.`
          : "User deleted.",
      );
      clearSelection();
      refetch();
      setConfirmDelete({ open: false, userIds: [], label: "" });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.error ?? "Server error. Please try again.",
      );
      setConfirmDelete({ open: false, userIds: [], label: "" });
    },
  });

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      {/* ── Header / Toolbar ── */}
      <div className="mb-5">
        {selectedIds.length === 0 ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Users</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {users.length} user{users.length !== 1 ? "s" : ""} registered
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 w-full sm:w-56"
                />
              </div>
              <button
                onClick={() => setModalOpen(true)}
                className="bg-red-600 text-white flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm font-medium shadow-sm flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add User</span>
                <span className="sm:hidden">Add</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">
              {selectedIds.length} selected
            </span>
            <button
              onClick={clearSelection}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              onClick={() =>
                promptDelete(
                  selectedIds,
                  `${selectedIds.length} user${selectedIds.length > 1 ? "s" : ""}`,
                )
              }
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition ml-auto"
            >
              <Trash2 className="w-4 h-4" />
              Delete {selectedIds.length}
            </button>
          </div>
        )}
      </div>

      {/* ── Mobile: card list ── */}
      <div className="md:hidden space-y-3">
        {filteredData.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 px-4 py-12 text-center text-gray-400 text-sm">
            No users found.
          </div>
        ) : (
          filteredData.map((user) => {
            const isSelected = selectedIds.includes(user.user_id);
            return (
              <div
                key={user.user_id}
                className={`bg-white rounded-xl border p-4 transition ${
                  isSelected ? "border-red-300 bg-red-50" : "border-gray-100"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(user.user_id)}
                    className="accent-red-600 w-4 h-4 cursor-pointer mt-1 flex-shrink-0"
                  />
                  <UserAvatar
                    first={user.first_name ?? ""}
                    last={user.last_name ?? ""}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {user.first_name} {user.last_name}
                      </p>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize flex-shrink-0 ${
                          ROLE_COLORS[user.role] ??
                          "bg-gray-100 text-gray-600 border border-gray-200"
                        }`}
                      >
                        {user.role.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {user.email}
                    </p>
                    <div className="flex items-center flex-wrap gap-2 mt-2">
                      {user.company_id && (
                        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {user.company_id}
                        </span>
                      )}
                      {user.job_position && (
                        <span className="text-xs text-gray-400">
                          {user.job_position}
                        </span>
                      )}
                      {user.grade_level && (
                        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {user.grade_level}
                        </span>
                      )}
                    </div>
                    <div className="mt-2">
                      {user.role === "super_admin" ? (
                        <span className="text-xs text-gray-400">Sees all tasks (super admin)</span>
                      ) : (
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-gray-500">
                          <input
                            type="checkbox"
                            checked={!!user.tm_can_view_all_tasks}
                            disabled={isTogglingPermission}
                            onChange={(e) =>
                              togglePermission({ userId: user.user_id, value: e.target.checked })
                            }
                            className="accent-red-600 w-3.5 h-3.5 cursor-pointer disabled:opacity-50"
                          />
                          Sees all tasks
                        </label>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      promptDelete(
                        [user.user_id],
                        `${user.first_name} ${user.last_name}`,
                      )
                    }
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Desktop: table ── */}
      <div className="hidden md:block overflow-x-auto bg-white shadow-sm rounded-xl border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    e.target.checked ? selectAll() : clearSelection()
                  }
                  className="accent-red-600 w-4 h-4 cursor-pointer"
                />
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">Name</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Email</th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Employee ID
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Position / Grade
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">Role</th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Sees all tasks
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  No users found.
                </td>
              </tr>
            ) : (
              filteredData.map((user) => {
                const isSelected = selectedIds.includes(user.user_id);
                return (
                  <tr
                    key={user.user_id}
                    className={`border-b border-gray-100 transition ${
                      isSelected ? "bg-red-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(user.user_id)}
                        className="accent-red-600 w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar
                          first={user.first_name ?? ""}
                          last={user.last_name ?? ""}
                        />
                        <span className="font-medium text-gray-900">
                          {user.first_name} {user.last_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{user.email}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                      {user.company_id ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      <div className="flex flex-col gap-0.5">
                        <span>
                          {user.job_position ?? (
                            <span className="text-gray-300">—</span>
                          )}
                        </span>
                        {user.grade_level && (
                          <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded w-fit">
                            {user.grade_level}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                          ROLE_COLORS[user.role] ??
                          "bg-gray-100 text-gray-600 border border-gray-200"
                        }`}
                      >
                        {user.role.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.role === "super_admin" ? (
                        <span className="text-xs text-gray-400">Always (super admin)</span>
                      ) : (
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!user.tm_can_view_all_tasks}
                            disabled={isTogglingPermission}
                            onChange={(e) =>
                              togglePermission({ userId: user.user_id, value: e.target.checked })
                            }
                            className="accent-red-600 w-4 h-4 cursor-pointer disabled:opacity-50"
                          />
                        </label>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() =>
                            promptDelete(
                              [user.user_id],
                              `${user.first_name} ${user.last_name}`,
                            )
                          }
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {confirmDelete.open && (
        <ConfirmDeleteDialog
          label={confirmDelete.label}
          isDeleting={isDeleting}
          onConfirm={() => handleDelete(confirmDelete.userIds)}
          onCancel={() =>
            setConfirmDelete({ open: false, userIds: [], label: "" })
          }
        />
      )}

      <CreateUserModal
        open={modalOpen}
        setOpen={setModalOpen}
        refetch={refetch}
      />
    </div>
  );
}
