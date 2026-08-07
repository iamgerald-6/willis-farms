"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { TMProject } from "@/types/taskManager";

// Replaces the old row-of-pills project switcher, which worked fine for a
// handful of projects but would turn into an unusable, wrapping wall of
// buttons once there are hundreds of them. This is a single dropdown
// trigger instead — a search box up top so a specific project is always a
// few keystrokes away regardless of how many exist, a scrollable list
// underneath (capped height, not capped count), and "New Project" pinned
// to the bottom so it doesn't get pushed out of reach by a long list.
export default function ProjectSelect({
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  // Same click-outside pattern used by the navbar's account menu.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full sm:w-80">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 w-full border border-gray-200 rounded-lg px-3.5 py-2.5 bg-white text-left hover:border-gray-300 transition"
      >
        <span className="text-sm font-semibold text-gray-900 truncate">
          {selected ? selected.name : "Select a project"}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-gray-200 focus-within:border-red-400">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects…"
                className="w-full text-sm outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3.5 py-3 text-sm text-gray-400">
                No projects match &quot;{query}&quot;
              </p>
            ) : (
              filtered.map((p) => {
                const active = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelect(p.id);
                      setOpen(false);
                    }}
                    className={`flex items-center justify-between gap-2 w-full text-left px-3.5 py-2 text-sm transition ${
                      active ? "bg-red-50 text-red-600 font-medium" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    {active && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {canCreate && (
            <button
              onClick={() => {
                setOpen(false);
                onNewProject();
              }}
              className="flex items-center gap-2 w-full text-left px-3.5 py-2.5 text-sm font-medium text-red-600 border-t border-gray-100 hover:bg-red-50"
            >
              <Plus className="w-3.5 h-3.5" /> New Project
            </button>
          )}
        </div>
      )}
    </div>
  );
}
