"use client";

import { useEffect, useMemo, useState } from "react";
import Pagination, { PAGE_SIZE } from "./Pagination";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { RecruitmentEmployeeRow } from "@/lib/careers/employeeStatus";
import {
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUS_STYLES,
  EXIT_EMPLOYMENT_STATUS_LABELS,
  isActiveEmploymentStatus,
  isExitEmploymentStatus,
  type EmploymentStatus,
  type ExitEmploymentStatus,
} from "@/lib/careers/employeeStatus";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import ProbationRefereesSection from "./ProbationRefereesSection";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Accra",
  });
}

type EmploymentAction = "permanent" | "exit" | "";

function EmployeeDetail({
  row,
  onClose,
  onUpdated,
}: {
  row: RecruitmentEmployeeRow;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [selectedAction, setSelectedAction] = useState<EmploymentAction>("");
  const [selectedExit, setSelectedExit] = useState<ExitEmploymentStatus | "">("");
  const [exitReason, setExitReason] = useState("");

  const resetForm = () => {
    setSelectedAction("");
    setSelectedExit("");
    setExitReason("");
  };

  const updateStatus = useMutation({
    mutationFn: (payload: {
      employment_status: EmploymentStatus;
      exit_reason?: string;
    }) =>
      api.patch("/careers/employees", {
        user_id: row.user_id,
        ...payload,
      }),
    onSuccess: (_res, variables) => {
      if (isExitEmploymentStatus(variables.employment_status)) {
        toast.success(
          `${EMPLOYMENT_STATUS_LABELS[variables.employment_status]} recorded — account deactivated.`,
        );
      } else {
        toast.success("Marked as permanent — probation complete.");
      }
      onUpdated();
      onClose();
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast.error(e?.response?.data?.error ?? "Update failed.");
    },
  });

  const canManage =
    isActiveEmploymentStatus(row.employment_status) && !row.is_disabled;
  const exited = isExitEmploymentStatus(row.employment_status);
  const onProbation = row.employment_status === "probation";

  const canSave =
    selectedAction === "permanent" ||
    (selectedAction === "exit" &&
      !!selectedExit &&
      exitReason.trim().length > 0);

  const saveChanges = () => {
    if (selectedAction === "permanent") {
      updateStatus.mutate({ employment_status: "active" });
      return;
    }
    if (selectedAction === "exit") {
      if (!selectedExit) {
        toast.error("Select an exit type.");
        return;
      }
      if (!exitReason.trim()) {
        toast.error("Enter a reason for this exit.");
        return;
      }
      updateStatus.mutate({
        employment_status: selectedExit,
        exit_reason: exitReason.trim(),
      });
    }
  };

  const selectAction = (action: EmploymentAction) => {
    setSelectedAction(action);
    if (action !== "exit") {
      setSelectedExit("");
      setExitReason("");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {row.first_name} {row.last_name}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {row.company_id}
              {row.reference_number ? ` · Ref ${row.reference_number}` : ""}
              {row.is_disabled ? " · Inactive" : ""}
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
                {row.job_position ?? row.role_title ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
              <span
                className={`inline-flex mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_STATUS_STYLES[row.employment_status]}`}
              >
                {EMPLOYMENT_STATUS_LABELS[row.employment_status]}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Email</p>
              <a
                href={`mailto:${row.email}`}
                className="font-medium text-red-600 hover:underline mt-1 block"
              >
                {row.email}
              </a>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Grade</p>
              <p className="font-medium text-gray-900 mt-1">{row.grade_level ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Platform invited</p>
              <p className="font-medium text-gray-900 mt-1">
                {formatDate(row.platform_invited_at)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">
                Onboarding submitted
              </p>
              <p className="font-medium text-gray-900 mt-1">
                {formatDate(row.onboarding_submitted_at)}
              </p>
            </div>
          </div>

          {exited && row.exit_reason && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Exit reason
              </p>
              <p className="text-gray-800 mt-1 whitespace-pre-wrap">{row.exit_reason}</p>
              {row.exited_at && (
                <p className="text-xs text-gray-400 mt-2">
                  Recorded {formatDate(row.exited_at)}
                </p>
              )}
            </div>
          )}

          {onProbation && (
            <ProbationRefereesSection
              userId={row.user_id}
              applicationId={row.application_id}
            />
          )}

          {canManage && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  Update employment status
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Select an outcome, then save. Nothing changes until you confirm.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {onProbation && (
                  <button
                    type="button"
                    onClick={() => selectAction("permanent")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                      selectedAction === "permanent"
                        ? "bg-green-700 text-white border-green-700"
                        : "bg-white text-gray-700 border-gray-200 hover:border-green-300"
                    }`}
                  >
                    Permanent
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => selectAction("exit")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                    selectedAction === "exit"
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  Exit
                </button>
              </div>

              {selectedAction === "permanent" && (
                <p className="text-xs text-gray-600">
                  Marks probation complete. The employee stays active on WillsOne.
                </p>
              )}

              {selectedAction === "exit" && (
                <>
                  <p className="text-xs text-gray-600">
                    Select Fired, Quit, or Deceased, add a reason, then save.
                    The WillsOne account will be deactivated automatically.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {EXIT_EMPLOYMENT_STATUS_LABELS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSelectedExit(option.value)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                          selectedExit === option.value
                            ? "bg-red-700 text-white border-red-700"
                            : "bg-white text-gray-700 border-gray-200 hover:border-red-300"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {selectedExit && (
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-2">
                        Reason
                      </label>
                      <textarea
                        value={exitReason}
                        onChange={(e) => setExitReason(e.target.value)}
                        rows={4}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                        placeholder={
                          selectedExit === "fired"
                            ? "e.g. policy violation, performance…"
                            : selectedExit === "quit"
                              ? "e.g. resignation letter date, notice given…"
                              : "e.g. date reported, next of kin contact…"
                        }
                      />
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={updateStatus.isPending}
                  className="flex-1 py-2 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveChanges}
                  disabled={!canSave || updateStatus.isPending}
                  className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  {updateStatus.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {updateStatus.isPending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmployeesTab() {
  const [selected, setSelected] = useState<RecruitmentEmployeeRow | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["recruitment-employees"],
    queryFn: async () => {
      const res = await api.get("/careers/employees");
      return res.data.data as RecruitmentEmployeeRow[];
    },
  });

  const rows = useMemo(() => data ?? [], [data]);
  const probationCount = rows.filter(
    (r) => r.employment_status === "probation" && !r.is_disabled,
  ).length;

  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);
  const paginated = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  return (
    <>
      <div className="overflow-x-auto bg-white shadow-sm rounded-2xl border border-gray-200">
        <table className="w-full text-left text-sm min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 font-semibold text-gray-600">Employee</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Role</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Employee ID</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Invited</th>
              <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 font-semibold text-gray-600 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No employees on probation yet. After a candidate submits onboarding, complete
                  Section O on the Onboarding tab and click{" "}
                  <strong>Finish onboarding & invite to WillsOne</strong>.
                </td>
              </tr>
            ) : (
              paginated.map((row) => (
                <tr
                  key={row.user_id}
                  className={`border-b border-gray-100 hover:bg-gray-50/80 ${row.is_disabled ? "opacity-75" : ""}`}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">
                      {row.first_name} {row.last_name}
                    </p>
                    <p className="text-xs text-gray-400">{row.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.job_position ?? row.role_title ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {row.company_id}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(row.platform_invited_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${EMPLOYMENT_STATUS_STYLES[row.employment_status]}`}
                    >
                      {EMPLOYMENT_STATUS_LABELS[row.employment_status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
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
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          totalItems={rows.length}
        />
      </div>

      {probationCount > 0 && (
        <p className="text-xs text-amber-700 mt-3">
          {probationCount} employee{probationCount === 1 ? "" : "s"} on probation.
        </p>
      )}

      {selected && (
        <EmployeeDetail
          row={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["recruitment-employees"] });
          }}
        />
      )}
    </>
  );
}
