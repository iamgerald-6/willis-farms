"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { User } from "@/types";

/**
 * Replaces a free-text "comma-separated emails" field with a dropdown of
 * actual staff accounts, each with a checkbox — so a report/reminder
 * recipient list can only ever be real people on the system, not a typo'd
 * or stale email address. Selection is stored as a list of emails (what the
 * backend already expects), matched back to display names here for the
 * trigger label and each row.
 *
 * Built for a long staff list, not just a handful: a search box filters by
 * name or email as you type, and picking a match clears the search box
 * (without closing the panel) so the next name can be typed straight away —
 * find "amoafo", select it, search clears, type the next name, repeat.
 * Already-picked people stay visible as removable chips above the search
 * box, since scrolling back through a long filtered list to check who's
 * already selected would defeat the point.
 */
export default function StaffMultiSelect({
  users,
  selectedEmails,
  onChange,
  placeholder = "Select staff…",
}: {
  users: User[];
  selectedEmails: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Same click-outside pattern used by ProjectSelect/the navbar account menu.
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

  const toggle = (email: string) => {
    onChange(selectedEmails.includes(email) ? selectedEmails.filter((e) => e !== email) : [...selectedEmails, email]);
    // Clear the search after a pick (not on remove) so the panel's ready
    // for the next name immediately — without closing it, since picking
    // more than one is the whole point.
    setQuery("");
    searchRef.current?.focus();
  };

  const nameByEmail = new Map(users.map((u) => [u.email, `${u.first_name} ${u.last_name}`.trim()]));
  const selectedUsers = selectedEmails.map((email) => ({ email, name: nameByEmail.get(email) ?? email }));

  const filtered = useMemo(() => {
    const sorted = [...users].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((u) => `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, query]);

  const label =
    selectedEmails.length === 0
      ? placeholder
      : selectedEmails.length === 1
        ? (nameByEmail.get(selectedEmails[0]) ?? selectedEmails[0])
        : `${selectedEmails.length} selected`;

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 w-full border border-gray-200 rounded-lg px-2.5 py-2.5 bg-white text-left hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500 transition"
      >
        <span className={`text-sm truncate ${selectedEmails.length === 0 ? "text-gray-400" : "text-gray-800"}`}>{label}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5 pb-1.5 border-b border-gray-100">
              {selectedUsers.map((u) => (
                <span key={u.email} className="flex items-center gap-1 bg-red-50 text-red-700 text-[11px] font-medium pl-2 pr-1 py-1 rounded-full">
                  {u.name}
                  <button type="button" onClick={() => toggle(u.email)} className="hover:text-red-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="px-2.5 pt-2 pb-1.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 focus-within:border-red-400">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto py-1.5 px-1.5">
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-sm text-gray-400">
                {users.length === 0 ? "No staff accounts found." : `No staff match "${query}"`}
              </p>
            )}
            {filtered.map((u) => {
              const checked = selectedEmails.includes(u.email);
              return (
                <label
                  key={u.user_id}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm cursor-pointer hover:bg-gray-50 ${checked ? "bg-red-50" : ""}`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(u.email)} className="accent-red-600 w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-gray-800 truncate">
                      {u.first_name} {u.last_name}
                    </span>
                    <span className="block text-[11px] text-gray-400 truncate">{u.email}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {selectedEmails.length > 0 && (
            <div className="border-t border-gray-100 px-2.5 py-1.5">
              <button type="button" onClick={() => onChange([])} className="text-xs font-semibold text-gray-400 hover:text-red-600">
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
