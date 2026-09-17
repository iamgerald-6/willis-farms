"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

/**
 * Shared multi-select filter dropdown — originally built for the
 * Recruitment "Applications" tab (see humanCapital/recruitment/page.tsx)
 * and pulled out here so other pages (e.g. User Management) can use the
 * exact same look/behavior: click the field's button, pick any number of
 * values from the list of what's actually present in the data, values from
 * different fields combine (AND), values within the same field combine (OR).
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition ${
          selected.length > 0
            ? "bg-red-50 text-red-700 border-red-200"
            : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="bg-red-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {selected.length}
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-2.5 pt-2.5 pb-1.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 focus-within:border-red-400">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto py-1.5 px-1.5">
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-3 text-sm text-gray-400">No matches</p>
            ) : (
              filteredOptions.map((opt) => {
                const checked = selected.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm cursor-pointer hover:bg-gray-50 ${checked ? "bg-red-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(opt.value)}
                      className="accent-red-600 w-3.5 h-3.5 shrink-0"
                    />
                    <span className="flex-1 min-w-0 truncate text-gray-800">
                      {opt.label}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {selected.length > 0 && (
            <div className="border-t border-gray-100 px-2.5 py-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-semibold text-gray-400 hover:text-red-600"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="flex items-center gap-1 bg-red-50 text-red-700 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full">
      {label}
      <button type="button" onClick={onRemove} className="hover:text-red-900">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}
