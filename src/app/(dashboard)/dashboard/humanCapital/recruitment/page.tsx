"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  type ApplicationStatus,
  type JobApplication,
} from "@/lib/careers/types";
import InterviewPanelForm from "./components/InterviewPanelForm";
import {
  ExternalLink,
  FileText,
  Loader2,
  Search,
  UserPlus,
  X,
} from "lucide-react";

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  applied: "bg-blue-50 text-blue-700 border border-blue-200",
  under_review: "bg-amber-50 text-amber-700 border border-amber-200",
  shortlisted: "bg-purple-50 text-purple-700 border border-purple-200",
  interview: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  offer: "bg-green-50 text-green-700 border border-green-200",
  rejected: "bg-red-50 text-red-700 border border-red-200",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ApplicationDetail({
  application,
  onClose,
  onUpdated,
  adminId,
  openInterviewOnMount,
  onInterviewOpened,
}: {
  application: JobApplication;
  onClose: () => void;
  onUpdated: () => void;
  adminId: string;
  openInterviewOnMount?: boolean;
  onInterviewOpened?: () => void;
}) {
  const [status, setStatus] = useState<ApplicationStatus>(application.status);
  const [hrNotes, setHrNotes] = useState(application.hr_notes ?? "");
  const [showInterview, setShowInterview] = useState(
    openInterviewOnMount ?? false,
  );

  useEffect(() => {
    if (openInterviewOnMount) {
      setShowInterview(true);
      onInterviewOpened?.();
    }
  }, [openInterviewOnMount, onInterviewOpened]);

  const canInterview = ["shortlisted", "interview", "offer"].includes(
    application.status,
  );

  const mutation = useMutation({
    mutationFn: (payload: {
      id: string;
      status?: ApplicationStatus;
      hr_notes?: string;
    }) => api.patch("/careers/applications", payload),
    onSuccess: () => {
      toast.success("Application updated.");
      onUpdated();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Update failed.");
    },
  });

  const save = () => {
    mutation.mutate({
      id: application.id,
      status,
      hr_notes: hrNotes,
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-40 p-0 sm:p-4">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {application.full_name}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Ref {application.reference_number} · Applied{" "}
                {formatDate(application.created_at)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Role</p>
                <p className="font-medium text-gray-900 mt-1">
                  {application.role_title}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
                <span
                  className={`inline-flex mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[application.status]}`}
                >
                  {STATUS_LABELS[application.status]}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Email</p>
                <a
                  href={`mailto:${application.email}`}
                  className="font-medium text-red-600 hover:underline mt-1 block"
                >
                  {application.email}
                </a>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Phone</p>
                <p className="font-medium text-gray-900 mt-1">{application.phone}</p>
              </div>
              {application.location && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">
                    Location
                  </p>
                  <p className="font-medium text-gray-900 mt-1">
                    {application.location}
                  </p>
                </div>
              )}
            </div>

            {application.cover_note && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Cover note
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-xl p-4">
                  {application.cover_note}
                </p>
              </div>
            )}

            {application.cv_url && (
              <a
                href={application.cv_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:underline"
              >
                <FileText className="w-4 h-4" />
                View CV
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                Update status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                {APPLICATION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                HR notes (internal)
              </label>
              <textarea
                value={hrNotes}
                onChange={(e) => setHrNotes(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Screening notes, interview scheduling, etc."
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={save}
                disabled={mutation.isPending}
                className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {mutation.isPending ? "Saving…" : "Save changes"}
              </button>
              {canInterview && (
                <button
                  type="button"
                  onClick={() => setShowInterview(true)}
                  className="flex-1 py-2.5 border border-red-200 bg-red-50 text-red-700 text-sm font-medium rounded-lg hover:bg-red-100"
                >
                  Open interview guide
                </button>
              )}
            </div>

            {application.interview_submitted_at && (
              <p className="text-xs text-gray-400">
                Interview submitted{" "}
                {formatDate(application.interview_submitted_at)}
                {application.interview_form_data?.summary?.total_weighted !=
                  null && (
                  <>
                    {" "}
                    · Score{" "}
                    {application.interview_form_data.summary.total_weighted}
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {showInterview && (
        <InterviewPanelForm
          applicationId={application.id}
          adminId={adminId}
          onClose={() => setShowInterview(false)}
          onSaved={() => {
            onUpdated();
            setShowInterview(false);
          }}
        />
      )}
    </>
  );
}

function RecruitmentPageContent() {
  const searchParams = useSearchParams();
  const interviewParam = searchParams?.get("interview");

  const [filter, setFilter] = useState<ApplicationStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<JobApplication | null>(null);
  const [autoOpenInterviewId, setAutoOpenInterviewId] = useState<
    string | null
  >(null);
  const queryClient = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["get_users"],
    queryFn: async () => {
      const res = await api.get("/get_user");
      return res.data as { user_id: string; role: string }[];
    },
  });

  const currentUser = allUsers.find((u) => u.user_id === session?.user?.id);
  const role =
    currentUser?.role ??
    (session?.user?.user_metadata?.role as string | undefined) ??
    "";

  const isHr =
    role === "admin" || role === "manager" || role === "super_admin";

  const { data, isLoading } = useQuery({
    queryKey: ["job_applications"],
    queryFn: async () => {
      const res = await api.get("/careers/applications");
      return res.data.data as JobApplication[];
    },
    enabled: isHr,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((a) => {
      if (filter !== "all" && a.status !== filter) return false;
      if (!q) return true;
      return (
        a.full_name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.reference_number.toLowerCase().includes(q) ||
        a.role_title.toLowerCase().includes(q)
      );
    });
  }, [data, filter, search]);

  const newCount = (data ?? []).filter((a) => a.status === "applied").length;

  useEffect(() => {
    if (!interviewParam || !data?.length || !session?.user?.id) return;
    const app = data.find((a) => a.id === interviewParam);
    if (!app) return;
    if (!["shortlisted", "interview", "offer"].includes(app.status)) return;
    setSelected(app);
    setAutoOpenInterviewId(app.id);
  }, [interviewParam, data, session?.user?.id]);

  if (!session) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isHr) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-gray-600 text-sm">
            Recruitment inbox is available to HR admins and managers only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-red-600" />
            Recruitment
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Job applications and panel interview guides
          </p>
        </div>
        {newCount > 0 && (
          <span className="bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full text-xs font-medium w-fit">
            {newCount} new application{newCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, ref, role…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              filter === "all"
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            All
          </button>
          {APPLICATION_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                filter === s
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto bg-white shadow-sm rounded-2xl border border-gray-200">
        <table className="w-full text-left text-sm min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold text-gray-600">Candidate</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Role</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Ref</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Applied</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No applications found.
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-gray-100 hover:bg-gray-50/80"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{a.full_name}</p>
                    <p className="text-xs text-gray-400">{a.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{a.role_title}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {a.reference_number}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(a.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[a.status]}`}
                    >
                      {STATUS_LABELS[a.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(a)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <ApplicationDetail
          application={selected}
          onClose={() => setSelected(null)}
          adminId={session.user!.id}
          openInterviewOnMount={autoOpenInterviewId === selected.id}
          onInterviewOpened={() => setAutoOpenInterviewId(null)}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["job_applications"] });
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

export default function RecruitmentPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      }
    >
      <RecruitmentPageContent />
    </Suspense>
  );
}
