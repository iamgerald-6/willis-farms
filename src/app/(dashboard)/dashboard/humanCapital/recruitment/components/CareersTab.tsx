"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { JobPosting, JobPostingStatus } from "@/lib/careers/jobPostings";
import {
  formatPublicJobTitle,
  JOB_POSTING_CONTENT_SECTIONS,
  JOB_POSTING_STATUS_LABELS,
  normalizePostingStatus,
  previewDescription,
} from "@/lib/careers/jobPostings";
import type { JobPostingOption } from "@/lib/careers/jobPostingOptions";
import { uploadCareersFile } from "@/lib/careers/uploadCareersFile";
import { ACCEPT_JD } from "@/lib/uploadConstraints";
import { IOSTimePicker } from "@/components/IOSTimePicker";
import { SectionTextEditor } from "@/components/SectionTextEditor";
import {
  Calendar,
  ChevronDown,
  Clock,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Accra",
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
  description: string;
  role_scope: string;
  key_responsibilities: string;
  minimum_qualifications: string;
  preferred_qualifications: string;
  experience: string;
  required_skills_attributes: string;
  non_negotiable_standards: string;
  closes_at: string;
  status: JobPostingStatus;
  jd_file_url: string | null;
  jd_file_public_id: string | null;
};

const emptyForm = (): FormState => ({
  job_title_key: "",
  location: "Eastern Region, Ghana",
  employment_type: "Full-time",
  description: "",
  role_scope: "",
  key_responsibilities: "",
  minimum_qualifications: "",
  preferred_qualifications: "",
  experience: "",
  required_skills_attributes: "",
  non_negotiable_standards: "",
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
  const [extracting, setExtracting] = useState(false);

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
        summary: previewDescription(form.description.trim()),
        description: form.description.trim(),
        role_scope: form.role_scope,
        key_responsibilities: form.key_responsibilities,
        minimum_qualifications: form.minimum_qualifications,
        preferred_qualifications: form.preferred_qualifications,
        experience: form.experience,
        required_skills_attributes: form.required_skills_attributes,
        non_negotiable_standards: form.non_negotiable_standards,
        // form.closes_at is "YYYY-MM-DDTHH:mm" from the date/time fields —
        // treated as Ghana local time (always UTC+0, no DST), not the
        // browser's own timezone. Appending "Z" stores it as literal UTC
        // rather than letting `new Date(...)` reinterpret it using
        // whatever timezone the admin's computer happens to be set to.
        closes_at: `${form.closes_at}:00Z`,
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

  // Only closes a posting now — reopening a closed posting no longer flips
  // this same row back to published (see openReopen below). A closed
  // posting's applicants are done and settled; a "reopen" is a fresh hiring
  // round with its own applicants, so it needs its own posting id rather
  // than reusing this one. Reusing the id used to make every downstream
  // per-round feature (the role hiring summary report, most notably) treat
  // the new round's applicants as part of the old, already-decided one.
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: JobPostingStatus }) =>
      api.patch(`/careers/postings/${id}`, { status }),
    onSuccess: () => {
      toast.success("Posting closed.");
      queryClient.invalidateQueries({ queryKey: ["job_postings"] });
    },
    onError: () => toast.error("Could not update posting status."),
  });

  const handleExtract = async () => {
    if (!form.jd_file_url) return;
    setExtracting(true);
    try {
      const res = await api.post("/careers/postings/extract", {
        file_url: form.jd_file_url,
      });
      const fields = res.data.data as {
        summary: string;
        role_scope: string;
        key_responsibilities: string;
        minimum_qualifications: string;
        preferred_qualifications: string;
        experience: string;
        required_skills_attributes: string;
        non_negotiable_standards: string;
      };
      setForm((f) => ({
        ...f,
        description: fields.summary || f.description,
        role_scope: fields.role_scope || f.role_scope,
        key_responsibilities: fields.key_responsibilities || f.key_responsibilities,
        minimum_qualifications: fields.minimum_qualifications || f.minimum_qualifications,
        preferred_qualifications: fields.preferred_qualifications || f.preferred_qualifications,
        experience: fields.experience || f.experience,
        required_skills_attributes: fields.required_skills_attributes || f.required_skills_attributes,
        non_negotiable_standards: fields.non_negotiable_standards || f.non_negotiable_standards,
      }));
      toast.success("Fields filled in from the document — review before saving.");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Couldn't read that document.";
      toast.error(message);
    } finally {
      setExtracting(false);
    }
  };

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
      description: posting.description,
      role_scope: posting.role_scope ?? "",
      key_responsibilities: posting.key_responsibilities ?? "",
      minimum_qualifications: posting.minimum_qualifications ?? "",
      preferred_qualifications: posting.preferred_qualifications ?? "",
      experience: posting.experience ?? "",
      required_skills_attributes: posting.required_skills_attributes ?? "",
      non_negotiable_standards: posting.non_negotiable_standards ?? "",
      closes_at: posting.closes_at.slice(0, 16),
      status: postingStatus(posting),
      jd_file_url: posting.jd_file_url,
      jd_file_public_id: posting.jd_file_public_id,
    });
    setShowModal(true);
  };

  // Reopening a closed role for a new hiring round — pre-fills the "New
  // posting" form with the closed posting's content (title, description,
  // requirements, etc.) but leaves `editing` unset, so saving goes through
  // POST and creates a genuinely new posting row with its own id, rather
  // than PATCHing the old one back to published. The old posting stays
  // closed exactly as it was, with its own applicants and history intact.
  // Closing date is left blank on purpose — HR reviews and sets a fresh one
  // rather than accidentally reusing a deadline that's already passed.
  const openReopen = (posting: JobPosting) => {
    setEditing(null);
    setForm({
      job_title_key: resolvePostingJobTitleKey(posting, jobPostings),
      location: posting.location,
      employment_type: posting.employment_type,
      description: posting.description,
      role_scope: posting.role_scope ?? "",
      key_responsibilities: posting.key_responsibilities ?? "",
      minimum_qualifications: posting.minimum_qualifications ?? "",
      preferred_qualifications: posting.preferred_qualifications ?? "",
      experience: posting.experience ?? "",
      required_skills_attributes: posting.required_skills_attributes ?? "",
      non_negotiable_standards: posting.non_negotiable_standards ?? "",
      closes_at: "",
      status: "published",
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
            Job titles come from System Definitions. When a closing date passes, status changes to closed. Reopening a closed posting starts a fresh hiring round as a new posting (with its own closing date to set) rather than reusing the old one — its applicants and reports stay untouched.
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
                        onClick={() => openReopen(posting)}
                        className="text-xs font-medium text-green-700 hover:underline"
                      >
                        Reopen
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

              <div>
                <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  JD document
                </span>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  Upload the job description document, or skip this and type the fields below manually.
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-3 cursor-pointer border border-dashed border-gray-300 rounded-lg px-4 py-3 hover:border-red-300">
                    {uploadingJd ? (
                      <Loader2 className="w-5 h-5 animate-spin text-red-600" />
                    ) : (
                      <Upload className="w-5 h-5 text-gray-400" />
                    )}
                    <span className="text-sm text-gray-600">
                      {form.jd_file_url ? "JD uploaded — click to replace" : "Upload JD"}
                    </span>
                    <input
                      type="file"
                      className="sr-only"
                      accept={ACCEPT_JD}
                      disabled={uploadingJd}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingJd(true);
                        try {
                          const uploaded = await uploadCareersFile(
                            file,
                            "CareersJD",
                            ACCEPT_JD,
                          );
                          setForm((f) => ({
                            ...f,
                            jd_file_url: uploaded.secure_url,
                            jd_file_public_id: uploaded.public_id,
                          }));
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : "JD upload failed.",
                          );
                        } finally {
                          setUploadingJd(false);
                        }
                      }}
                    />
                  </label>

                  {form.jd_file_url && (
                    <button
                      type="button"
                      disabled={extracting}
                      onClick={handleExtract}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                    >
                      {extracting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      {extracting ? "Reading document…" : "Auto-fill fields with AI"}
                    </button>
                  )}
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-gray-600">Job summary *</span>
                <textarea
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  rows={6}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>

              {JOB_POSTING_CONTENT_SECTIONS.map((section) => (
                <label key={section.key} className="block">
                  <span className="text-xs font-medium text-gray-600">{section.label}</span>
                  <div className="mt-1">
                    <SectionTextEditor
                      value={form[section.key]}
                      onChange={(text) =>
                        setForm((f) => ({ ...f, [section.key]: text }))
                      }
                    />
                  </div>
                </label>
              ))}

              <div className="flex flex-wrap items-end gap-14">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Closing date *
                  </span>
                  <input
                    type="date"
                    className="mt-1 h-10 w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={form.closes_at.split("T")[0] ?? ""}
                    onChange={(e) =>
                      setForm((f) => {
                        const time = f.closes_at.split("T")[1] || "00:00";
                        return { ...f, closes_at: `${e.target.value}T${time}` };
                      })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Closing time *
                  </span>
                  <div className="mt-1">
                    <IOSTimePicker
                      value={form.closes_at.split("T")[1] ?? ""}
                      onChange={(time) =>
                        setForm((f) => {
                          const date = f.closes_at.split("T")[0] || "";
                          return { ...f, closes_at: `${date}T${time}` };
                        })
                      }
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                    <Pencil className="w-3.5 h-3.5" />
                    Status *
                    </span>
                  <div className="relative mt-1">
                    <select
                      className="h-10 w-40 appearance-none rounded-lg border border-gray-200 pl-3 pr-8 py-2 text-sm"
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
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                  </div>
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
