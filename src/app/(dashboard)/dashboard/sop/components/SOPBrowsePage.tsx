"use client";

import { Content } from "@/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Clock, Video, FileText, Check, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import Link from "next/link";

const CATEGORY_COLORS: Record<string, string> = {
  "Animal Health & Welfare":
    "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "Breeding & Reproduction": "bg-pink-50 text-pink-700 border border-pink-200",
  "Nutrition & Feeding": "bg-amber-50 text-amber-700 border border-amber-200",
  Biosecurity: "bg-blue-50 text-blue-700 border border-blue-200",
  "Facility & Equipment":
    "bg-orange-50 text-orange-700 border border-orange-200",
  "Health & Safety": "bg-red-50 text-red-700 border border-red-200",
  "HR & Administration":
    "bg-purple-50 text-purple-700 border border-purple-200",
};

const SOP_CATEGORIES = [
  "Animal Health & Welfare",
  "Breeding & Reproduction",
  "Nutrition & Feeding",
  "Biosecurity",
  "Facility & Equipment",
  "Health & Safety",
  "HR & Administration",
];

// ─── Category select ────────────────────────────────────────────────────────
// Same trigger + dark searchable-dropdown chrome as Task Manager's
// ProjectSelect — but single-purpose here: pick a category (or "All
// Categories") and the grid below filters to it, instead of typing a
// free-text search.
function CategorySelect({
  categories,
  selected,
  onSelect,
}: {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.toLowerCase().includes(q));
  }, [categories, query]);

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
    <div ref={containerRef} className="relative w-full max-w-xl">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full border border-gray-200 rounded-xl px-3.5 py-2.5 bg-white text-left hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-400 transition"
      >
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <span
          className={`flex-1 text-sm ${selected === "All" ? "text-gray-400" : "text-gray-800 font-medium"}`}
        >
          {selected === "All" ? "Search categories" : selected}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full bg-[#3a3a3c] border border-[#4a4a4d] rounded-xl shadow-lg overflow-hidden">
          <div className="px-3.5 pt-3 pb-2">
            <p className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide">
              Categories
            </p>
          </div>

          <div className="px-2.5 pb-2.5">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#2c2c2e] border border-[#4a4a4d] focus-within:border-[#0a84ff]">
              <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search categories"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto pb-1.5 px-1.5 border-t border-[#4a4a4d]">
            <div className="pt-1.5 space-y-0.5">
              <button
                onClick={() => {
                  onSelect("All");
                  setOpen(false);
                }}
                className={`flex items-center justify-between gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-white transition hover:bg-[#0a84ff] ${
                  selected === "All" ? "font-semibold" : "font-normal"
                }`}
              >
                <span className="truncate">All Categories</span>
                {selected === "All" && <Check className="w-4 h-4 shrink-0" />}
              </button>
            </div>
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-sm text-gray-400">
                No categories match &quot;{query}&quot;
              </p>
            ) : (
              <div className="pt-0.5 space-y-0.5">
                {filtered.map((c) => {
                  const active = c === selected;
                  return (
                    <button
                      key={c}
                      onClick={() => {
                        onSelect(c);
                        setOpen(false);
                      }}
                      className={`flex items-center justify-between gap-2 w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-white transition hover:bg-[#0a84ff] ${
                        active ? "font-semibold" : "font-normal"
                      }`}
                    >
                      <span className="truncate">{c}</span>
                      {active && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
      <div className="h-44 bg-gray-100" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
      </div>
    </div>
  );
}

// ─── Content card ──────────────────────────────────────────────────────────────
function ContentCard({ content }: { content: Content }) {
  return (
    <Link href={`/dashboard/sop/${content.id}`}>
      <div className="group bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md hover:border-red-200 transition-all duration-200 cursor-pointer h-full flex flex-col">
        <div className="h-44 w-full bg-gray-100 overflow-hidden relative">
          <img
            src={content.cover_image_url || "/images/default_cover.jpg"}
            alt={content.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <span
            className={`absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-xs font-medium ${
              CATEGORY_COLORS[content.category] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {content.category}
          </span>
        </div>

        <div className="p-4 flex flex-col flex-1">
          <h2 className="font-semibold text-gray-900 text-base mb-1 group-hover:text-red-600 transition-colors line-clamp-2">
            {content.title}
          </h2>
          <p className="text-xs text-gray-400 mb-3">{content.sub_category}</p>
          <p className="text-sm text-gray-500 line-clamp-2 flex-1">
            {content.description}
          </p>

          <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-100">
            {content.document_read_minutes && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                {content.document_read_minutes} min read
              </span>
            )}
            {content.video_duration_minutes && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Video className="w-3.5 h-3.5" />
                {content.video_duration_minutes} min video
              </span>
            )}
            {content.document_url && (
              <span className="flex items-center gap-1 text-xs text-gray-400 ml-auto">
                <FileText className="w-3.5 h-3.5" /> PDF
              </span>
            )}
          </div>
          {content.created_by_name && (
            <p className="text-[11px] text-gray-400 mt-2">
              Added by {content.created_by_name} ·{" "}
              {new Date(content.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function SOPBrowsePage() {
  const [activeFilter, setActiveFilter] = useState("All");

  const getContent = async (): Promise<Content[]> => {
    const res = await api.get("/sop/get_content");
    return res.data.data;
  };

  const { data, isLoading } = useQuery<Content[]>({
    queryKey: ["get_sop_content"],
    queryFn: getContent,
  });

  const contents = data ?? [];

  const filtered = contents.filter(
    (c) => activeFilter === "All" || c.category === activeFilter,
  );

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">SOPs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Browse standard operating procedures across all farm areas
        </p>
      </div>

      {/* ── Category select ── */}
      <div className="flex justify-center mb-8">
        <CategorySelect
          categories={SOP_CATEGORIES}
          selected={activeFilter}
          onSelect={setActiveFilter}
        />
      </div>

      {/* ── Results count ── */}
      {!isLoading && (
        <p className="text-xs text-gray-400 mb-4 text-center">
          {filtered.length} SOP{filtered.length !== 1 ? "s" : ""} found
        </p>
      )}

      {/* ── Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {isLoading ? (
          [...Array(8)].map((_, i) => <SkeletonCard key={i} />)
        ) : filtered.length === 0 ? (
          <div className="col-span-full text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-medium">No SOPs found</p>
            <p className="text-sm mt-1">Try a different category</p>
          </div>
        ) : (
          filtered.map((content) => (
            <ContentCard key={content.id} content={content} />
          ))
        )}
      </div>
    </div>
  );
}
