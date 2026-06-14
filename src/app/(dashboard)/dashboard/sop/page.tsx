"use client";

import { Content } from "@/types";
import { useState } from "react";
import { Search, Clock, Video, FileText } from "lucide-react";
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

const FILTER_PILLS = [
  "All",
  "Animal Health & Welfare",
  "Breeding & Reproduction",
  "Nutrition & Feeding",
  "Biosecurity",
  "Facility & Equipment",
  "Health & Safety",
  "HR & Administration",
];

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
        </div>
      </div>
    </Link>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function SOPHubPage() {
  const [search, setSearch] = useState("");
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

  const filtered = contents.filter((c) => {
    const matchesSearch =
      !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase()) ||
      c.sub_category?.toLowerCase().includes(search.toLowerCase());

    const matchesFilter = activeFilter === "All" || c.category === activeFilter;

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-6 min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">SOPs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Browse standard operating procedures across all farm areas
        </p>
      </div>

      {/* ── Search ── */}
      <div className="flex justify-center mb-5">
        <div className="relative w-full max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by title, category or topic..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border-2 border-red-500 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
          />
        </div>
      </div>

      {/* ── Filter pills ── */}
      <div className="flex justify-center gap-2 flex-wrap mb-8">
        {FILTER_PILLS.map((pill) => (
          <button
            key={pill}
            onClick={() => setActiveFilter(pill)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
              activeFilter === pill
                ? "bg-red-600 text-white border-red-600 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:text-red-600"
            }`}
          >
            {pill}
          </button>
        ))}
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
            <p className="text-sm mt-1">Try a different search or filter</p>
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
