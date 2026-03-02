"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import AddContentModal from "@/app/(dashboard)/dashboard/components/addContentModal";
import { Content } from "@/types"; // define Content type

export default function ContentPage() {
  const [contents, setContents] = useState<Content[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  // placeholder for fetching content from Supabase (or API)
  useEffect(() => {
    // TODO: replace with React Query fetch
    const fetchContent = async () => {
      // example structure
      const data: Content[] = [
        {
          id: "1",
          title: "Introduction to Company Policies",
          category: "HR",
          description: "Basic policies every employee must know.",
          created_at: "2026-01-29",
          sub_category: "video",
          created_by: "me",
        },
        {
          id: "2",
          title: "Safety Training",
          category: "Health & Safety",
          description: "Workplace safety guidelines.",
          created_at: "2026-01-28",
          sub_category: "image",
          created_by: "me",
        },
      ];
      setContents(data);
    };
    fetchContent();
  }, []);

  return (
    <div className="p-6">
      {/* Header + CTA */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Learning Materials
        </h2>
        <button
          className="bg-red-600 text-white flex items-center px-4 py-2 rounded hover:bg-red-700"
          onClick={() => setModalOpen(true)}
        >
          <Plus className="w-4 h-4 mr-1" /> Add Content
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white shadow rounded">
        <table className="w-full text-left">
          <thead className="bg-gray-100">
            <tr className="text-gray-700">
              <th className="p-3 border-b">Title</th>
              <th className="p-3 border-b">Category</th>
              <th className="p-3 border-b">Description</th>
              <th className="p-3 border-b">Created At</th>
              <th className="p-3 border-b">Media Type</th>
            </tr>
          </thead>
          <tbody>
            {contents.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 border-b">
                <td className="p-3">{c.title}</td>
                <td className="p-3">{c.category}</td>
                <td className="p-3">{c.description}</td>
                <td className="p-3">{c.created_at}</td>
                <td className="p-3 capitalize">{c.created_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Content Modal */}
      <AddContentModal open={modalOpen} setOpen={setModalOpen} />
    </div>
  );
}
