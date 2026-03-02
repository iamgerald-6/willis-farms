"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import CreateUserModal from "@/app/(dashboard)/dashboard/components/createModal";
import { User } from "@/types";
import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";
export default function UserTablePage() {
  interface Props {
    open: boolean;
    setOpen: (val: boolean) => void;
    onUserCreated: (user: User) => void;
  }

  const [users, setUsers] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  // search/filter
  const [searchBy, setSearchBy] = useState<"email" | "id" | "phone">("email");
  const [searchValue, setSearchValue] = useState("");

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };
  const selectAll = () => setSelectedIds(users.map((u) => u.id));
  const clearSelection = () => setSelectedIds([]);

  const getUsers = async () => {
    const res = await api.get("/get_user");
    return res.data;
  };

  const { data, refetch } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: getUsers,
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        {selectedIds.length === 0 ? (
          <>
            <input
              type="text"
              placeholder={`Search by ${searchBy}`}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="border p-2 rounded"
            />
            <div className="flex space-x-2">
              <select
                value={searchBy}
                onChange={(e) => setSearchBy(e.target.value as any)}
                className="border p-2 rounded"
              >
                <option value="email">Email</option>
                <option value="id">User ID</option>
                <option value="phone">Phone</option>
              </select>

              <button
                onClick={() => setModalOpen(true)}
                className="bg-red-600 text-white flex items-center px-4 py-2 rounded hover:bg-red-700"
              >
                <Plus className="w-4 h-4 mr-1" /> Add User
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center space-x-4">
            <span>{selectedIds.length} selected</span>
            <button
              className="flex items-center text-red-600 hover:text-red-800"
              onClick={clearSelection}
            >
              <X className="w-4 h-4 mr-1" /> Cancel
            </button>
            <button className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
              Delete {selectedIds.length} User
              {selectedIds.length > 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white shadow rounded">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2">
                <input
                  type="checkbox"
                  onChange={(e) =>
                    e.target.checked ? selectAll() : clearSelection()
                  }
                  checked={
                    selectedIds.length === users.length && users.length > 0
                  }
                />
              </th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">User ID</th>
              <th className="p-2 text-left">Phone</th>
              <th className="p-2 text-left">Role</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((user) => (
              <tr
                key={user.id}
                className={`border-b ${
                  selectedIds.includes(user.id) ? "bg-gray-100" : ""
                }`}
              >
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(user.id)}
                    onChange={() => toggleSelect(user.id)}
                  />
                </td>
                <td className="p-2">{user.email}</td>
                <td className="p-2">{user.user_id}</td>
                <td className="p-2">{user.phone ?? "-"}</td>
                <td className="p-2">{user.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <CreateUserModal
        open={modalOpen}
        setOpen={setModalOpen}
        refetch={refetch}
      />
    </div>
  );
}
