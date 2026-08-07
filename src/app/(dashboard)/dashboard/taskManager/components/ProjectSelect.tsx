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
        className="flex items-center gap-2 w-full border border-gray-200 rounded-xl px-3.5 py-2.5 bg-white text-left hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-400 transition"
      >
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        {/* The selected project's name is shown once, as the page heading
            above this control — this trigger is purely the way to search
            and switch, so it always reads "Search projects" rather than
            echoing the current selection. */}
        <span className="flex-1 text-sm text-gray-400 truncate">Search projects</span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Matches macOS's native dropdown chrome — the same look Chrome gives
          the platform's plain <select> elements (e.g. Promotion's
          Grade/Decision filters) in dark mode: a dark grey panel, white
          text, and a rounded, inset blue highlight on the hovered row
          rather than a full-width bar. */}
      {open && (
        <div className="absolute z-20 mt-2 w-full bg-[#3a3a3c] border border-[#4a4a4d] rounded-xl shadow-lg overflow-hidden">
          <div className="px-3.5 pt-3 pb-2">
            <p className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide">
              Projects
            </p>
          </div>

          <div className="px-2.5 pb-2.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#2c2c2e] border border-[#4a4a4d] focus-within:border-[#0a84ff]">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto pb-1.5 px-1.5 border-t border-[#4a4a4d]">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-sm text-gray-400">
                No projects match &quot;{query}&quot;
              </p>
            ) : (
              <div className="pt-1.5 space-y-0.5">
                {filtered.map((p) => {
                  const active = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        onSelect(p.id);
                        setOpen(false);
                      }}
                      className={`flex items-center justify-between gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-white transition hover:bg-[#0a84ff] ${
                        active ? "font-semibold" : "font-normal"
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      {active && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {canCreate && (
            <div className="px-1.5 pb-1.5 pt-1 border-t border-[#4a4a4d]">
              <button
                onClick={() => {
                  setOpen(false);
                  onNewProject();
                }}
                className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-sm font-medium text-red-400 hover:bg-[#0a84ff] hover:text-white"
              >
                <Plus className="w-3.5 h-3.5" /> New Project
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
