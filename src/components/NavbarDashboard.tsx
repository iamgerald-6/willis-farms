"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, usePathname } from "next/navigation";
import { Bell, LogOut, User, Menu, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { User as UserType } from "@/types";
import { canManageAccessControl } from "@/lib/pagePermissions";

// ── Page title map ────────────────────────────────────────────────────────────
const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": {
    title: "Overview",
    subtitle: "Welcome back — here's what's happening today",
  },
  "/dashboard/training": {
    title: "Learning Hub",
    subtitle: "Browse and complete your training materials",
  },
  "/dashboard/users": {
    title: "Users",
    subtitle: "Manage employee accounts and roles",
  },
  "/dashboard/content": {
    title: "Content",
    subtitle: "Upload and manage learning materials",
  },
  "/dashboard/notifications": {
    title: "Notifications",
    subtitle: "Stay up to date with farm updates",
  },
  // "/dashboard/settings": {
  //   title: "Settings",
  //   subtitle: "Manage your account and preferences",
  // },
  "/dashboard/policies": {
    title: "Policies & Ops",
    subtitle: "Procedures, manuals and operational policies",
  },
  "/dashboard/sop": {
    title: "SOPs",
    subtitle: "Standard operating procedures",
  },
  "/dashboard/lms": {
    title: "Learning Management",
    subtitle: "Training and development resources",
  },
  "/dashboard/access-control": {
    title: "Access Control",
    subtitle: "Grant roles and page-level access",
  },
  "/dashboard/taskManager/calendar": {
    title: "Schedule Tracker",
    subtitle: "Leave, off-days, appraisal reviews and task deadlines in one view",
  },
  "/dashboard/taskManager/tasks": {
    title: "Tasks Dashboard",
    subtitle: "Manage projects, tasks and compliance monitoring",
  },
};

interface NavbarDashboardProps {
  onMenuClick: () => void;
}

export default function NavbarDashboard({ onMenuClick }: NavbarDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pageInfo = PAGE_TITLES[pathname] ?? {
    title: "Dashboard",
    subtitle: "WillsFarm Management Portal",
  };

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users } = useQuery<UserType[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const userId = session?.user?.id;
  const profile = users?.find((u) => u.user_id === userId);
  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : (session?.user?.email ?? "");
  const initials = profile
    ? `${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase()
    : (session?.user?.email?.slice(0, 2).toUpperCase() ?? "?");

  const showAccessControl = canManageAccessControl(
    profile?.role ?? (session?.user?.user_metadata?.role as string | undefined),
    profile?.grade_level,
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="h-20 bg-white border-b border-gray-100 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only, opens Sidebar drawer */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-base font-bold text-gray-900 leading-tight">
            {pageInfo.title}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">
            {pageInfo.subtitle}
          </p>
        </div>
      </div>

      {/* ── Right: bell + profile ── */}
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button className="relative p-2 rounded-xl hover:bg-gray-50 transition">
          <Bell className="w-5 h-5 text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-600 ring-2 ring-white" />
        </button>

        {/* Profile dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 hover:opacity-80 transition"
          >
            <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center hover:ring-2 hover:ring-red-300 transition">
              <span className="text-xs font-bold text-white">{initials}</span>
            </div>
            {/* Name — hidden on small screens */}
            <span className="hidden sm:block text-sm font-medium text-gray-700">
              {displayName}
            </span>
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-100 shadow-lg rounded-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-900 truncate">
                  {displayName}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">
                  {profile?.role?.replace("_", " ") ?? "Employee"}
                </p>
              </div>

              <div className="py-1">
                <button
                  className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                  onClick={() => {
                    setOpen(false);
                    router.push("/dashboard/settings");
                  }}
                >
                  <User className="w-4 h-4 text-gray-400" />
                  Account Settings
                </button>
                {showAccessControl && (
                  <button
                    className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                    onClick={() => {
                      setOpen(false);
                      router.push("/dashboard/access-control");
                    }}
                  >
                    <ShieldCheck className="w-4 h-4 text-red-500" />
                    Access Control
                  </button>
                )}
                <button
                  className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
