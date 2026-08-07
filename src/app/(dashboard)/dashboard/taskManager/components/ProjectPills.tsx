"use client";

import { Plus } from "lucide-react";
import { TMProject } from "@/types/taskManager";

export default function ProjectPills({
  projects,
  selectedId,
  onSelect,
  onNewProject,
  canCreate,
}: {
  projects: TMProject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewProject: () => void;
  canCreate: boolean;
}) {
  return (
    <div className="overflow-x-auto pb-1">
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      {projects.map((p) => {
        const active = p.id === selectedId;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition border whitespace-nowrap shrink-0 ${
              active ? "bg-red-600 text-white border-red-600" : "text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {p.name}
            {p.overdue_task_count! > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-red-100 text-red-600"}`}>
                {p.overdue_task_count} overdue
              </span>
            )}
          </button>
        );
      })}
      {canCreate && (
        <button
          onClick={onNewProject}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border border-dashed border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-600"
        >
          <Plus className="w-3.5 h-3.5" /> New Project
        </button>
      )}
    </div>
    </div>
  );
}
