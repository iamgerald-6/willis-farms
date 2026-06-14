"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import LeavePage from "./components/LeavePag";
import LeaveRequestsAdminPage from "./components/LeaveRequestsAdminPage";

const Leave = () => {
  const [viewMode, setViewMode] = useState<"my" | "admin">("my");

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const userId = session?.user?.id;
  const profile = users?.find((u) => u.user_id === userId);
  const role = profile?.role ?? session?.user?.user_metadata?.role;
  const isAdminOrManager =
    role === "admin" || role === "super_admin" || role === "manager";

  return (
    <div>
      {/* Toggle — admin/manager only */}
      {isAdminOrManager && (
        <div className="flex items-center gap-1 p-6 pb-0">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setViewMode("my")}
              className={`px-4 py-2 text-sm font-medium transition ${
                viewMode === "my"
                  ? "bg-red-600 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              My Leave
            </button>
            <button
              onClick={() => setViewMode("admin")}
              className={`px-4 py-2 text-sm font-medium transition ${
                viewMode === "admin"
                  ? "bg-red-600 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              All Requests
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {isAdminOrManager && viewMode === "admin" ? (
        <LeaveRequestsAdminPage />
      ) : (
        <LeavePage />
      )}
    </div>
  );
};

export default Leave;
