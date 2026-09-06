"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { JobPosting, JobPostingStatus } from "@/lib/careers/jobPostings";
import {
  formatPublicJobTitle,
  JOB_POSTING_STATUS_LABELS,
  normalizePostingStatus,
} from "@/lib/careers/jobPostings";
import { Calendar, Clock, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { IOSTimePicker } from "@/components/IOSTimePicker";
import PostingHistoryDrawer from "./PostingHistoryDrawer";
import Pagination, { PAGE_SIZE } from "./Pagination";
import type { OrgCustomListType } from "@/lib/organizationalStructureCustomLists";

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

export default function CareersTab({ adminId }: { adminId: string }) {
  const queryClient = useQueryClient();
  const [historyPosting, setHistoryPosting] = useState<JobPosting | null>(null);

  // Republish now only asks for a new closing date/time — title,
  // description, org-structure fields, etc. can no longer be edited from
  // this page. Editing that content lives on the "Create job posting" tab
  // under System Definitions.
  const [republishTarget, setRepublishTarget] = useState<JobPosting | null>(null);
  const [republishClosesAt, setRepublishClosesAt] = useState("");

  const { data: postings = [], isLoading } = useQuery({
    queryKey: ["job_postings"],
    queryFn: async () => {
      const res = await api.get("/careers/postings");
      return res.data.data as JobPosting[];
    },
  });

  // The org-structure fields (site, department, etc.) live on dynamically
  // named columns — this is only fetched so republish can carry those
  // values forward onto the new posting, the same as every other field.
  const { data: orgListTypes = [] } = useQuery<OrgCustomListType[]>({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () => {
      const res = await api.get("/organizational-structure/custom-list-types");
      return res.data.data as OrgCustomListType[];
    },
  });
  const orgFieldColumns = useMemo(
    () =>
      orgListTypes.flatMap((t) =>
        [t.job_posting_column, t.job_posting_min_column, t.job_posting_max_column].filter(
          (c): c is string => typeof c === "string" && c.length > 0,
        ),
      ),
    [orgListTypes],
  );

  // Only closes a posting now — reopening a closed posting no longer flips
  // this same row back to published (see republishMutation below). A closed
  // posting's applicants are done and settled; a "reopen" is a fresh hiring
  // round with its own applicants, so it needs its own posting id rather
  // than reusing this one. Reusing the id used to make every downstream
  // per-round feature (the role hiring summary report, most notably) treat
  // the new round's applicants as part of the old, already-decided one.
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: JobPostingStatus }) =>
      api.patch(`/careers/postings/${id}`, { status, changed_by: adminId }),
    onSuccess: () => {
      toast.success("Posting closed.");
      queryClient.invalidateQueries({ queryKey: ["job_postings"] });
    },
    onError: () => toast.error("Could not update posting status."),
  });

  // Reopening a closed role for a new hiring round — re-posts the SAME
  // content (title, description, requirements, org fields, everything)
  // under a new posting id, with only the closing date/time changed here.
  // The old posting stays closed exactly as it was, with its own applicants
  // and history intact; it's linked via supersedes_id so it drops off this
  // list once the new one exists.
  const republishMutation = useMutation({
    mutationFn: async () => {
      if (!republishTarget) return;
      const payload = {
        job_title_key: republishTarget.job_title_key,
        location: republishTarget.location,
        employment_type: republishTarget.employment_type,
        summary: republishTarget.summary,
        description: republishTarget.description,
        role_scope: republishTarget.role_scope,
        key_responsibilities: republishTarget.key_responsibilities,
        minimum_qualifications: republishTarget.minimum_qualifications,
        preferred_qualifications: republishTarget.preferred_qualifications,
        experience: republishTarget.experience,
        required_skills_attributes: republishTarget.required_skills_attributes,
        non_negotiable_standards: republishTarget.non_negotiable_standards,
        jd_file_url: republishTarget.jd_file_url,
        jd_file_public_id: republishTarget.jd_file_public_id,
        // republishClosesAt is "YYYY-MM-DDTHH:mm" — treated as Ghana local
        // time (always UTC+0, no DST). Appending "Z" stores it as literal
        // UTC rather than reinterpreting it in the admin's own timezone.
        closes_at: `${republishClosesAt}:00Z`,
        status: "published",
        supersedes_id: republishTarget.id,
        created_by: adminId,
        // Carry the org-structure assignments (site, department, etc.)
        // forward too — these live on dynamically named columns, so they
        // can't be listed above by name.
        ...Object.fromEntries(
          orgFieldColumns.map((col) => [col, republishTarget[col] ?? null]),
        ),
      };
      return api.post("/careers/postings", payload);
    },
    onSuccess: () => {
      toast.success("Posting republished.");
      queryClient.invalidateQueries({ queryKey: ["job_postings"] });
      setRepublishTarget(null);
      setRepublishClosesAt("");
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not republish posting.");
    },
  });

  const openRepublish = (posting: JobPosting) => {
    setRepublishTarget(posting);
    setRepublishClosesAt("");
  };

  // Once a closed posting has been reopened as a new one, hide it here — it
  // would otherwise sit alongside its replacement looking like a duplicate.
  // Nothing is deleted; it's still reachable via its own applicants' pages.
  const sorted = useMemo(
    () =>
      postings
        .filter((p) => !p.superseded_by)
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [postings],
  );

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);
  const paginated = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Career postings</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Creating and editing job postings now happens under System
            Definitions -&gt; Create job posting. Closing and republishing a
            posting still happens here.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-500">
          No career postings yet. Add one from System Definitions -&gt; Create job posting.
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
              {paginated.map((posting) => (
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
                      onClick={() => setHistoryPosting(posting)}
                      title="History"
                      className="inline-flex p-1.5 rounded-full border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400 mr-3 align-middle"
                    >
                      <History className="w-3.5 h-3.5" />
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
                        onClick={() => openRepublish(posting)}
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
          <Pagination
            page={page}
            pageCount={pageCount}
            onPageChange={setPage}
            totalItems={sorted.length}
          />
        </div>
      )}

      {republishTarget && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          onClick={() => setRepublishTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <h2 className="text-sm font-bold text-gray-900">Republish this posting?</h2>
              <p className="text-sm text-gray-600 mt-1">
                {formatPublicJobTitle(republishTarget.title)} will be reposted with the
                same content under a new closing date. To change the title, description,
                or other details, use Create job posting under System Definitions.
              </p>

              <div className="flex flex-wrap items-end gap-4 mt-4">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Closing date
                  </span>
                  <input
                    type="date"
                    className="mt-1 h-10 w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={republishClosesAt.split("T")[0] ?? ""}
                    onChange={(e) => {
                      const time = republishClosesAt.split("T")[1] || "00:00";
                      setRepublishClosesAt(`${e.target.value}T${time}`);
                    }}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Closing time
                  </span>
                  <div className="mt-1">
                    <IOSTimePicker
                      value={republishClosesAt.split("T")[1] ?? ""}
                      onChange={(time) => {
                        const date = republishClosesAt.split("T")[0] || "";
                        setRepublishClosesAt(`${date}T${time}`);
                      }}
                    />
                  </div>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setRepublishTarget(null)}
                disabled={republishMutation.isPending}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => republishMutation.mutate()}
                disabled={
                  republishMutation.isPending ||
                  !republishClosesAt.split("T")[0] ||
                  !republishClosesAt.split("T")[1]
                }
                className="px-3 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-60 bg-gray-900 hover:bg-gray-800"
              >
                {republishMutation.isPending ? "Working…" : "Republish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyPosting && (
        <PostingHistoryDrawer
          posting={historyPosting}
          onClose={() => setHistoryPosting(null)}
        />
      )}
    </div>
  );
}
