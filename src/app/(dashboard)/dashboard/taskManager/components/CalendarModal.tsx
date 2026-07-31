"use client";

import { X, Calendar as CalendarIcon } from "lucide-react";
import { TMProject } from "@/types/taskManager";
import CalendarView from "./CalendarView";

export default function CalendarModal({ projects, onClose }: { projects: TMProject[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-red-600" />
            <h2 className="text-base font-bold text-gray-900">Calendar</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          <CalendarView projects={projects} />
        </div>
      </div>
    </div>
  );
}
