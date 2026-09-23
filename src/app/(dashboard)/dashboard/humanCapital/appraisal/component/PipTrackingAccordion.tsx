"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function PipTrackingAccordion({
  title,
  subtitle,
  defaultOpen = false,
  headerActions,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors min-w-0"
          aria-expanded={open}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            {subtitle && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
            )}
          </div>
          {open ? (
            <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          )}
        </button>
        {headerActions && (
          <div
            className="flex items-center px-3 border-l border-gray-100 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {headerActions}
          </div>
        )}
      </div>

      {open && <div className="p-4 sm:p-5 border-t border-gray-100 space-y-4">{children}</div>}
    </div>
  );
}
