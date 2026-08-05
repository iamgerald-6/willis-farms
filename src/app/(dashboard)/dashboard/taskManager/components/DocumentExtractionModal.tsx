"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  Upload,
  Loader2,
  CheckCircle2,
  Trash2,
  Sparkles,
  FolderOpen,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  TMProject,
  ExtractedTaskProposal,
  PortalDocument,
  ExtractionJobFile,
} from "@/types/taskManager";
import { User } from "@/types";
import OwnerSelect from "./OwnerSelect";

type Step = "upload" | "extracting" | "review";
type SourceMode = "upload" | "existing";

async function uploadToCloudinary(file: File): Promise<{ secure_url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "willsUpload");
  formData.append("folder", "TaskManagerDocs");

  const res = await fetch(
    "https://api.cloudinary.com/v1_1/dmvr8ooz1/auto/upload",
    { method: "POST", body: formData },
  );
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(
      json?.error?.message ?? `Upload failed (HTTP ${res.status})`,
    );
  }
  return { secure_url: json.secure_url };
}

const MAX_FILES = 5;

export default function DocumentExtractionModal({
  project,
  users,
  onClose,
  onSaved,
}: {
  project: TMProject;
  users: User[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sourceMode, setSourceMode] = useState<SourceMode>("upload");
  const [step, setStep] = useState<Step>("upload");
  // Multiple files can be read together in one batch — e.g. a policy
  // document plus a separate document describing it — so Claude sees both
  // and can cross-reference between them instead of extracting each one in
  // isolation. Upload-new and choose-existing are still mutually exclusive
  // per batch (switching tabs clears the other), same as before.
  const [files, setFiles] = useState<File[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<PortalDocument[]>([]);
  const [docSearch, setDocSearch] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ExtractedTaskProposal[]>([]);
  const [saving, setSaving] = useState(false);
  const [sourceFileNames, setSourceFileNames] = useState<string[]>([]);

  const { data: docsData, isLoading: docsLoading } = useQuery<{
    documents: PortalDocument[];
  }>({
    queryKey: ["tm-portal-documents"],
    queryFn: async () => (await api.get("/task-manager/documents")).data,
    enabled: sourceMode === "existing",
  });

  const filteredDocs = (docsData?.documents ?? []).filter((d) =>
    d.title.toLowerCase().includes(docSearch.toLowerCase()),
  );

  const batchSize =
    sourceMode === "upload" ? files.length : selectedDocs.length;
  const canExtract = batchSize > 0 && batchSize <= MAX_FILES;

  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    setFiles((prev) => {
      const merged = [...prev, ...Array.from(picked)];
      // De-dupe by name+size — picking the same file twice from the
      // browser's file dialog is easy to do by accident.
      const seen = new Set<string>();
      return merged.filter((f) => {
        const key = `${f.name}:${f.size}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  };

  const toggleDoc = (doc: PortalDocument) => {
    setSelectedDocs((prev) =>
      prev.some((d) => d.id === doc.id)
        ? prev.filter((d) => d.id !== doc.id)
        : [...prev, doc],
    );
  };

  const handleExtract = async () => {
    if (!canExtract) return;
    setStep("extracting");
    try {
      let batch: ExtractionJobFile[];
      if (sourceMode === "upload") {
        const uploaded = await Promise.all(
          files.map(async (f) => {
            try {
              const { secure_url } = await uploadToCloudinary(f);
              return { file_url: secure_url, file_name: f.name };
            } catch (err: any) {
              throw new Error(`"${f.name}": ${err.message ?? "upload failed"}`);
            }
          }),
        );
        batch = uploaded;
      } else {
        batch = selectedDocs.map((d) => ({
          file_url: d.url,
          file_name: d.file_name,
        }));
      }

      setSourceFileNames(batch.map((f) => f.file_name));
      const res = await api.post("/task-manager/extract", {
        project_id: project.id,
        files: batch,
      });
      setJobId(res.data.job.id);
      setProposals(res.data.job.extracted_tasks ?? []);
      setStep("review");
    } catch (err: any) {
      // A blank error (no err.response.data.error) usually means the
      // request never got a proper response at all — most often a
      // platform timeout on an unusually large/high-resolution file,
      // rather than Claude actually failing to read it.
      toast.error(
        err?.response?.data?.error ??
          err.message ??
          "Couldn't read those documents — a file may be too large or the connection timed out.",
      );
      setStep("upload");
    }
  };

  const updateProposal = (
    idx: number,
    patch: Partial<ExtractedTaskProposal>,
  ) => {
    setProposals((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    );
  };

  const removeProposal = (idx: number) => {
    setProposals((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!jobId || proposals.length === 0) return;
    setSaving(true);
    try {
      await api.post(`/task-manager/extract/${jobId}/save`, {
        tasks: proposals,
      });
      const fromLabel =
        sourceFileNames.length > 1
          ? `${sourceFileNames.length} documents`
          : `"${sourceFileNames[0]}"`;
      toast.success(
        `${proposals.length} task${proposals.length === 1 ? "" : "s"} added from ${fromLabel}`,
      );
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to save tasks");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-red-600" />
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Add Tasks From Document(s)
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">{project.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {step === "upload" && (
            <>
              <div className="flex items-center gap-1 mb-4 border border-gray-200 rounded-lg p-1 w-fit">
                <button
                  onClick={() => {
                    setSourceMode("upload");
                    setSelectedDocs([]);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    sourceMode === "upload"
                      ? "bg-red-600 text-white"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" /> Upload new
                </button>
                <button
                  onClick={() => {
                    setSourceMode("existing");
                    setFiles([]);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    sourceMode === "existing"
                      ? "bg-red-600 text-white"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" /> Choose existing
                </button>
              </div>

              {sourceMode === "upload" ? (
                <>
                  <p className="text-sm text-gray-500 mb-4">
                    Upload one or more related documents — a permit, licence,
                    regulatory document, or a photo/scan (including handwritten
                    pages). If you upload more than one, Claude reads them
                    together as a single set (e.g. a policy and a separate
                    document describing it) instead of one at a time. Up to{" "}
                    {MAX_FILES} at once. You review and edit the proposed tasks
                    before anything is saved.
                  </p>
                  <div
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                      files.length > 0
                        ? "border-green-400 bg-green-50"
                        : "border-gray-200 hover:border-red-300 hover:bg-red-50/40"
                    }`}
                    onClick={() =>
                      document.getElementById("tm-doc-upload")?.click()
                    }
                  >
                    <input
                      id="tm-doc-upload"
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    {files.length > 0 ? (
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <span className="text-sm font-medium text-green-700">
                          {files.length} file{files.length === 1 ? "" : "s"}{" "}
                          selected — click to add more
                        </span>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">
                          Drag & drop, or{" "}
                          <span className="text-red-600 font-medium">
                            browse
                          </span>{" "}
                          — select multiple files at once, or add more one at a
                          time
                        </p>
                      </>
                    )}
                  </div>
                  {files.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {files.map((f, i) => (
                        <div
                          key={`${f.name}:${f.size}`}
                          className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                            <span className="text-xs text-gray-700 truncate">
                              {f.name}
                            </span>
                          </div>
                          <button
                            onClick={() =>
                              setFiles((prev) => prev.filter((_, j) => j !== i))
                            }
                            className="p-1 text-gray-300 hover:text-red-600 flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {files.length > MAX_FILES && (
                    <p className="text-xs text-red-600 mt-2">
                      Up to {MAX_FILES} files per batch — remove{" "}
                      {files.length - MAX_FILES} to continue.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-3">
                    Pick one or more documents already uploaded elsewhere in the
                    portal — Policies & Ops or the SOP library. Selecting more
                    than one reads them together as a single set.
                  </p>
                  <input
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    placeholder="Search documents…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
                    {docsLoading && (
                      <p className="text-sm text-gray-400 text-center py-6">
                        Loading documents…
                      </p>
                    )}
                    {!docsLoading && filteredDocs.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-6">
                        No documents found.
                      </p>
                    )}
                    {filteredDocs.map((doc) => {
                      const checked = selectedDocs.some((d) => d.id === doc.id);
                      return (
                        <button
                          key={doc.id}
                          onClick={() => toggleDoc(doc)}
                          className={`w-full flex items-center gap-3 text-left px-3 py-2.5 hover:bg-gray-50 ${checked ? "bg-red-50" : ""}`}
                        >
                          <FileText
                            className={`w-4 h-4 flex-shrink-0 ${checked ? "text-red-600" : "text-gray-300"}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {doc.title}
                            </p>
                            <p className="text-xs text-gray-400">
                              {doc.source}
                              {doc.category ? ` · ${doc.category}` : ""}
                            </p>
                          </div>
                          {checked && (
                            <CheckCircle2 className="w-4 h-4 text-red-600 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {selectedDocs.length > MAX_FILES && (
                    <p className="text-xs text-red-600 mt-2">
                      Up to {MAX_FILES} documents per batch — remove{" "}
                      {selectedDocs.length - MAX_FILES} to continue.
                    </p>
                  )}
                </>
              )}

              <button
                onClick={handleExtract}
                disabled={!canExtract}
                className="mt-5 w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {batchSize > 1
                  ? `Read ${batchSize} Documents & Propose Tasks`
                  : "Read Document & Propose Tasks"}
              </button>
            </>
          )}

          {step === "extracting" && (
            <div className="py-16 flex flex-col items-center gap-3 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin text-red-600" />
              <p className="text-sm">
                {batchSize > 1
                  ? "Reading the documents together and identifying obligations…"
                  : "Reading the document and identifying obligations…"}
              </p>
            </div>
          )}

          {step === "review" && (
            <>
              <p className="text-sm text-gray-500 mb-4">
                {proposals.length} proposed task
                {proposals.length === 1 ? "" : "s"} — edit, remove, or assign an
                owner before saving.
              </p>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {proposals.map((p, idx) => (
                  <div
                    key={idx}
                    className="border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-start gap-2">
                      <input
                        value={p.title}
                        onChange={(e) =>
                          updateProposal(idx, { title: e.target.value })
                        }
                        className="flex-1 text-sm font-semibold border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <button
                        onClick={() => removeProposal(idx)}
                        className="p-1.5 text-gray-300 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input
                        type="date"
                        value={p.due_date ?? ""}
                        onChange={(e) =>
                          updateProposal(idx, {
                            due_date: e.target.value || null,
                          })
                        }
                        className="text-xs border border-gray-200 rounded-md px-2 py-1.5"
                      />
                      <div className="text-xs">
                        <OwnerSelect
                          users={users}
                          value={p.owner_id ?? null}
                          onChange={(id) =>
                            updateProposal(idx, { owner_id: id })
                          }
                        />
                        {p.owner_name && (
                          <p className="text-[11px] text-gray-400 mt-1">
                            Written as "{p.owner_name}"
                            {!p.owner_id && " — no confident match, pick above"}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={!!p.is_recurring}
                          onChange={(e) =>
                            updateProposal(idx, {
                              is_recurring: e.target.checked,
                            })
                          }
                        />
                        Recurring
                      </label>
                      {sourceFileNames.length > 1 && p.source_file_name && (
                        <span
                          className="text-[10px] text-gray-400 truncate max-w-[55%]"
                          title={p.source_file_name}
                        >
                          From: {p.source_file_name}
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-400 mt-2 line-clamp-2">
                        {p.description}
                      </p>
                    )}
                  </div>
                ))}
                {proposals.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">
                    All proposals removed.
                  </p>
                )}
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={onClose}
                  disabled={saving}
                  className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || proposals.length === 0}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                >
                  {saving
                    ? "Saving…"
                    : `Save ${proposals.length} Task${proposals.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
