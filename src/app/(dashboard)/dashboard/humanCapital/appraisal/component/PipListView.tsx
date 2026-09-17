"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, ExternalLink } from "lucide-react";
import api from "@/lib/api";
import { hasFullAppraisalAccess } from "@/lib/accessControl";
import { viewerCanActOnTeamAppraisals } from "@/lib/appraisal/viewerAccess";
import type { AppraisalPipStatus, PipListItem } from "@/lib/appraisal/pipInstances";
import { TableSkeleton } from "@/components/skeletons/PageSkeletons";
import Pagination, { PAGE_SIZE } from "@/app/(dashboard)/dashboard/humanCapital/recruitment/components/Pagination";
import type { ViewerContext } from "./appraisalTypes";

function periodLabel(row: PipListItem): string {
  if (row.review_quarter === "Q4") {
    return `Annual ${row.review_year}`;
  }
  return `${row.review_quarter} ${row.review_year}`;
}

function PipStatusBadge({ status }: { status: AppraisalPipStatus }) {
  const label = status === "completed" ? "Completed" : "Active";
  const cls =
    status === "completed"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : "bg-blue-50 text-blue-800 border-blue-200";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function PipCard({ row }: { row: PipListItem }) {
  const href = `/dashboard/humanCapital/appraisal/pipForms?id=${row.appraisal_id}`;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 text-sm truncate">{row.employee_name}</p>
          <p className="text-xs text-gray-400 truncate">{row.job_title}</p>
        </div>
        <PipStatusBadge status={row.status} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-gray-400">Period</p>
          <p className="font-medium text-gray-700 mt-0.5">{periodLabel(row)}</p>
        </div>
        <div>
          <p className="text-gray-400">Appraisal score</p>
          <p className="font-medium text-gray-700 mt-0.5">
            {row.final_quarter_score != null ? `${row.final_quarter_score.toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>
      <Link
        href={href}
        className="block w-full py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition text-center"
      >
        View PIP
      </Link>
    </div>
  );
}

export default function PipListView({ viewer }: { viewer: ViewerContext }) {
  const viewerHasFullAccess = hasFullAppraisalAccess(viewer.role);
  const viewerCanAppraiseOthers = viewerCanActOnTeamAppraisals(viewer);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["appraisal-pips-list", viewer.userId, viewer.role],
    queryFn: async () => {
      const res = await api.get("/appraisal/pips");
      return res.data.data as { items: PipListItem[]; scope: string };
    },
  });

  const items = data?.items ?? [];
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [items.length]);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const paginated = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [items, page],
  );

  const subtitle = viewerHasFullAccess
    ? "All submitted performance improvement plans"
    : viewerCanAppraiseOthers
      ? "Submitted PIPs for you and employees assigned to you"
      : "Your submitted performance improvement plans";

  const emptyMessage = viewerHasFullAccess
    ? "No submitted PIPs yet."
    : viewerCanAppraiseOthers
      ? "No submitted PIPs for your team yet."
      : "You do not have a submitted PIP yet.";

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-full">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900">PIP</h2>
        <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : isError ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-sm font-semibold text-gray-700">Could not load PIPs</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-semibold text-gray-700">{emptyMessage}</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            PIPs appear here after they are submitted. Draft plans stay on the linked appraisal until
            submission.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Appraisal score</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 w-28" />
                </tr>
              </thead>
              <tbody>
                {paginated.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{row.employee_name}</p>
                      <p className="text-xs text-gray-400">{row.job_title}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{periodLabel(row)}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.final_quarter_score != null
                        ? `${row.final_quarter_score.toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <PipStatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(row.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/humanCapital/appraisal/pipForms?id=${row.appraisal_id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                      >
                        View
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {paginated.map((row) => (
              <PipCard key={row.id} row={row} />
            ))}
          </div>

          {pageCount > 1 && (
            <div className="mt-4">
              <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
