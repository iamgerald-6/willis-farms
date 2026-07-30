"use client";

import { useState } from "react";
import { X, Upload, Loader2, CheckCircle2, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { TMProject, ExtractedTaskProposal } from "@/types/taskManager";

type Step = "upload" | "extracting" | "review";

async function uploadToCloudinary(file: File): Promise<{ secure_url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "willsUpload");
  formData.append("folder", "TaskManagerDocs");

  const res = await fetch("https://api.cloudinary.com/v1_1/dmvr8ooz1/image/upload", { method: "POST", body: formData });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(json?.error?.message ?? `Upload failed (HTTP ${res.status})`);
  }
  return { secure_url: json.secure_url };
}

export default function DocumentExtractionModal({
  project,
  onClose,
  onSaved,
}: {
  project: TMProject;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ExtractedTaskProposal[]>([]);
  const [saving, setSaving] = useState(false);

  const handleExtract = async () => {
    if (!file) return;
    setStep("extracting");
    try {
      const { secure_url } = await uploadToCloudinary(file);
      const res = await api.post("/task-manager/extract", {
        project_id: project.id,
        file_url: secure_url,
        file_name: file.name,
      });
      setJobId(res.data.job.id);
      setProposals(res.data.job.extracted_tasks ?? []);
      setStep("review");
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Couldn't read that document");
      setStep("upload");
    }
  };

  const updateProposal = (idx: number, patch: Partial<ExtractedTaskProposal>) => {
    setProposals((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const removeProposal = (idx: number) => {
    setProposals((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!jobId || proposals.length === 0) return;
    setSaving(true);
    try {
      await api.post(`/task-manager/extract/${jobId}/save`, { tasks: proposals });
      toast.success(`${proposals.length} task${proposals.length === 1 ? "" : "s"} added from "${file?.name}"`);
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
              <h2 className="text-base font-bold text-gray-900">Add Tasks From a Document</h2>
              <p className="text-xs text-gray-500 mt-0.5">{project.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {step === "upload" && (
            <>
              <p className="text-sm text-gray-500 mb-4">
                Upload a permit, licence, or regulatory document. Claude reads it and proposes tasks with deadlines — you review and edit them before anything is saved.
              </p>
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                  file ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-red-300 hover:bg-red-50/40"
                }`}
                onClick={() => document.getElementById("tm-doc-upload")?.click()}
              >
                <input
                  id="tm-doc-upload"
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setFile(f);
                  }}
                />
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-green-700">{file.name}</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">
                      Drag & drop a PDF or <span className="text-red-600 font-medium">browse</span>
                    </p>
                  </>
                )}
              </div>
              <button
                onClick={handleExtract}
                disabled={!file}
                className="mt-5 w-full bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                Read Document & Propose Tasks
              </button>
            </>
          )}

          {step === "extracting" && (
            <div className="py-16 flex flex-col items-center gap-3 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin text-red-600" />
              <p className="text-sm">Reading the document and identifying obligations…</p>
            </div>
          )}

          {step === "review" && (
            <>
              <p className="text-sm text-gray-500 mb-4">
                {proposals.length} proposed task{proposals.length === 1 ? "" : "s"} — edit or remove any before saving. Owner can be assigned afterward from the task list.
              </p>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {proposals.map((p, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <input
                        value={p.title}
                        onChange={(e) => updateProposal(idx, { title: e.target.value })}
                        className="flex-1 text-sm font-semibold border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <button onClick={() => removeProposal(idx)} className="p-1.5 text-gray-300 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input
                        type="date"
                        value={p.due_date ?? ""}
                        onChange={(e) => updateProposal(idx, { due_date: e.target.value || null })}
                        className="text-xs border border-gray-200 rounded-md px-2 py-1.5"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={!!p.is_recurring}
                          onChange={(e) => updateProposal(idx, { is_recurring: e.target.checked })}
                        />
                        Recurring
                      </label>
                    </div>
                    {p.description && <p className="text-xs text-gray-400 mt-2 line-clamp-2">{p.description}</p>}
                  </div>
                ))}
                {proposals.length === 0 && <p className="text-sm text-gray-400 text-center py-6">All proposals removed.</p>}
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={onClose} disabled={saving} className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || proposals.length === 0}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                >
                  {saving ? "Saving…" : `Save ${proposals.length} Task${proposals.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
