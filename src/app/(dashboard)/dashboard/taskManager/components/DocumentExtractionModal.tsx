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
import { minTaskDate } from "@/lib/taskDateLimits";
import { MAX_EXTRACTION_PAGES, MAX_DOCUMENT_PAGES, MAX_EXTRACTION_FILES as MAX_FILES, getPdfPageCount } from "@/lib/pdfPages";
import OwnerSelect from "./OwnerSelect";
import FrequencySelect from "./FrequencySelect";
import PdfPagePicker from "./PdfPagePicker";

type Step = "upload" | "extracting" | "selectPages" | "review";
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

// Checks a filename/MIME-type pair, but also takes an optional second
// candidate (a URL) — SOP-library documents come back from
// /task-manager/documents with file_name set to the content's *title*, not
// its actual filename (see documents/route.ts), so ".pdf" only shows up on
// the file's own URL for those. Uploaded files always have a real name +
// MIME type from the browser, so the second candidate is unused there.
function isPdfFile(name: string, secondary?: string) {
  const looksLikePdf = (s?: string) => !!s && (s === "application/pdf" || s.toLowerCase().split("?")[0].endsWith(".pdf"));
  return looksLikePdf(name) || looksLikePdf(secondary);
}

// One entry per PDF that needed narrowing down, keyed by its file_url (set
// once a document's already uploaded, so it's stable across a retry).
// `pages` is empty while a selection hasn't been made yet. `unrestricted`
// means the picker couldn't load a preview/page count for this file —
// extraction falls back to reading it in full rather than blocking on a
// selection that was never possible to make.
type PdfSelection = { pages: number[]; unrestricted: boolean };

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
  // The batch (already-uploaded file_url/file_name pairs, no page
  // restriction) that Claude couldn't finish reading in one pass — set only
  // when extraction fails with "too many obligations", which is what drives
  // the "selectPages" step. Everything is read in full by default; page
  // selection is a recovery step, not something the reviewer has to think
  // about up front.
  const [pendingBatch, setPendingBatch] = useState<ExtractionJobFile[] | null>(null);
  // Why the reviewer landed on the "selectPages" step — "pages" means a
  // document was over MAX_DOCUMENT_PAGES and got flagged before extraction
  // was even attempted; "obligations" means extraction actually ran and got
  // cut off. Only changes the wording shown, not the picker itself.
  const [selectPagesReason, setSelectPagesReason] = useState<"pages" | "obligations" | null>(null);
  // Per-PDF page selection from the page picker, keyed by file_url — see
  // PdfSelection above.
  const [pdfSelections, setPdfSelections] = useState<Record<string, PdfSelection>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ExtractedTaskProposal[]>([]);
  const [saving, setSaving] = useState(false);
  const [sourceFileNames, setSourceFileNames] = useState<string[]>([]);
  const minDate = minTaskDate();

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

  // Gates the "selectPages" retry button — every PDF in the failed batch
  // needs a resolved selection first: either the picker settled on 1-2
  // pages, or it couldn't preview the file at all (unrestricted, reads in
  // full). While a picker is still loading its page count, there's no entry
  // yet for that key, which blocks the button rather than racing ahead.
  const retryGateOk =
    !!pendingBatch &&
    pendingBatch.every((f) => {
      if (!isPdfFile(f.file_name, f.file_url)) return true;
      const sel = pdfSelections[f.file_url];
      if (!sel) return false;
      return sel.unrestricted || sel.pages.length >= 1;
    });

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

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, j) => j !== idx));
  };

  const toggleDoc = (doc: PortalDocument) => {
    setSelectedDocs((prev) =>
      prev.some((d) => d.id === doc.id) ? prev.filter((d) => d.id !== doc.id) : [...prev, doc],
    );
  };

  // Checks each PDF in a batch against MAX_DOCUMENT_PAGES before extraction
  // is even attempted — a document this long is very likely to blow through
  // Claude's output limit anyway, so there's no point spending a full call
  // just to find that out via the "too many obligations" failure. Uses the
  // local File when we still have one (upload tab, no network round trip);
  // falls back to fetching the URL otherwise (existing-document tab, or a
  // retry). Can't tell either way (e.g. a fetch/parse failure) just lets
  // the normal extraction attempt run rather than guessing.
  const findOversizedPdf = async (batch: ExtractionJobFile[], localFiles?: File[]): Promise<boolean> => {
    for (const entry of batch) {
      if (!isPdfFile(entry.file_name, entry.file_url)) continue;
      try {
        const localFile = localFiles?.find((f) => f.name === entry.file_name);
        const bytes = localFile ? await localFile.arrayBuffer() : await (await fetch(entry.file_url)).arrayBuffer();
        const count = await getPdfPageCount(bytes);
        if (count > MAX_DOCUMENT_PAGES) return true;
      } catch {
        // Ignore — fall through to a normal extraction attempt.
      }
    }
    return false;
  };

  // Shared by the initial attempt and a page-restricted retry. Every
  // document is read in full by default — page selection only ever enters
  // the picture as a recovery step, triggered either by the page-count
  // precheck above or by the server's "too many obligations" signal (see
  // extract/route.ts), never as something the reviewer has to plan for up
  // front.
  const runExtraction = async (batch: ExtractionJobFile[]) => {
    setStep("extracting");
    try {
      setSourceFileNames(batch.map((f) => f.file_name));
      const res = await api.post("/task-manager/extract", {
        project_id: project.id,
        files: batch,
      });
      setJobId(res.data.job.id);
      setProposals(res.data.job.extracted_tasks ?? []);
      setPendingBatch(null);
      setSelectPagesReason(null);
      setStep("review");
    } catch (err: any) {
      if (err?.response?.data?.reason === "too_many_obligations") {
        // Keep the original (unrestricted) batch around so the picker
        // starts fresh from each document's real page count, then let the
        // reviewer narrow it down and try again.
        setPendingBatch(batch.map(({ file_url, file_name }) => ({ file_url, file_name })));
        setSelectPagesReason("obligations");
        setStep("selectPages");
        return;
      }
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

  const handleExtract = async () => {
    if (!canExtract) return;
    setStep("extracting");
    try {
      let batch: ExtractionJobFile[];
      if (sourceMode === "upload") {
        batch = await Promise.all(
          files.map(async (f) => {
            try {
              const { secure_url } = await uploadToCloudinary(f);
              return { file_url: secure_url, file_name: f.name };
            } catch (err: any) {
              throw new Error(`"${f.name}": ${err.message ?? "upload failed"}`);
            }
          }),
        );
      } else {
        batch = selectedDocs.map((d) => ({ file_url: d.url, file_name: d.file_name }));
      }

      if (await findOversizedPdf(batch, sourceMode === "upload" ? files : undefined)) {
        setPendingBatch(batch);
        setSelectPagesReason("pages");
        setStep("selectPages");
        return;
      }

      await runExtraction(batch);
    } catch (err: any) {
      // Upload to Cloudinary itself failed — we never got as far as calling
      // /extract, so there's nothing more specific to report.
      toast.error(err.message ?? "Upload failed");
      setStep("upload");
    }
  };

  const handleRetryWithPages = async () => {
    if (!pendingBatch) return;
    const batch = pendingBatch.map((f) => {
      const sel = pdfSelections[f.file_url];
      return {
        ...f,
        ...(sel && !sel.unrestricted && sel.pages.length > 0 ? { pages: sel.pages } : {}),
      };
    });
    await runExtraction(batch);
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
    const tooOld = proposals.find(
      (p) => (p.start_date && p.start_date < minDate) || (p.due_date && p.due_date < minDate),
    );
    if (tooOld) {
      toast.error(`"${tooOld.title}" has a start or due date more than a year in the past — fix it before saving`);
      return;
    }
    const dueBeforeStart = proposals.find((p) => p.start_date && p.due_date && p.due_date < p.start_date);
    if (dueBeforeStart) {
      toast.error(`"${dueBeforeStart.title}" has a due date earlier than its start date — fix it before saving`);
      return;
    }
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
                    setPdfSelections({});
                    setPendingBatch(null);
                    setSelectPagesReason(null);
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
                    setPdfSelections({});
                    setPendingBatch(null);
                    setSelectPagesReason(null);
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
                    {MAX_FILES} at once. Each document is read in full — a PDF
                    longer than {MAX_DOCUMENT_PAGES} pages, or one with too many
                    obligations for Claude to get through in one pass, will
                    instead ask you to pick which pages to read. You review
                    and edit the proposed tasks before anything is saved.
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
                            onClick={() => removeFile(i)}
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
                      <div className="p-3 space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="h-10 bg-gray-100 animate-pulse rounded-lg" />
                        ))}
                      </div>
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
            <div className="py-8 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-lg" />
              ))}
              <p className="text-sm text-gray-500 text-center pt-2">
                {batchSize > 1
                  ? "Reading the documents together and identifying obligations…"
                  : "Reading the document and identifying obligations…"}
              </p>
            </div>
          )}

          {step === "selectPages" && pendingBatch && (
            <>
              <p className="text-sm text-gray-500 mb-1">
                {selectPagesReason === "pages"
                  ? `${pendingBatch.length > 1 ? "One of these documents is" : "This document is"} longer than ${MAX_DOCUMENT_PAGES} pages.`
                  : `${pendingBatch.length > 1 ? "These documents have" : "This document has"} too many obligations for Claude to read in one pass.`}
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Pick up to {MAX_EXTRACTION_PAGES} pages per PDF below, then try again — anything
                that isn't a PDF will still be read in full.
              </p>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {pendingBatch.map((f) => (
                  <div key={f.file_url} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                      <p className="text-xs font-semibold text-gray-700 truncate">{f.file_name}</p>
                    </div>
                    {isPdfFile(f.file_name, f.file_url) ? (
                      <PdfPagePicker
                        source={f.file_url}
                        pages={pdfSelections[f.file_url]?.pages ?? []}
                        onChange={(pages) =>
                          setPdfSelections((prev) => ({
                            ...prev,
                            [f.file_url]: { pages, unrestricted: false },
                          }))
                        }
                        onUnavailable={() =>
                          setPdfSelections((prev) => ({
                            ...prev,
                            [f.file_url]: { pages: [], unrestricted: true },
                          }))
                        }
                      />
                    ) : (
                      <p className="text-xs text-gray-400">Not a PDF — will be read in full.</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setPendingBatch(null);
                    setSelectPagesReason(null);
                    setPdfSelections({});
                    setStep("upload");
                  }}
                  className="flex-1 border border-gray-200 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleRetryWithPages}
                  disabled={!retryGateOk}
                  className="flex-1 bg-red-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  Try Again
                </button>
              </div>
            </>
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
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-0.5">Start Date</label>
                        <input
                          type="date"
                          value={p.start_date ?? ""}
                          min={minDate}
                          onChange={(e) =>
                            updateProposal(idx, {
                              start_date: e.target.value || null,
                            })
                          }
                          className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-0.5">Due Date</label>
                        <input
                          type="date"
                          value={p.due_date ?? ""}
                          min={p.start_date && p.start_date > minDate ? p.start_date : minDate}
                          onChange={(e) =>
                            updateProposal(idx, {
                              due_date: e.target.value || null,
                            })
                          }
                          className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5"
                        />
                      </div>
                    </div>
                    <div className="mt-2 text-xs">
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
                      {p.is_recurring && (
                        <FrequencySelect
                          value={p.frequency ?? ""}
                          onChange={(f) => updateProposal(idx, { frequency: f })}
                          className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white"
                        />
                      )}
                      {sourceFileNames.length > 1 && p.source_file_name && (
                        <span
                          className="text-[10px] text-gray-400 truncate max-w-[40%]"
                          title={p.source_file_name}
                        >
                          From: {p.source_file_name}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input
                        value={p.indicator ?? ""}
                        onChange={(e) => updateProposal(idx, { indicator: e.target.value || null })}
                        placeholder="Indicator (monitoring only)"
                        className="text-xs border border-gray-200 rounded-md px-2 py-1.5"
                      />
                      <input
                        value={p.method_provider ?? ""}
                        onChange={(e) => updateProposal(idx, { method_provider: e.target.value || null })}
                        placeholder="Method / provider (monitoring only)"
                        className="text-xs border border-gray-200 rounded-md px-2 py-1.5"
                      />
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
