"use client";

import { useMemo } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { PipTableColumn, PipTableSection } from "@/lib/appraisal/pipFormSchema";
import type { PipFormResponses } from "@/lib/appraisal/pipInstances";
import {
  appendCoachingSessionRow,
  coachingLogPeriodColumnLabel,
  ensureCoachingLogColumns,
  filterRowsWithReachedScheduleDates,
  findCoachingLogColumns,
  formatPipScheduleDateDisplay,
  isCoachingLogPrefilledColumn,
  isPipScheduleDateReached,
  normalizeCoachingLogRow,
  PIP_COACHING_COLUMN_KEYS,
  PIP_PROVIDED_BY_OTHER,
  readSupportPlanRow,
  resolveNextCoachingSessionDate,
} from "@/lib/appraisal/pipStages";
import { gapLabelForId, PIP_GAP_ID_KEY } from "@/lib/appraisal/pipGapChain";
import { PipValueControl } from "./PipValueControl";
import { resolvePipColumnControl } from "@/lib/appraisal/pipFormControls";

export default function PipCoachingLogSection({
  coachingSection,
  supportSection,
  gapsSection,
  responses,
  onChange,
  readOnly,
  selectedGapId,
  effectiveEndDate,
  canAddSession = true,
}: {
  coachingSection: PipTableSection;
  supportSection: PipTableSection;
  gapsSection: PipTableSection;
  responses: PipFormResponses;
  onChange: (next: PipFormResponses) => void;
  readOnly?: boolean;
  selectedGapId: string;
  effectiveEndDate?: string;
  /** False when all session dates up to the effective end date are used (until extended). */
  canAddSession?: boolean;
}) {
  const logSection = useMemo(
    () => ensureCoachingLogColumns(coachingSection),
    [coachingSection],
  );
  const logColumns = logSection.columns;
  const colKeys = useMemo(() => findCoachingLogColumns(logSection), [logSection]);
  const dateKey = colKeys.date?.key ?? PIP_COACHING_COLUMN_KEYS.date;

  const supportRows = responses.tables?.[supportSection.key] ?? [];
  const supportRow = supportRows.find(
    (r) => String(r[PIP_GAP_ID_KEY] ?? "") === selectedGapId,
  );

  const plan = supportRow ? readSupportPlanRow(supportRow, supportSection) : null;
  const gapLabel =
    selectedGapId && gapsSection
      ? gapLabelForId(selectedGapId, responses.tables ?? {}, gapsSection)
      : "—";

  const coachingRows = useMemo(() => {
    const all = responses.tables?.[coachingSection.key] ?? [];
    if (!selectedGapId) return [];
    return all
      .filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") === selectedGapId)
      .map((row) => normalizeCoachingLogRow(row, logSection));
  }, [responses.tables, coachingSection.key, selectedGapId, logSection]);

  const visibleCoachingRows = useMemo(
    () => filterRowsWithReachedScheduleDates(coachingRows, dateKey),
    [coachingRows, dateKey],
  );

  const nextSessionDate = useMemo(() => {
    if (!supportRow) return null;
    return resolveNextCoachingSessionDate(
      logSection,
      supportSection,
      supportRow,
      responses.tables?.[coachingSection.key] ?? [],
      effectiveEndDate,
    );
  }, [
    supportRow,
    logSection,
    supportSection,
    responses.tables,
    coachingSection.key,
    effectiveEndDate,
  ]);

  const planNotStarted =
    !!plan?.startDate &&
    !isPipScheduleDateReached(plan.startDate) &&
    visibleCoachingRows.length === 0;
  const nextSessionPending =
    !!nextSessionDate && !isPipScheduleDateReached(nextSessionDate);

  const updateCell = (sessionDate: string, colKey: string, value: string) => {
    const all = [...(responses.tables?.[coachingSection.key] ?? [])];
    const idx = all.findIndex(
      (r) =>
        String(r[PIP_GAP_ID_KEY] ?? "") === selectedGapId &&
        String(r[dateKey] ?? "") === sessionDate,
    );
    if (idx < 0) return;
    all[idx] = { ...all[idx], [colKey]: value };
    onChange({
      ...responses,
      tables: { ...(responses.tables ?? {}), [coachingSection.key]: all },
    });
  };

  const addSession = () => {
    if (!supportRow) {
      toast.error("Could not find the support plan for this gap.");
      return;
    }
    const all = responses.tables?.[coachingSection.key] ?? [];
    const { rows: next, added } = appendCoachingSessionRow(
      logSection,
      supportSection,
      supportRow,
      all,
      effectiveEndDate,
    );
    if (!added) {
      toast.error("No further session dates before the effective end date.");
      return;
    }
    onChange({
      ...responses,
      tables: { ...(responses.tables ?? {}), [coachingSection.key]: next },
    });
  };

  const providedByDisplay =
    plan?.providedBy === PIP_PROVIDED_BY_OTHER
      ? plan.providedByOther || "Other"
      : plan?.providedBy || "—";

  const periodColumnLabel = coachingLogPeriodColumnLabel(plan?.frequency);

  const renderCell = (
    col: PipTableColumn,
    row: Record<string, string | number | null>,
    sessionDate: string,
    rowIndex: number,
  ) => {
    let value = String(row[col.key] ?? "");
    if (
      (col.key === PIP_COACHING_COLUMN_KEYS.week || /^week$/i.test(col.label)) &&
      !value.trim()
    ) {
      value = String(rowIndex + 1);
    }
    if (isCoachingLogPrefilledColumn(col)) {
      return (
        <span className="block text-sm text-gray-800 whitespace-nowrap">{value || "—"}</span>
      );
    }

    const spec = resolvePipColumnControl(col);
    const inputType =
      col.type === "textarea" || col.key === PIP_COACHING_COLUMN_KEYS.coachedObserved
        ? "textarea"
        : spec.inputType;

    return (
      <PipValueControl
        spec={{ ...spec, inputType }}
        value={value}
        onChange={(v) => updateCell(sessionDate, col.key, v)}
        readOnly={readOnly}
        compact
        ariaLabel={col.label}
      />
    );
  };

  if (!selectedGapId) {
    return (
      <p className="text-sm text-gray-500 italic">
        Select a gap above to view and record sessions.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {plan && (
        <div
          key={selectedGapId}
          className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm space-y-1.5"
        >
          <p className="font-semibold text-indigo-950">{gapLabel}</p>
          <p className="text-indigo-900">
            <span className="text-indigo-700/80">Support:</span> {plan.supportAction || "—"}
          </p>
          <p className="text-indigo-900">
            <span className="text-indigo-700/80">Provided by:</span> {providedByDisplay}
          </p>
          <p className="text-indigo-900 whitespace-pre-wrap">
            <span className="text-indigo-700/80">Objective:</span> {plan.objective || "—"}
          </p>
          <p className="text-indigo-900">
            <span className="text-indigo-700/80">Schedule:</span> {plan.startDate || "—"} →{" "}
            {plan.endDate || "—"} · {plan.frequency}
          </p>
        </div>
      )}

      <div>
        {planNotStarted ? (
          <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
            Coaching begins on{" "}
            <strong>{formatPipScheduleDateDisplay(plan!.startDate)}</strong>. Sessions will appear
            here on that date.
          </p>
        ) : visibleCoachingRows.length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            No sessions due yet — the first session will appear when its scheduled date arrives.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500">
                  {logColumns.map((col) => {
                    const headerLabel =
                      col.key === PIP_COACHING_COLUMN_KEYS.week
                        ? periodColumnLabel
                        : col.label;
                    return (
                      <th
                        key={col.key}
                        className={`py-2 px-3 font-semibold uppercase tracking-wide ${
                          col.key === PIP_COACHING_COLUMN_KEYS.week ? "w-16" : ""
                        } ${col.key === PIP_COACHING_COLUMN_KEYS.date ? "min-w-[120px]" : ""} ${
                          col.type === "textarea" ? "min-w-[180px]" : ""
                        }`}
                      >
                        {headerLabel}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleCoachingRows.map((row, index) => {
                  const sessionDate = String(row[dateKey] ?? "");
                  return (
                    <tr
                      key={`${selectedGapId}-${sessionDate}-${index}`}
                      className="border-b border-gray-100"
                    >
                      {logColumns.map((col) => (
                        <td key={col.key} className="py-2 px-3 align-top">
                          {renderCell(col, row, sessionDate, index)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!readOnly && canAddSession && (
          <div className="mt-3">
            <button
              type="button"
              onClick={addSession}
              className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
            >
              <Plus className="w-3.5 h-3.5" /> Add session
            </button>
          </div>
        )}
        {!readOnly && !canAddSession && nextSessionPending && (
          <p className="mt-3 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            Next session available on{" "}
            <strong>{formatPipScheduleDateDisplay(nextSessionDate!)}</strong>
            {plan?.frequency ? ` (${plan.frequency.toLowerCase()} schedule)` : ""}.
          </p>
        )}
      </div>
    </div>
  );
}
