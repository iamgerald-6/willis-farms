"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
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
import { supabase } from "@/lib/supabaseClient";
import api from "@/lib/api";
import { User } from "@/types";
import { resolveAccessProfile } from "@/lib/pagePermissions";
import { canPerformModuleAction } from "@/lib/permissionActions";
import { useGroupPresets } from "@/hooks/useGroupPresets";
import type { OrgCustomListItem, OrgCustomListType } from "@/lib/organizationalStructureCustomLists";
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

const inputClass =
  "w-full border border-gray-200 p-2 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500";

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

function resolvePostingJobTitleKey(
  posting: JobPosting,
  options: JobPostingOption[],
): string {
  if (posting.job_title_key) return posting.job_title_key;
  const byTitle = options.find((o) => o.label === posting.title);
  return byTitle?.key ?? "";
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

export default function CreateJobPostingPage() {
  const queryClient = useQueryClient();

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data;
    },
  });

  const profile = users?.find((u) => u.user_id === session?.user?.id);
  const sessionRole = session?.user?.user_metadata?.role as string | undefined;
  const accessProfile = resolveAccessProfile(profile, sessionRole);
  const { data: groupPresetData } = useGroupPresets();
  const groupPresets = groupPresetData?.presets;
  const canView =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "view", sessionRole, groupPresets);
  const canAdd =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "add", sessionRole, groupPresets);
  const canEdit =
    accessProfile &&
    canPerformModuleAction(accessProfile, "sys:definitions", "edit", sessionRole, groupPresets);

  // --- Org-structure list types + their items (drives one <select> per list) ---
  const { data: listTypes = [], isLoading: listTypesLoading } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/custom-list-types");
      return res.data.data as OrgCustomListType[];
    },
    enabled: !!canView,
  });

  const orgFieldListTypes = useMemo(
    () => listTypes.filter((lt): lt is OrgCustomListType & { job_posting_column: string } =>
      typeof lt.job_posting_column === "string" && lt.job_posting_column.length > 0,
    ),
    [listTypes],
  );

  const orgFieldItemQueries = useQueries({
    queries: orgFieldListTypes.map((lt) => ({
      queryKey: ["organizational_structure_custom_list_items", lt.id],
      queryFn: async () => {
        const res = await api.get(`/organizational-structure/custom-list-types/${lt.id}/items`);
        return res.data.data as OrgCustomListItem[];
      },
      enabled: !!canView,
    })),
  });

  // --- Job title options + postings list ---
  const { data: jobPostingOptions = [] } = useQuery({
    queryKey: ["careers_job_postings"],
    queryFn: async () => {
      const res = await api.get("/careers/job-postings");
      return res.data.data as JobPostingOption[];
    },
    enabled: !!canView,
  });

  const { data: postings = [], isLoading: postingsLoading } = useQuery({
    queryKey: ["job_postings"],
    queryFn: async () => {
      const res = await api.get("/careers/postings");
      return res.data.data as JobPosting[];
    },
    enabled: !!canView,
  });

  const sorted = useMemo(
    () =>
      [...postings]
        .filter((p) => !p.superseded_by)
        .sort((a, b) => +new Date(b.created_at as string) - +new Date(a.created_at as string)),
    [postings],
  );

  // --- Form state ---
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<JobPosting | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [orgFieldValues, setOrgFieldValues] = useState<Record<string, string>>({});
  const [uploadingJd, setUploadingJd] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const resetForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
    setOrgFieldValues({});
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm(),
      job_title_key: jobPostingOptions[0]?.key ?? "",
    });
    setOrgFieldValues({});
    setShowForm(true);
  };

  const openEdit = (posting: JobPosting) => {
    setEditing(posting);
    setForm({
      job_title_key: resolvePostingJobTitleKey(posting, jobPostingOptions),
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
      status: normalizePostingStatus(posting),
      jd_file_url: posting.jd_file_url,
      jd_file_public_id: posting.jd_file_public_id,
    });
    const nextOrgValues: Record<string, string> = {};
    for (const lt of orgFieldListTypes) {
      const value = posting[lt.job_posting_column];
      if (typeof value === "string") nextOrgValues[lt.job_posting_column] = value;
    }
    setOrgFieldValues(nextOrgValues);
    setShowForm(true);
  };

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
        required_skills_attributes:
          fields.required_skills_attributes || f.required_skills_attributes,
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
        // form.closes_at is "YYYY-MM-DDTHH:mm", treated as Ghana local time
        // (UTC+0, no DST) — appending "Z" stores it as literal UTC rather
        // than reinterpreting it in the admin's own browser timezone.
        closes_at: `${form.closes_at}:00Z`,
        status: form.status,
        jd_file_url: form.jd_file_url,
        jd_file_public_id: form.jd_file_public_id,
        ...orgFieldValues,
      };

      if (editing) {
        return api.patch(`/careers/postings/${editing.id}`, payload);
      }
      return api.post("/careers/postings", {
        ...payload,
        created_by: session?.user?.id,
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Posting updated." : "Job posting created.");
      queryClient.invalidateQueries({ queryKey: ["job_postings"] });
      resetForm();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save posting.");
    },
  });

  if (sessionLoading || usersLoading) {
    return (
      <div className="p-4 md:p-6 bg-gray-50 min-h-full">
        <div className="h-8 w-56 bg-gray-100 rounded animate-pulse mb-2" />
        <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 text-sm">
            System Definitions view access is required to open this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <Link
        href="/dashboard/system-definitions"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to System Definitions
      </Link>

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-red-600" />
            Create job posting
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Publish and edit career postings, including which site, business
            unit, department, and other organizational structure lists they
            belong to. Closing and republishing a posting still happens on
            the Recruitment page.
          </p>
        </div>
        {canAdd && (
          <button
            type="button"
            onClick={() => (showForm ? resetForm() : openCreate())}
            className="shrink-0 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "Close" : "Add job posting"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <p className="text-sm font-semibold text-gray-800 mb-4">
            {editing ? "Edit job posting" : "New job posting"}
          </p>

          {/* Org-structure fields */}
          {orgFieldListTypes.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Organizational structure
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {orgFieldListTypes.map((lt, index) => {
                  const items = orgFieldItemQueries[index]?.data ?? [];
                  const loadingItems = orgFieldItemQueries[index]?.isLoading;
                  return (
                    <label key={lt.id} className="block">
                      <span className="text-xs font-medium text-gray-600">{lt.label}</span>
                      <select
                        className={`${inputClass} mt-1`}
                        value={orgFieldValues[lt.job_posting_column] ?? ""}
                        onChange={(e) =>
                          setOrgFieldValues((prev) => ({
                            ...prev,
                            [lt.job_posting_column]: e.target.value,
                          }))
                        }
                        disabled={loadingItems}
                      >
                        <option value="">Select {lt.singular.toLowerCase()}…</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Job posting fields */}
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Job title *</span>
              <select
                className={`${inputClass} mt-1`}
                value={form.job_title_key}
                onChange={(e) => setForm((f) => ({ ...f, job_title_key: e.target.value }))}
              >
                <option value="">Select a job title…</option>
                {jobPostingOptions.map((role) => (
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
                  className={`${inputClass} mt-1`}
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Employment type</span>
                <input
                  className={`${inputClass} mt-1`}
                  value={form.employment_type}
                  onChange={(e) => setForm((f) => ({ ...f, employment_type: e.target.value }))}
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
                        const uploaded = await uploadCareersFile(file, "CareersJD", ACCEPT_JD);
                        setForm((f) => ({
                          ...f,
                          jd_file_url: uploaded.secure_url,
                          jd_file_public_id: uploaded.public_id,
                        }));
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "JD upload failed.");
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
                className={`${inputClass} mt-1`}
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
                    onChange={(text) => setForm((f) => ({ ...f, [section.key]: text }))}
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
                <select
                  className="mt-1 h-10 w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as JobPostingStatus }))
                  }
                >
                  <option value="published">Published</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-5 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.job_title_key}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 transition-colors flex items-center gap-2"
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? "Save changes" : "Create posting"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {postingsLoading || listTypesLoading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            No job postings yet. Add one to show it on the public careers page.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Closing date</th>
                <th className="px-4 py-2.5 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((posting) => (
                <tr key={posting.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 text-gray-900">
                    <p className="font-medium">{formatPublicJobTitle(posting.title)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{posting.location}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-600 border-gray-200">
                      {JOB_POSTING_STATUS_LABELS[normalizePostingStatus(posting)]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{formatDate(posting.closes_at)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEdit(posting)}
                        className="text-xs font-medium text-red-700 hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
