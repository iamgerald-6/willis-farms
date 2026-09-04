import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileStack,
  GanttChartSquare,
  LayoutDashboard,
  LeafyGreen,
  ListChecks,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Star,
  Tag,
  TrendingUp,
  UserCheck,
  UserPlus,
  XCircle,
} from "lucide-react";
import type { NavIconKey } from "./types";

export const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  bell: Bell,
  "user-check": UserCheck,
  "calendar-check": CalendarCheck,
  star: Star,
  "shield-alert": ShieldAlert,
  "shield-check": ShieldCheck,
  "shield-x": ShieldX,
  "clipboard-list": ClipboardList,
  "trending-up": TrendingUp,
  "user-plus": UserPlus,
  "list-checks": ListChecks,
  calendar: Calendar,
  "gantt-chart-square": GanttChartSquare,
  "leafy-green": LeafyGreen,
  "file-stack": FileStack,
  "book-open": BookOpen,
  tag: Tag,
  "check-circle": CheckCircle2,
  clock: Clock,
  "alert-circle": AlertCircle,
  "x-circle": XCircle,
  "building-2": Building2,
};

export function resolveNavIcon(key: NavIconKey): LucideIcon {
  return NAV_ICONS[key];
}
