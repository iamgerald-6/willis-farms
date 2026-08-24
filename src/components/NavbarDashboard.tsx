"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, usePathname } from "next/navigation";
import { Bell, LogOut, User, Menu, Settings2, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { User as UserType } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canOpenUserManagement } from "@/lib/permissionLevels";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import { performLogout } from "@/lib/auth/performLogout";

// ── Page title map ────────────────────────────────────────────────────────────
// Ordered longest-path-first so nested routes (e.g. justifications/new,
// skillLogForms, appraisalForms) resolve to the right section instead of
// falling through to the generic default.
const PAGE_TITLE_ENTRIES: { path: string; title: string; subtitle: string }[] = [
  {
    path: "/dashboard/humanCapital/appraisal/justifications",
    title: "Justifications",
    subtitle: "Appraisal score justifications and disputes",
  },
  {
    path: "/dashboard/humanCapital/appraisal",
    title: "Appraisal",
    subtitle: "Quarterly and annual performance reviews",
  },
  {
    path: "/dashboard/humanCapital/skillLog",
    title: "Skill Logs",
    subtitle: "Track skills learned and certifications",
  },
  {
    path: "/dashboard/humanCapital/promotion",
    title: "Promotion",
    subtitle: "Grade and promotion assessments",
  },
  {
    path: "/dashboard/humanCapital/recruitment",
    title: "Recruitment",
    subtitle: "Applicants, interviews and hiring pipeline",
  },
  {
    path: "/dashboard/humanCapital/leave",
    title: "Leave",
    subtitle: "Apply for leave and review requests",
  },
  {
    path: "/dashboard/humanCapital/schedule",
    title: "Schedule Tracker",
    subtitle:
      "Leave, off-days, appraisal reviews and task deadlines in one view",
  },
  {
    path: "/dashboard/taskManager/calendar",
    title: "Schedule Tracker",
    subtitle:
      "Leave, off-days, appraisal reviews and task deadlines in one view",
  },
  {
    path: "/dashboard/taskManager/tasks",
    title: "Tasks Dashboard",
    subtitle: "Manage projects, tasks and compliance monitoring",
  },
  {
    path: "/dashboard/training",
    title: "Learning Hub",
    subtitle: "Browse and complete your training materials",
  },
  {
    path: "/dashboard/access-control",
    title: "User Management",
    subtitle: "Manage staff accounts, access, and disabled status",
  },
  {
    path: "/dashboard/users",
    title: "User Management",
    subtitle: "Manage staff accounts, access, and disabled status",
  },
  {
    path: "/dashboard/content",
    title: "Content",
    subtitle: "Upload and manage learning materials",
  },
  {
    path: "/dashboard/notifications",
    title: "Notifications",
    subtitle: "Stay up to date with farm updates",
  },
  {
    path: "/dashboard/policies",
    title: "Policies & Ops",
    subtitle: "Procedures, manuals and operational policies",
  },
  {
    path: "/dashboard/addSop",
    title: "Add SOP",
    subtitle: "Create a new standard operating procedure",
  },
  {
    path: "/dashboard/sop",
    title: "SOPs",
    subtitle: "Standard operating procedures",
  },
  {
    path: "/dashboard/lms",
    title: "Learning Management",
    subtitle: "Training and development resources",
  },
  {
    path: "/dashboard/settings",
    title: "Account Settings",
    subtitle: "View your profile and update your password",
  },
  {
    path: "/dashboard/system-definitions",
    title: "System Definitions",
    subtitle: "Module registry — taxonomy, forms, and business rules",
  },
].sort((a, b) => b.path.length - a.path.length);

const DEFAULT_PAGE_INFO = {
  title: "Dashboard",
  subtitle: "Wills Farms Management Portal",
};

function getPageInfo(pathname: string) {
  if (pathname === "/dashboard") {
    return { title: "Overview", subtitle: "Welcome back — here's what's happening today" };
  }
  const match = PAGE_TITLE_ENTRIES.find((entry) => pathname.startsWith(entry.path));
  return match ?? DEFAULT_PAGE_INFO;
}

interface NavbarDashboardProps {
  onMenuClick: () => void;
}

export default function NavbarDashboard({ onMenuClick }: NavbarDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pageInfo = getPageInfo(pathname ?? "");

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
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : (session?.user?.email ?? "");
  const initials = profile
    ? `${profile.first_name?.[0] ?? ""}${profile.last_name?.[0] ?? ""}`.toUpperCase()
    : (session?.user?.email?.slice(0, 2).toUpperCase() ?? "?");

  const accessProfile = resolveAccessProfile(profile, sessionRole);
  const { data: groupPresetData } = useGroupPresets();
  const groupPresets = groupPresetData?.presets;
  const showUserManagement = canOpenUserManagement(accessProfile, sessionRole);
  const showSystemDefinitions =
    accessProfile &&
    canPerformModuleAction(
      accessProfile,
      "sys:definitions",
      "view",
      sessionRole,
      groupPresets,
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
    if (loggingOut) return;
    setLoggingOut(true);
    setOpen(false);
    await performLogout(router);
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
                {showUserManagement && (
                  <button
                    className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                    onClick={() => {
                      setOpen(false);
                      router.push("/dashboard/access-control");
                    }}
                  >
                    <ShieldCheck className="w-4 h-4 text-red-500" />
                    User Management
                  </button>
                )}
                {showSystemDefinitions && (
                  <button
                    className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition"
                    onClick={() => {
                      setOpen(false);
                      router.push("/dashboard/system-definitions");
                    }}
                  >
                    <Settings2 className="w-4 h-4 text-red-500" />
                    System Definitions
                  </button>
                )}
                <button
                  className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  <LogOut className="w-4 h-4" />
                  {loggingOut ? "Logging out…" : "Logout"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
