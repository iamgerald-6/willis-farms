"use client";

import { Content } from "@/types"; // adjust path
import { useState } from "react";
import { Search } from "lucide-react";

export default function LearningHubPage() {
  const [search, setSearch] = useState("");

  const dummyContents: Content[] = [
    {
      id: "1",
      title: "Daily Walk-In Procedure",
      category: "SOP",
      sub_category: "Daily Operations",
      description: "Step-by-step guide to daily pig barn checks.",
      cover_image_url: "/images/pigs1.jpg",
      document_url: "/docs/walkin.pdf",
      document_read_minutes: 10,
      video_url: "/videos/walkin.mp4",
      video_duration_minutes: 15,
      created_at: new Date().toISOString(),
      created_by: "Admin",
    },
    {
      id: "2",
      title: "Pig Health Assessment",
      category: "Clinical",
      sub_category: "Health Checks",
      description: "How to examine pigs for common health issues.",
      cover_image_url: "/images/pig_health.jpg",
      document_url: "/docs/health.pdf",
      document_read_minutes: 5,
      video_url: "/videos/health.mp4",
      video_duration_minutes: 8,
      created_at: new Date().toISOString(),
      created_by: "Admin",
    },
    {
      id: "3",
      title: "Biosecurity Measures",
      category: "SOP",
      sub_category: "Biosecurity",
      description: "Prevent disease spread in the farm.",
      cover_image_url: "/images/biosecurity.jpg",
      document_url: "/docs/biosecurity.pdf",
      document_read_minutes: 7,
      video_duration_minutes: 12,
      created_at: new Date().toISOString(),
      created_by: "Admin",
    },
    {
      id: "4",
      title: "Feed Handling Guidelines",
      category: "Training",
      sub_category: "Feeding",
      description: "Correct handling of feed to avoid contamination.",
      cover_image_url: "/images/feed.jpg",
      document_read_minutes: 6,
      created_at: new Date().toISOString(),
      created_by: "Admin",
    },
  ];

  const filteredContents = dummyContents.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase()) ||
      c.sub_category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 bg-light min-h-screen">
      {/* Centered Search */}
      <div className="flex justify-center mb-4">
        <div className="relative w-full max-w-xl">
          <input
            type="text"
            placeholder="Search SOPs (e.g. walk-in, treatment, cleaning)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border-2 border-red-600 rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        </div>
      </div>

      {/* Subcategory Nav / Filter Pills */}
      <div className="flex justify-center gap-3 flex-wrap mb-6">
        {[
          "All",
          "SOPs",
          "Daily Operations",
          "Clinical Procedures",
          "Biosecurity",
          "Training",
        ].map((sub) => (
          <button
            key={sub}
            className={`px-4 py-1 rounded-full text-sm font-medium transition
          ${
            sub === "All"
              ? "bg-red-600 text-white"
              : "bg-white text-gray-700 border border-gray-300 hover:bg-red-100"
          }`}
            onClick={() => {
              if (sub === "All") setSearch(""); // Reset filter
              else setSearch(sub);
            }}
          >
            {sub}
          </button>
        ))}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredContents.map((content) => (
          <div
            key={content.id}
            className="bg-white rounded shadow overflow-hidden hover:shadow-md transition cursor-pointer"
          >
            <div className="h-40 w-full bg-gray-200">
              <img
                src={content.cover_image_url || "/images/default_cover.jpg"}
                alt={content.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-4">
              <h2 className="font-semibold text-lg mb-1">{content.title}</h2>
              <p className="text-gray-500 text-sm mb-2">
                {content.category} · {content.sub_category}
              </p>
              <div className="flex gap-4 text-gray-600 text-sm items-center">
                {content.document_read_minutes && (
                  <span className="flex items-center gap-1">
                    ⏱ {content.document_read_minutes} min read
                  </span>
                )}
                {content.video_duration_minutes && (
                  <span className="flex items-center gap-1">
                    🎥 {content.video_duration_minutes} min
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
