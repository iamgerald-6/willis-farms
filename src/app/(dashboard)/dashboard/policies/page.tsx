"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  FileText,
  ChevronDown,
  ChevronUp,
  Eye,
  Clock,
  Search,
  BookOpen,
  Shield,
  ClipboardList,
  Tag,
  Grid,
  List,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import api from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { User } from "@/types";
import ConfirmDeleteDialog from "./components/deletModal";
import UploadManualModal from "./components/uploadModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type ManualCategory =
  | "HR"
  | "Biosecurity"
  | "Finance Policies"
  | "Breeding Operations";

const CATEGORIES: ManualCategory[] = [
  "HR",
  "Biosecurity",
  "Finance Policies",
  "Breeding Operations",
];

interface ManualVersion {
  version_id: string;
  version_label: string;
  cloudinary_url: string;
  file_name: string;
  file_size_bytes: number | null;
  version_notes: string | null;
  uploaded_by_id: string;
  uploaded_by_name: string;
  uploaded_at: string;
}

interface Manual {
  manual_id: string;
  title: string;
  category: ManualCategory;
  description: string | null;
  created_at: string;
  updated_at: string;
  versions: ManualVersion[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<ManualCategory, React.ReactNode> = {
  HR: <BookOpen className="w-4 h-4" />,
  Biosecurity: <Shield className="w-4 h-4" />,
  "Finance Policies": <ClipboardList className="w-4 h-4" />,
  "Breeding Operations": <Tag className="w-4 h-4" />,
};

const CATEGORY_COLORS: Record<ManualCategory, string> = {
  HR: "bg-blue-50 text-blue-700 border border-blue-200",
  Biosecurity: "bg-green-50 text-green-700 border border-green-200",
  "Finance Policies": "bg-amber-50 text-amber-700 border border-amber-200",
  "Breeding Operations":
    "bg-purple-50 text-purple-700 border border-purple-200",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatBytes(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function VersionHistory({ versions }: { versions: ManualVersion[] }) {
  const [open, setOpen] = useState(false);
  const latest = versions[0];

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={latest.cloudinary_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-700 transition"
        >
          <Eye className="w-3.5 h-3.5" />
          {latest.version_label}
        </a>
        {versions.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen((p) => !p);
            }}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition py-1"
          >
            <Clock className="w-3.5 h-3.5" />
            {versions.length - 1} older
            {open ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3 pl-2 border-l-2 border-gray-100 ml-1">
          {versions.slice(1).map((v) => (
            <div
              key={v.version_id}
              className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-2"
            >
              <a
                href={v.cloudinary_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-md hover:bg-gray-200 transition self-start flex-shrink-0"
              >
                <FileText className="w-3 h-3" />
                {v.version_label}
              </a>
              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs text-gray-400">
                  {formatDate(v.uploaded_at)} · {v.uploaded_by_name}
                </p>
                {v.version_notes && (
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed break-words">
                    {v.version_notes}
                  </p>
                )}
                {v.file_size_bytes && (
                  <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">
                    {formatBytes(v.file_size_bytes)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Manual Card ──────────────────────────────────────────────────────────────

function ManualCard({
  manual,
  isAdmin,
  onDelete,
}: {
  manual: Manual;
  isAdmin: boolean;
  onDelete: (id: string, title: string) => void;
}) {
  const latest = manual.versions[0];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[manual.category]}`}
            >
              {CATEGORY_ICONS[manual.category]}
              {manual.category}
            </span>
            <span className="text-xs text-gray-400">
              {manual.versions.length} version
              {manual.versions.length !== 1 ? "s" : ""}
            </span>
          </div>
          <h3 className="font-semibold text-gray-900 text-base leading-snug break-words">
            {manual.title}
          </h3>
          {manual.description && (
            <p className="text-sm text-gray-500 mt-1 leading-relaxed line-clamp-2 break-words">
              {manual.description}
            </p>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => onDelete(manual.manual_id, manual.title)}
            className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition flex-shrink-0"
            title="Delete manual"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="border-t border-gray-100" />
      <VersionHistory versions={manual.versions} />

      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-gray-400 pt-1 mt-auto">
        <span className="truncate max-w-[180px]">
          Latest by{" "}
          <span className="text-gray-600 font-medium truncate">
            {latest.uploaded_by_name}
          </span>
        </span>
        <span>{formatDate(latest.uploaded_at)}</span>
      </div>
    </div>
  );
}

// ─── Admin Table View ─────────────────────────────────────────────────────────

function AdminTableView({
  manuals,
  onDelete,
}: {
  manuals: Manual[];
  onDelete: (id: string, title: string) => void;
}) {
  return (
    <div className="w-full flex-1 flex flex-col">
      {/* Mobile Card Layout */}
      <div className="block lg:hidden space-y-3 flex-1">
        {manuals.length === 0 ? (
          <div className="bg-white p-8 text-center text-gray-400 rounded-xl border border-gray-200 h-full flex flex-col items-center justify-center min-h-[250px]">
            No manuals found.
          </div>
        ) : (
          manuals.map((manual) => {
            const latest = manual.versions[0];
            return (
              <div
                key={manual.manual_id}
                className="bg-white rounded-xl border border-gray-200 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm break-words">
                      {manual.title}
                    </p>
                    {manual.description && (
                      <p className="text-xs text-gray-400 line-clamp-2 mt-0.5 break-words">
                        {manual.description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onDelete(manual.manual_id, manual.title)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-between border-t border-b border-gray-50 py-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[manual.category]}`}
                  >
                    {CATEGORY_ICONS[manual.category]}
                    {manual.category}
                  </span>
                  <span className="text-xs text-gray-500">
                    Versions:{" "}
                    <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                      {manual.versions.length}
                    </span>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
                  <div className="min-w-0">
                    <p className="truncate">By {latest.uploaded_by_name}</p>
                    <p className="mt-0.5">{formatDate(latest.uploaded_at)}</p>
                  </div>
                  <a
                    href={latest.cloudinary_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 bg-red-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-red-700 transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {latest.version_label}
                  </a>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop View */}
      <div className="hidden lg:block overflow-hidden bg-white shadow-sm rounded-xl border border-gray-200 flex-1">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold text-gray-600">Title</th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Category
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">Latest</th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Versions
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Last Updated
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600">
                Uploaded By
              </th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {manuals.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  No manuals found.
                </td>
              </tr>
            ) : (
              manuals.map((manual) => {
                const latest = manual.versions[0];
                return (
                  <tr
                    key={manual.manual_id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600 flex-shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 max-w-[220px]">
                          <p className="font-medium text-gray-900 truncate">
                            {manual.title}
                          </p>
                          {manual.description && (
                            <p className="text-xs text-gray-400 truncate">
                              {manual.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[manual.category]}`}
                      >
                        {CATEGORY_ICONS[manual.category]}
                        {manual.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={latest.cloudinary_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-700 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {latest.version_label}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                      {manual.versions.length}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">
                      {formatDate(latest.uploaded_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm truncate max-w-[120px]">
                      {latest.uploaded_by_name}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() =>
                            onDelete(manual.manual_id, manual.title)
                          }
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                          title="Delete manual"
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
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const currentUserId = session?.user?.id;
  const profile = users?.find((u) => u.user_id === currentUserId);
  const currentUserRole = profile?.role ?? session?.user?.user_metadata?.role;

  const isAdmin =
    currentUserRole === "admin" ||
    currentUserRole === "super_admin" ||
    currentUserRole === "manager";

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [activeCategory, setActiveCategory] = useState<ManualCategory | "All">(
    "All",
  );
  const [searchValue, setSearchValue] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    manualId: string;
    label: string;
  }>({ open: false, manualId: "", label: "" });

  // ── Fetch manuals ──
  const { data, refetch, isLoading } = useQuery<{ manuals: Manual[] }>({
    queryKey: ["polices", activeCategory],
    queryFn: async () => {
      const params =
        activeCategory !== "All" ? { category: activeCategory } : {};
      const res = await api.get("/policies/get_policies", { params });
      return res.data;
    },
  });

  const manuals = data?.manuals ?? [];

  const filtered = manuals.filter((m) => {
    if (!searchValue) return true;
    const q = searchValue.toLowerCase();
    return (
      m.title.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q) ||
      m.description?.toLowerCase().includes(q)
    );
  });

  // ── Delete ──
  const { mutate: deleteManual, isPending: isDeleting } = useMutation({
    mutationFn: (manualId: string) => api.delete(`/policies/${manualId}`),
    onSuccess: () => {
      toast.success(`"${confirmDelete.label}" deleted.`);
      refetch();
      setConfirmDelete({ open: false, manualId: "", label: "" });
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error ?? "Delete failed. Please try again.";
      toast.error(message);
      setConfirmDelete({ open: false, manualId: "", label: "" });
    },
  });

  const categoryCounts = (
    ["All", ...CATEGORIES] as (ManualCategory | "All")[]
  ).map((c) => ({
    label: c,
    count:
      c === "All"
        ? manuals.length
        : manuals.filter((m) => m.category === c).length,
  }));

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50 flex flex-col">
      {/* ── Header ── */}
      <div className="mb-5 sm:mb-6 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Procedures & Policies
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {manuals.length} manual{manuals.length !== 1 ? "s" : ""} ·{" "}
              {manuals.reduce((a, m) => a + m.versions.length, 0)} total
              versions
            </p>
          </div>

          <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full xs:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search manuals..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"
              />
            </div>

            <div className="flex items-center gap-2 justify-between xs:justify-start">
              {isAdmin && (
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white shrink-0">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-2.5 text-sm transition ${viewMode === "grid" ? "bg-red-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}
                    title="Grid view"
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("table")}
                    className={`p-2.5 text-sm transition ${viewMode === "table" ? "bg-red-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}
                    title="Table view"
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              )}

              {isAdmin && (
                <button
                  onClick={() => setUploadOpen(true)}
                  className="bg-red-600 text-white flex items-center justify-center gap-2 px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm font-medium shadow-sm flex-1 xs:flex-initial whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" /> Upload Manual
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Category Tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 sm:mb-6 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 shrink-0">
        {categoryCounts.map(({ label, count }) => (
          <button
            key={label}
            onClick={() => setActiveCategory(label as ManualCategory | "All")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition border whitespace-nowrap ${
              activeCategory === label
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:text-red-600"
            }`}
          >
            {label !== "All" && CATEGORY_ICONS[label as ManualCategory]}
            {label}
            <span
              className={`text-xs font-mono ml-0.5 ${activeCategory === label ? "text-red-200" : "text-gray-400"}`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Content (Fills vertical viewport evenly to block empty spaces) ── */}
      <div className="flex-1 flex flex-col justify-start">
        {isLoading ? (
          <div className="flex items-center justify-center py-24 flex-1">
            <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
          </div>
        ) : isAdmin && viewMode === "table" ? (
          <AdminTableView
            manuals={filtered}
            onDelete={(id, title) =>
              setConfirmDelete({ open: true, manualId: id, label: title })
            }
          />
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-16 text-center flex-1 flex flex-col items-center justify-center min-h-[320px]">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium text-sm sm:text-base">
              No manuals found
            </p>
            <p className="text-xs sm:text-sm text-gray-400 mt-1">
              {isAdmin
                ? "Upload a manual to get started."
                : "No manuals have been published yet."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 auto-rows-max">
            {filtered.map((manual) => (
              <ManualCard
                key={manual.manual_id}
                manual={manual}
                isAdmin={isAdmin}
                onDelete={(id, title) =>
                  setConfirmDelete({ open: true, manualId: id, label: title })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {confirmDelete.open && (
        <ConfirmDeleteDialog
          label={confirmDelete.label}
          isDeleting={isDeleting}
          onConfirm={() => deleteManual(confirmDelete.manualId)}
          onCancel={() =>
            setConfirmDelete({ open: false, manualId: "", label: "" })
          }
        />
      )}

      <UploadManualModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={refetch}
        uploadedById={currentUserId ?? ""}
      />
    </div>
  );
}
