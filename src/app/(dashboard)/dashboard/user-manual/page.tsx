"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2, Upload, Clock } from "lucide-react";
import api from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import UploadManualVersionModal from "./components/UploadManualVersionModal";

interface ManualVersionSummary {
  version_id: string;
  cloudinary_url: string;
  file_name: string;
  file_size_bytes: number | null;
  version_label: string;
  version_notes: string | null;
  uploaded_by_name: string;
  uploaded_at: string;
}

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

export default function UserManualPage() {
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => (await api.get("/get_user")).data,
  });

  const currentUserId = session?.user?.id;
  const profile = users?.find((u) => u.user_id === currentUserId);
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const accessProfile = resolveAccessProfile(profile, sessionRole);
  const { data: groupPresetData } = useGroupPresets();
  const groupPresets = groupPresetData?.presets;

  // Driven by the "user-manual" / "add" entry in the permission matrix (see
  // Access Control → Manage User) instead of a hardcoded role check. System
  // Administrator/Super Admin get it by default, Executive Role gets it
  // unconditionally too, and any other role can be granted it individually
  // from User Management. The actual enforcement is server-side on
  // POST /api/user-manual — this only decides whether the button renders.
  const canUpload = Boolean(
    accessProfile &&
      canPerformModuleAction(
        accessProfile,
        "user-manual",
        "add",
        sessionRole,
        groupPresets,
      ),
  );

  const { data, isLoading, refetch } = useQuery<{
    current: ManualVersionSummary | null;
    history: ManualVersionSummary[];
  }>({
    queryKey: ["user-manual"],
    queryFn: async () => (await api.get("/user-manual")).data,
  });

  const current = data?.current ?? null;
  const history = useMemo(() => data?.history ?? [], [data]);

  return (
    <div className="p-4 sm:p-6 min-h-screen bg-gray-50">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">User Manual</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            How to use the Wills Farms platform — read it below or download it.
          </p>
        </div>
        {canUpload && (
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-sm font-medium shadow-sm whitespace-nowrap"
          >
            <Upload className="w-4 h-4" /> Upload New Version
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <Loader2 className="w-6 h-6 text-gray-300 mx-auto animate-spin" />
        </div>
      ) : !current ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 sm:p-16 text-center">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium text-sm sm:text-base">No manual has been uploaded yet.</p>
          {canUpload && (
            <p className="text-xs sm:text-sm text-gray-400 mt-1">
              Use "Upload New Version" above to add the first one.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm">
                {current.file_name} <span className="text-gray-400 font-normal">· {current.version_label}</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Updated {formatDate(current.uploaded_at)} by {current.uploaded_by_name}
                {current.file_size_bytes ? ` · ${formatBytes(current.file_size_bytes)}` : ""}
              </p>
              {current.version_notes && (
                <p className="text-xs text-gray-500 mt-1">{current.version_notes}</p>
              )}
            </div>
            <a
              href={current.cloudinary_url}
              target="_blank"
              rel="noreferrer"
              download
              className="inline-flex items-center gap-1.5 bg-red-600 text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-red-700 transition shrink-0"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-4">
            <iframe
              src={current.cloudinary_url}
              title="User Manual"
              className="w-full h-[75vh]"
            />
          </div>

          {history.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
              <div className="flex items-center gap-1.5 mb-3">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Previous versions</p>
              </div>
              <div className="space-y-2">
                {history.map((v) => (
                  <div key={v.version_id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <span className="text-gray-700 font-medium">{v.version_label}</span>{" "}
                      <span className="text-gray-400 text-xs">
                        · {formatDate(v.uploaded_at)} by {v.uploaded_by_name}
                      </span>
                    </div>
                    <a
                      href={v.cloudinary_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-red-600 hover:text-red-700 text-xs font-medium shrink-0"
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <UploadManualVersionModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={refetch}
      />
    </div>
  );
}
