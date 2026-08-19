"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { JobPosting, JobPostingStatus } from "@/lib/careers/jobPostings";
import {
  formatPublicJobTitle,
  JOB_POSTING_STATUS_LABELS,
  normalizePostingStatus,
} from "@/lib/careers/jobPostings";
import type { JobPostingOption } from "@/lib/careers/jobPostingOptions";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import {
  Calendar,
  FileText,
  Loader2,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function postingStatus(posting: JobPosting): JobPostingStatus {
  return normalizePostingStatus(posting);
}

function statusStyle(status: JobPostingStatus): string {
  return status === "published"
    ? "bg-green-50 text-green-700 border-green-200"
    : "bg-gray-50 text-gray-600 border-gray-200";
}

function resolvePostingJobTitleKey(
  posting: JobPosting,
  options: JobPostingOption[],
): string {
  if (posting.job_title_key) return posting.job_title_key;
  const byTitle = options.find((o) => o.label === posting.title);
  if (byTitle) return byTitle.key;
  return (
    options.find((o) => o.interviewGuideKey === posting.interview_guide_key)?.key ??
    ""
  );
}

type FormState = {
  job_title_key: string;
  location: string;
  employment_type: string;
  summary: string;
  description: string;
  closes_at: string;
  status: JobPostingStatus;
  jd_file_url: string | null;
  jd_file_public_id: string | null;
};

const emptyForm = (): FormState => ({
  job_title_key: "",
  location: "Eastern Region, Ghana",
  employment_type: "Full-time",
  summary: "",
  description: "",
  closes_at: "",
  status: "published",
  jd_file_url: null,
  jd_file_public_id: null,
});

export default function CareersTab() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<JobPosting | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [uploadingJd, setUploadingJd] = useState(false);

  const { data: postings = [], isLoading } = useQuery({
    queryKey: ["job_postings"],
    queryFn: async () => {
      const res = await api.get("/careers/postings");
      return res.data.data as JobPosting[];
    },
  });

  const { data: jobPostings = [] } = useQuery({
    queryKey: ["careers_job_postings"],
    queryFn: async () => {
      const res = await api.get("/careers/job-postings");
      return res.data.data as JobPostingOption[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        job_title_key: form.job_title_key,
        location: form.location.trim(),
        employment_type: form.employment_type.trim(),
        summary: form.summary.trim(),
        description: form.description.trim(),
        closes_at: new Date(form.closes_at).toISOString(),
        status: form.status,
        jd_file_url: form.jd_file_url,
        jd_file_public_id: form.jd_file_public_id,
      };

      if (editing) {
        return api.patch(`/careers/postings/${editing.id}`, payload);
      }
      return api.post("/careers/postings", payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Posting updated." : "Career posting published.");
      queryClient.invalidateQueries({ queryKey: ["job_postings"] });
      setShowModal(false);
      setEditing(null);
      setForm(emptyForm());
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save posting.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: JobPostingStatus }) =>
      api.patch(`/careers/postings/${id}`, { status }),
    onSuccess: (_data, { status }) => {
      toast.success(
        status === "closed" ? "Posting closed." : "Posting republished.",
      );
      queryClient.invalidateQueries({ queryKey: ["job_postings"] });
    },
    onError: () => toast.error("Could not update posting status."),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm(),
      job_title_key: jobPostings[0]?.key ?? "",
    });
    setShowModal(true);
  };

  const openEdit = (posting: JobPosting) => {
    setEditing(posting);
    setForm({
      job_title_key: resolvePostingJobTitleKey(posting, jobPostings),
      location: posting.location,
      employment_type: posting.employment_type,
      summary: posting.summary,
      description: posting.description,
      closes_at: posting.closes_at.slice(0, 16),
      status: postingStatus(posting),
      jd_file_url: posting.jd_file_url,
      jd_file_public_id: posting.jd_file_public_id,
    });
    setShowModal(true);
  };

  const sorted = useMemo(
    () => [...postings].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [postings],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Career postings</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Job titles come from System Definitions. When a closing date passes, status changes to closed — HR can republish or edit anytime.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
        >
          <Plus className="w-4 h-4" />
          New posting
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-500">
          No career postings yet. Create one to show it on the public careers page.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Closes</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((posting) => (
                <tr key={posting.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">
                      {formatPublicJobTitle(posting.title)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{posting.location}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(posting.closes_at)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusStyle(postingStatus(posting))}`}
                    >
                      {JOB_POSTING_STATUS_LABELS[postingStatus(posting)]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(posting)}
                      className="text-xs font-medium text-red-700 hover:underline mr-3"
                    >
                      Edit
                    </button>
                    {postingStatus(posting) === "published" ? (
                      <button
                        type="button"
                        onClick={() =>
                          statusMutation.mutate({ id: posting.id, status: "closed" })
                        }
                        className="text-xs font-medium text-gray-500 hover:underline"
                      >
                        Close
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          statusMutation.mutate({ id: posting.id, status: "published" })
                        }
                        className="text-xs font-medium text-green-700 hover:underline"
                      >
                        Republish
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">
                {editing ? "Edit career posting" : "New career posting"}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Job title *</span>
                <select
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.job_title_key}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, job_title_key: e.target.value }))
                  }
                >
                  <option value="">Select a job title…</option>
                  {jobPostings.map((role) => (
                    <option key={role.key} value={role.key}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Location</span>
                  <input
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Employment type</span>
                  <input
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.employment_type}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, employment_type: e.target.value }))
                    }
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">Short summary (card preview) *</span>
                <textarea
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  rows={2}
                  value={form.summary}
                  onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">Full job description (public) *</span>
                <textarea
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  rows={6}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Closing date & time *
                  </span>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.closes_at}
                    onChange={(e) => setForm((f) => ({ ...f, closes_at: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Status</span>
                  <select
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        status: e.target.value as JobPostingStatus,
                      }))
                    }
                  >
                    <option value="published">Published</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
              </div>

              <div>
                <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  JD document (HR archive — not shown publicly)
                </span>
                <label className="mt-1 flex items-center gap-3 cursor-pointer border border-dashed border-gray-300 rounded-lg px-4 py-3 hover:border-red-300">
                  {uploadingJd ? (
                    <Loader2 className="w-5 h-5 animate-spin text-red-600" />
                  ) : (
                    <Upload className="w-5 h-5 text-gray-400" />
                  )}
                  <span className="text-sm text-gray-600">
                    {form.jd_file_url ? "JD uploaded — click to replace" : "Upload JD to Cloudinary"}
                  </span>
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.doc,.docx,image/*"
                    disabled={uploadingJd}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingJd(true);
                      try {
                        const uploaded = await uploadCareersFile(file, "CareersJD");
                        setForm((f) => ({
                          ...f,
                          jd_file_url: uploaded.secure_url,
                          jd_file_public_id: uploaded.public_id,
                        }));
                      } catch {
                        toast.error("JD upload failed.");
                      } finally {
                        setUploadingJd(false);
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saveMutation.isPending || !form.job_title_key}
                onClick={() => saveMutation.mutate()}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Publish posting"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
