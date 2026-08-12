"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  FileStack,
  Bell,
  LeafyGreen,
  ChevronDown,
  ChevronRight,
  CalendarCheck,
  Star,
  ClipboardList,
  TrendingUp,
  GanttChartSquare,
  UserCheck,
  UserPlus,
  ShieldAlert,
  X,
  ListChecks,
  Calendar,
} from "lucide-react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import {
  canAccessPage,
  hasUnrestrictedAccess,
  resolveAccessProfile,
  type PagePermissionKey,
} from "@/lib/pagePermissions";

type SubItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  permissionKey: PagePermissionKey;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  permissionKey?: PagePermissionKey;
  children?: SubItem[];
  badge?: string;
};

type SidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    permissionKey: "dashboard",
  },
  {
    label: "Human Capital",
    href: "/dashboard/humanCapital",
    icon: UserCheck,
    children: [
      {
        label: "Leave",
        href: "/dashboard/humanCapital/leave",
        icon: CalendarCheck,
        permissionKey: "hc:leave",
      },
      {
        label: "Appraisal",
        href: "/dashboard/humanCapital/appraisal",
        icon: Star,
        permissionKey: "hc:appraisal",
      },
      {
        label: "Justifications",
        href: "/dashboard/humanCapital/appraisal/justifications",
        icon: ShieldAlert,
        permissionKey: "hc:justifications",
      },
      {
        label: "Skill Logs",
        href: "/dashboard/humanCapital/skillLog",
        icon: ClipboardList,
        permissionKey: "hc:skillLog",
      },
      {
        label: "Promotion",
        href: "/dashboard/humanCapital/promotion",
        icon: TrendingUp,
        permissionKey: "hc:promotion",
      },
      {
        label: "Recruitment",
        href: "/dashboard/humanCapital/recruitment",
        icon: UserPlus,
        permissionKey: "hc:recruitment",
      },
    ],
  },
  {
    label: "Task Manager",
    href: "/dashboard/taskManager",
    icon: ListChecks,

    children: [
      {
        label: "Calendar",
        href: "/dashboard/taskManager/calendar",
        icon: Calendar,
        permissionKey: "tm:calendar",
      },
      {
        label: "Tasks",
        href: "/dashboard/taskManager/tasks",
        icon: ListChecks,
        permissionKey: "tm:tasks",
      },
    ],
  },
  {
    label: "Policies & Ops",
    href: "/dashboard/policies",
    icon: GanttChartSquare,
    permissionKey: "policies",
  },
  {
    label: "SOP",
    href: "/dashboard/sop",
    icon: LeafyGreen,
    permissionKey: "sop:view",
  },
  {
    label: "SOP Management",
    href: "/dashboard/addSop",
    icon: FileStack,
    permissionKey: "sop:add",
  },
  {
    label: "Notifications",
    href: "/dashboard/notifications",
    icon: Bell,
    permissionKey: "notifications",
  },
];

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  // ── Auth ──────────────────────────────────────────────────────────────────
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
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const accessProfile = resolveAccessProfile(profile, sessionRole);
  const unrestricted = hasUnrestrictedAccess(accessProfile, sessionRole);

  const canSee = (key: PagePermissionKey) => {
    if (unrestricted) return true;
    return accessProfile ? canAccessPage(accessProfile, key) : false;
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname?.startsWith(href);
  };

  const isParentActive = (item: NavItem) => {
    if (isActive(item.href)) return true;
    return item.children?.some((child) => isActive(child.href)) ?? false;
  };

  const toggleMenu = (href: string) => {
    setOpenMenus((prev) => ({ ...prev, [href]: !prev[href] }));
  };

  const isOpen = (item: NavItem) => {
    const childActive = item.children?.some((child) => isActive(child.href));
    return openMenus[item.href] ?? childActive ?? false;
  };

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.children?.length) {
      return item.children.some((c) => canSee(c.permissionKey));
    }
    if (item.permissionKey) return canSee(item.permissionKey);
    return true;
  });

  // ── Nav content (shared between desktop + mobile) ─────────────────────────
  const NavContent = () => (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex justify-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden">
            <Image
              src="/brand/logo.svg"
              alt="Wills Farms"
              width={32}
              height={32}
              className="object-contain"
            />
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="md:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const { label, href, icon: Icon, children, badge } = item;
          const active = isParentActive(item);
          const expanded = isOpen(item);
          const hasChildren = !!children?.length;

          const visibleChildren = children?.filter((c) =>
            canSee(c.permissionKey),
          );

          return (
            <div key={href}>
              {hasChildren ? (
                <button
                  onClick={() => toggleMenu(href)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                    active
                      ? "bg-red-600 text-white shadow-sm"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${
                      active
                        ? "text-white"
                        : "text-gray-400 group-hover:text-gray-600"
                    }`}
                  />
                  <span className="flex-1 text-left">{label}</span>
                  {badge && !active && (
                    <span className="text-[9px] font-bold tracking-wide bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full">
                      {badge}
                    </span>
                  )}
                  {expanded ? (
                    <ChevronDown
                      className={`w-3.5 h-3.5 flex-shrink-0 ${active ? "text-white/70" : "text-gray-400"}`}
                    />
                  ) : (
                    <ChevronRight
                      className={`w-3.5 h-3.5 flex-shrink-0 ${active ? "text-white/70" : "text-gray-400"}`}
                    />
                  )}
                </button>
              ) : (
                <Link
                  href={href}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                    active
                      ? "bg-red-600 text-white shadow-sm"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${
                      active
                        ? "text-white"
                        : "text-gray-400 group-hover:text-gray-600"
                    }`}
                  />
                  <span className="flex-1">{label}</span>
                  {badge && !active && (
                    <span className="text-[9px] font-bold tracking-wide bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full">
                      {badge}
                    </span>
                  )}
                  {active && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />
                  )}
                </Link>
              )}

              {/* Sub-items */}
              {hasChildren &&
                expanded &&
                visibleChildren &&
                visibleChildren.length > 0 && (
                  <div className="mt-1 ml-3 pl-3 border-l-2 border-gray-100 space-y-0.5">
                    {visibleChildren.map((child) => {
                      const childActive = isActive(child.href);
                      const ChildIcon = child.icon;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={onClose}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all group ${
                            childActive
                              ? "bg-red-50 text-red-600"
                              : "text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                          }`}
                        >
                          <ChildIcon
                            className={`w-3.5 h-3.5 flex-shrink-0 ${
                              childActive
                                ? "text-red-500"
                                : "text-gray-300 group-hover:text-gray-500"
                            }`}
                          />
                          {child.label}
                          {childActive && (
                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-red-400" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          Wills Farms &copy; {new Date().getFullYear()}
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* ── Mobile drawer backdrop ── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={`md:hidden fixed top-0 left-0 h-screen w-72 bg-white flex flex-col z-50 shadow-xl transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <NavContent />
      </aside>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex fixed top-0 left-0 h-screen w-64 bg-white border-r border-gray-100 flex-col z-40 shadow-sm">
        <NavContent />
      </aside>
    </>
  );
}
