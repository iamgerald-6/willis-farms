"use client";

import { useState } from "react";
import {
  Plus,
  FileText,
  Video,
  ImageIcon,
  File,
  Trash2,
  Eye,
  Pencil,
  X,
  Loader2,
} from "lucide-react";
import AddContentModal from "@/app/(dashboard)/dashboard/components/addContentModal";
import { Content } from "@/types";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  getSopCategoryBadgeClass,
  SOP_MANAGE_COPY,
} from "@/lib/moduleRegistry";

// ─── Media badge ──────────────────────────────────────────────────────────────
function MediaBadge({ content }: { content: Content }) {
  const hasDoc = !!content.document_url;
  const hasVideo = !!content.video_url;
  const hasCover = !!content.cover_image_url;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {hasDoc && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 border border-slate-200">
          <FileText className="w-3 h-3" /> PDF
        </span>
      )}
      {hasVideo && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 border border-slate-200">
          <Video className="w-3 h-3" /> Video
        </span>
      )}
      {hasCover && !hasDoc && !hasVideo && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 border border-slate-200">
          <ImageIcon className="w-3 h-3" /> Image
        </span>
      )}
      {!hasDoc && !hasVideo && !hasCover && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500">
          <File className="w-3 h-3" /> None
        </span>
      )}
    </div>
  );
}

// ─── Confirm delete dialog ────────────────────────────────────────────────────
function ConfirmDeleteDialog({
  label,
  deleting,
  onConfirm,
  onCancel,
}: {
  label: string;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-base font-bold text-gray-900">Confirm Delete</h2>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-6 break-words">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-red-600">{label}</span>? This
          action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Deleting...
              </>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ContentPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    contentIds: string[];
    label: string;
  }>({ open: false, contentIds: [], label: "" });
  const [deleting, setDeleting] = useState(false);

  // ── React Query fetch ──────────────────────────────────────────────────────
  const getContent = async (): Promise<Content[]> => {
    const res = await api.get("/sop/get_content");
    return res.data.data;
  };

  const { data, isLoading, refetch } = useQuery<Content[]>({
    queryKey: ["get_content"],
    queryFn: getContent,
  });

  const contents = data ?? [];

  // ── Selection helpers ──────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );

  const selectAll = () => setSelectedIds(contents.map((c) => c.id));
  const clearSelection = () => setSelectedIds([]);
  const allSelected =
    contents.length > 0 && selectedIds.length === contents.length;

  // ── Delete flow ────────────────────────────────────────────────────────────
  const promptDelete = (contentIds: string[], label: string) =>
    setConfirmDelete({ open: true, contentIds, label });

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/sop/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentIds: confirmDelete.contentIds }),
      });

      const result = await res.json();

      if (!res.ok || result.error) {
        toast.error(result.error ?? "Failed to delete content.");
      } else {
        toast.success(
          confirmDelete.contentIds.length > 1
            ? `${confirmDelete.contentIds.length} items deleted.`
            : "Content deleted.",
        );
        clearSelection();
        refetch();
      }
    } catch {
      toast.error("Server error. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete({ open: false, contentIds: [], label: "" });
    }
  };

  // ── Misc helpers ───────────────────────────────────────────────────────────
  const handleContentAdded = () => refetch();

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
      {/* ── Header / Toolbar ── */}
      <div className="mb-6">
        {selectedIds.length === 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {SOP_MANAGE_COPY.title}
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                {SOP_MANAGE_COPY.subtitle}
              </p>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="bg-red-600 text-white flex items-center justify-center gap-2 px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm font-medium shadow-sm w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" /> Add SOP
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 w-full shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">
                {selectedIds.length} selected
              </span>
              <button
                onClick={clearSelection}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition border border-gray-200 px-2 py-1 rounded-md"
              >
                <X className="w-3 h-3" /> Cancel
              </button>
            </div>
            <button
              onClick={() =>
                promptDelete(
                  selectedIds,
                  `${selectedIds.length} item${
                    selectedIds.length > 1 ? "s" : ""
                  }`,
                )
              }
              className="flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition w-full sm:w-auto sm:ml-auto"
            >
              <Trash2 className="w-4 h-4" />
              Delete {selectedIds.length} item
              {selectedIds.length > 1 ? "s" : ""}
            </button>
          </div>
        )}
      </div>

      {/* ── Responsive Container ── */}
      <div>
        {/* ── Mobile / Tablet Card View (Hidden on Desktop) ── */}
        <div className="block lg:hidden space-y-3">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 animate-pulse"
              >
                <div className="flex items-center justify-between">
                  <div className="h-4 bg-gray-100 rounded w-1/3" />
                  <div className="h-4 bg-gray-100 rounded w-8" />
                </div>
                <div className="h-3 bg-gray-100 rounded w-2/3" />
                <div className="h-6 bg-gray-100 rounded-full w-24" />
              </div>
            ))
          ) : contents.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
              No content uploaded yet. Click <strong>Add SOP</strong> to get
              started.
            </div>
          ) : (
            contents.map((c) => {
              const isSelected = selectedIds.includes(c.id);
              return (
                <div
                  key={c.id}
                  className={`bg-white rounded-xl border p-4 space-y-3 transition ${
                    isSelected
                      ? "border-red-300 bg-red-50/20"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(c.id)}
                        className="accent-red-600 w-4 h-4 cursor-pointer mt-0.5 shrink-0"
                      />
                      <p className="font-medium text-gray-900 text-sm break-words leading-snug">
                        {c.title}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${getSopCategoryBadgeClass(c.category)}`}
                    >
                      {c.category}
                    </span>
                    {c.sub_category && (
                      <span className="text-gray-500 truncate max-w-[140px]">
                        · {c.sub_category}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 border-t border-b border-gray-50 py-2.5 text-xs text-gray-500">
                    <div className="flex-1">
                      <MediaBadge content={c} />
                    </div>
                    <div className="flex flex-col gap-0.5 text-right">
                      {c.document_read_minutes && (
                        <span>📄 {c.document_read_minutes} min read</span>
                      )}
                      {c.video_duration_minutes && (
                        <span>🎥 {c.video_duration_minutes} min</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
                    <span className="text-gray-400">
                      {formatDate(c.created_at)}
                    </span>
                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-lg p-0.5">
                      <a
                        href={`/dashboard/training/${c.id}`}
                        className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-white transition"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </a>
                      <button
                        className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-white transition"
                        title="Edit"
                        onClick={() => {}}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => promptDelete([c.id], `"${c.title}"`)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-white transition"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Desktop View (Hidden on Mobile/Tablet) ── */}
        <div className="hidden lg:block overflow-x-auto bg-white shadow-sm rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) =>
                      e.target.checked ? selectAll() : clearSelection()
                    }
                    className="accent-red-600 w-4 h-4 cursor-pointer align-middle"
                  />
                </th>
                <th className="px-4 py-3 font-semibold text-gray-600">Title</th>
                <th className="px-4 py-3 font-semibold text-gray-600">
                  Category
                </th>
                <th className="px-4 py-3 font-semibold text-gray-600">
                  Sub-category
                </th>
                <th className="px-4 py-3 font-semibold text-gray-600">Media</th>
                <th className="px-4 py-3 font-semibold text-gray-600">
                  Duration
                </th>
                <th className="px-4 py-3 font-semibold text-gray-600">
                  Created
                </th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 animate-pulse"
                  >
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : contents.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    No content uploaded yet. Click <strong>Add SOP</strong>{" "}
                    to get started.
                  </td>
                </tr>
              ) : (
                contents.map((c) => {
                  const isSelected = selectedIds.includes(c.id);
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-gray-100 transition ${
                        isSelected ? "bg-red-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(c.id)}
                          className="accent-red-600 w-4 h-4 cursor-pointer align-middle"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] truncate">
                        {c.title}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${getSopCategoryBadgeClass(c.category)}`}
                        >
                          {c.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {c.sub_category ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <MediaBadge content={c} />
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        <div className="flex flex-col gap-0.5">
                          {c.document_read_minutes && (
                            <span>📄 {c.document_read_minutes} min read</span>
                          )}
                          {c.video_duration_minutes && (
                            <span>🎥 {c.video_duration_minutes} min</span>
                          )}
                          {!c.document_read_minutes &&
                            !c.video_duration_minutes &&
                            "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDate(c.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <a
                            href={`/dashboard/training/${c.id}`}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="Preview"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
                          <button
                            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition"
                            title="Edit"
                            onClick={() => {}}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => promptDelete([c.id], `"${c.title}"`)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Confirm Delete Dialog ── */}
      {confirmDelete.open && (
        <ConfirmDeleteDialog
          label={confirmDelete.label}
          deleting={deleting}
          onConfirm={handleDelete}
          onCancel={() =>
            setConfirmDelete({ open: false, contentIds: [], label: "" })
          }
        />
      )}

      {/* ── Add Content Modal ── */}
      <AddContentModal
        open={modalOpen}
        setOpen={setModalOpen}
        onSuccess={handleContentAdded}
      />
    </div>
  );
}
