import type { DisplayStatus } from "@/types/taskManager";

export const STATUS_STYLES: Record<DisplayStatus, { bg: string; text: string; border: string }> = {
  "Not Started": { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200" },
  "In Progress": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  Overdue: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  "Compliant / Ongoing": { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
  Completed: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  Archived: { bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" },
  Deleted: { bg: "bg-gray-100", text: "text-gray-400", border: "border-gray-200" },
};
