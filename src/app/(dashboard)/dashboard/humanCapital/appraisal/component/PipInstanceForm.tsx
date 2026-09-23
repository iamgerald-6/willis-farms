"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { ListRowsSkeleton, PipFormSkeleton } from "@/components/skeletons/PageSkeletons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import {
  ChevronLeft,
  ClipboardList,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Send,
  Shield,
  Trash2,
  User,
} from "lucide-react";
import type { HrFacilitatorOption } from "@/lib/appraisal/pipInstances";
import api from "@/lib/api";
import { hasFullAppraisalAccess } from "@/lib/accessControl";
import {
  type AppraisalPip,
  type PipFormResponses,
} from "@/lib/appraisal/pipInstances";
import {
  applyTableRowAutoIncrement,
  isAutoIncrementColumn,
  pipSectionFillHint,
  isTaskAssignedColumn,
  resolvePipColumnControl,
  resolvePipFieldControl,
} from "@/lib/appraisal/pipFormControls";
import {
  buildAppraisalEvidenceHref,
  detectPipSectionRole,
  findGapChainSections,
  findGapEvidenceColumn,
  gapLabelForId,
  getGapOptions,
  type PipSectionRole,
  isGapReferenceColumn,
  isSupportActionColumn,
  newGapId,
  parseAppraisalRef,
  PIP_APPRAISAL_REF_KEY,
  PIP_GAP_ID_KEY,
  prepareResponsesWithGapChain,
  removeGapRowWithChain,
  supportActionOptionsForColumn,
  syncGapChainTables,
  type PipAppraisalSummary,
} from "@/lib/appraisal/pipGapChain";
import {
  buildCoachingProgressRatingLookup,
  findReviewDateColumn,
  formatRatingDisplay,
  getGapBaselineRating,
  isBaselineRatingColumn,
  isReviewProgressRatingColumn,
  normalizePipSessionDate,
} from "@/lib/appraisal/pipProgressReview";
import {
  ensureFinalOutcomeRowForGap,
  getGapFieldValue,
  isFinalOutcomeTableRole,
  pipGapFieldKey,
} from "@/lib/appraisal/pipFinalOutcome";
import {
  applyPipExtensionSideEffects,
  ensurePipExtensionFieldsInSchema,
  isPipExtensionComputedField,
  syncAllPipExtensions,
} from "@/lib/appraisal/pipExtension";
import {
  ensureHrAdminFieldsInSchema,
  isHrAdminPrefilledField,
  pipHrAdminFieldRole,
  syncHrAdminPrefills,
} from "@/lib/appraisal/pipHrAdmin";
import {
  getFinalOutcomeGapOptions,
  getGapLinkedAppraisalDisplay,
  isGapFullyLocked,
  isGapTrackingEditingLocked,
} from "@/lib/appraisal/pipGapLock";
import { getGapEffectiveEndDate } from "@/lib/appraisal/pipExtension";
import {
  appendCompetencyAssessmentRow,
  appendFormalReviewRow,
  canAppendCoachingSessionRow,
  canAppendFormalReviewRow,
  filterRowsWithReachedScheduleDates,
  formatPipScheduleDateDisplay,
  isPipScheduleDateReached,
  readSupportPlanRow,
  resolveNextCoachingSessionDate,
  resolveNextFormalReviewDate,
  applySupportPlanDefaults,
  coachingLogTitleForGap,
  ensureReviewsSectionColumns,
  isCoachingSection,
  isPipPlanSubmitted,
  isPipStage1Editable,
  isPipStage2Editable,
  isPipStage3Editable,
  isStage1Section,
  isStage2Section,
  isStage3Section,
  normalizePipSchemaForStages,
  normalizePipTrackingResponses,
  PIP_PROVIDED_BY_OTHER,
  PIP_SUPPORT_COLUMN_KEYS,
} from "@/lib/appraisal/pipStages";
import PipCoachingLogSection from "./PipCoachingLogSection";
import PipTrackingAccordion from "./PipTrackingAccordion";
import PipAppraisalReferencePanel from "./PipAppraisalReferencePanel";
import {
  isPipSectionVisible,
  isSystemField,
  pipFieldLabel,
  resolvePipSectionAudience,
  type PipField,
  type PipFormSchema,
  type PipSection,
} from "@/lib/appraisal/pipFormSchema";
import { useAppraisalViewer } from "./useAppraisalViewer";
import PipPreviewModal from "./PipPreviewModal";
import { PipValueControl } from "./PipValueControl";

const BRAND = "#C62828";
const NAVY = "#1e3a5f";

function mergeResponsesPreservingHrSections(
  edited: PipFormResponses,
  original: PipFormResponses,
  schema: PipFormSchema,
  canViewHrSections: boolean,
): PipFormResponses {
  if (canViewHrSections) return edited;

  const merged: PipFormResponses = {
    fields: { ...(edited.fields ?? {}) },
    tables: { ...(edited.tables ?? {}) },
    meta: edited.meta ?? original.meta,
  };

  for (const section of schema.sections) {
    if (resolvePipSectionAudience(section) !== "hr") continue;
    if (section.kind === "fields") {
      for (const field of section.fields) {
        merged.fields![field.key] = original.fields?.[field.key] ?? null;
      }
    } else {
      merged.tables![section.key] = original.tables?.[section.key] ?? [];
    }
  }

  return merged;
}

function fieldGridClass(field: PipField): string {
  if (isSystemField(field)) return "";
  const spec = resolvePipFieldControl(field);
  if (spec.inputType === "textarea" || spec.inputType === "signature") {
    return "md:col-span-2";
  }
  return "";
}

function FieldInput({
  field,
  value,
  onChange,
  readOnly,
  hrFacilitators,
  canEditHrFacilitator,
  appraisalId,
  linkedAppraisalHref,
}: {
  field: PipField;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  hrFacilitators?: HrFacilitatorOption[];
  canEditHrFacilitator?: boolean;
  appraisalId?: string;
  linkedAppraisalHref?: string | null;
}) {
  const label = pipFieldLabel(field);
  const hrAdminRole = pipHrAdminFieldRole(field);
  const isHrFacilitator =
    isSystemField(field) && field.systemSource === "hr_facilitator";
  const spec = resolvePipFieldControl(field);
  const locked =
    (isSystemField(field) && !isHrFacilitator) ||
    readOnly ||
    isPipExtensionComputedField(field) ||
    isHrAdminPrefilledField(field) ||
    (isHrFacilitator && !canEditHrFacilitator);

  return (
    <div className={fieldGridClass(field)}>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {isHrFacilitator && canEditHrFacilitator && !readOnly ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">Select HR facilitator…</option>
          {(hrFacilitators ?? []).map((hr) => (
            <option key={hr.user_id} value={hr.name}>
              {hr.name}
            </option>
          ))}
        </select>
      ) : locked ? (
        <div className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
          <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
          {hrAdminRole === "linked_appraisal" && (linkedAppraisalHref || appraisalId) ? (
            <Link
              href={
                linkedAppraisalHref ??
                `/dashboard/humanCapital/appraisal/${appraisalId}`
              }
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700 break-words"
              target="_blank"
              rel="noopener noreferrer"
            >
              {value || "View linked appraisal"}
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </Link>
          ) : (
            <span className="text-sm text-gray-800 break-words">{value || "—"}</span>
          )}
        </div>
      ) : (
        <PipValueControl
          spec={spec}
          value={value}
          onChange={onChange}
          ariaLabel={label}
        />
      )}
      {!isSystemField(field) && "helpText" in field && field.helpText && (
        <p className="text-xs text-gray-400 mt-1">{field.helpText}</p>
      )}
      {!locked && (spec.inputType === "date" || spec.inputType === "select" || spec.inputType === "yesno") && (
        <p className="text-[11px] text-gray-400 mt-1">
          {spec.inputType === "date" ? "Pick a date from the calendar." : "Choose from the list."}
        </p>
      )}
    </div>
  );
}

function TableSectionEditor({
  section,
  rows,
  onChange,
  readOnly,
  sectionRole,
  gapOptions = [],
  allTables,
  gapsSection,
  appraisalId,
  taskAssignOptions = [],
  onRemoveRowAtIndex,
  supervisorName,
  trackingGapId,
  finalOutcomeGapId,
  coachingSection,
  supportSection,
  effectiveEndDate,
  canAddReviewRow,
  canAddCompetencyRow,
  canAddScheduledRows,
  nextScheduledDate,
  planStartDate,
  scheduleFrequency,
}: {
  section: Extract<PipSection, { kind: "table" }>;
  rows: Array<Record<string, string | number | null>>;
  onChange: (rows: Array<Record<string, string | number | null>>) => void;
  readOnly?: boolean;
  sectionRole?: PipSectionRole;
  gapOptions?: { id: string; label: string }[];
  allTables?: Record<string, Array<Record<string, string | number | null>>>;
  gapsSection?: Extract<PipSection, { kind: "table" }> | null;
  appraisalId?: string;
  taskAssignOptions?: string[];
  onRemoveRowAtIndex?: (rowIndex: number) => void;
  supervisorName?: string;
  trackingGapId?: string;
  finalOutcomeGapId?: string;
  coachingSection?: Extract<PipSection, { kind: "table" }> | null;
  supportSection?: Extract<PipSection, { kind: "table" }> | null;
  effectiveEndDate?: string;
  /** When false, hides Add review (schedule exhausted or locked). */
  canAddReviewRow?: boolean;
  /** When false, hides Add assessment (schedule exhausted or locked). */
  canAddCompetencyRow?: boolean;
  /** When false, hides generic Add row in tracking sections (e.g. employee comments). */
  canAddScheduledRows?: boolean;
  /** Next session/review date when not yet available — shown as a hint. */
  nextScheduledDate?: string | null;
  planStartDate?: string;
  scheduleFrequency?: string;
}) {
  const isReviews = sectionRole === "reviews";
  const isCompetency = sectionRole === "competency";
  const isFinalOutcomeTable = !!(sectionRole && isFinalOutcomeTableRole(sectionRole));
  const gapScopedTable = isReviews || isFinalOutcomeTable;
  const activeGapId = isReviews ? trackingGapId : finalOutcomeGapId;
  const normalizedReviewsSection =
    section.kind === "table" && isReviews ? ensureReviewsSectionColumns(section) : section;
  const displayColumns = isReviews ? normalizedReviewsSection.columns : section.columns;
  const reviewDateCol =
    isReviews && section.kind === "table"
      ? findReviewDateColumn(normalizedReviewsSection as Extract<PipSection, { kind: "table" }>)
      : undefined;
  const competencyDateCol =
    isCompetency && section.kind === "table"
      ? findReviewDateColumn(section as Extract<PipSection, { kind: "table" }>)
      : undefined;

  const rowsForDisplay = useMemo(() => {
    let display =
      gapScopedTable && activeGapId
        ? rows.filter((r) => String(r[PIP_GAP_ID_KEY] ?? "") === activeGapId)
        : rows;
    const scheduleDateKey =
      isReviews && reviewDateCol
        ? reviewDateCol.key
        : isCompetency && competencyDateCol
          ? competencyDateCol.key
          : undefined;
    if (scheduleDateKey) {
      display = filterRowsWithReachedScheduleDates(display, scheduleDateKey);
    }
    return display;
  }, [
    rows,
    gapScopedTable,
    activeGapId,
    isReviews,
    isCompetency,
    reviewDateCol,
    competencyDateCol,
  ]);

  const planNotStarted =
    (isReviews || isCompetency) &&
    !!planStartDate &&
    !isPipScheduleDateReached(planStartDate) &&
    rowsForDisplay.length === 0;
  const nextSchedulePending =
    !!nextScheduledDate && !isPipScheduleDateReached(nextScheduledDate);

  const emitRows = (next: Array<Record<string, string | number | null>>) => {
    onChange(applyTableRowAutoIncrement(section, next));
  };

  const resolveFullRowIndex = (displayIndex: number): number => {
    const target = rowsForDisplay[displayIndex];
    if (!target) return -1;
    return rows.indexOf(target);
  };

  const updateCell = (rowIndex: number, colKey: string, value: string) => {
    if (section.columns.some((c) => c.key === colKey && isAutoIncrementColumn(c))) {
      return;
    }
    const fullIndex = gapScopedTable ? resolveFullRowIndex(rowIndex) : rowIndex;
    if (fullIndex < 0) return;
    emitRows(
      rows.map((row, i) => (i === fullIndex ? { ...row, [colKey]: value } : row)),
    );
  };

  const displayRows = applyTableRowAutoIncrement(section, rowsForDisplay);
  const chainLocked =
    (sectionRole === "root_cause" || sectionRole === "support") && gapOptions.length > 0;
  const isSupport = sectionRole === "support";
  const isGapTable = !!(gapsSection && section.key === gapsSection.key);
  const gapEvidenceColKey =
    isGapTable && gapsSection ? findGapEvidenceColumn(gapsSection)?.key : undefined;

  const gapBaselineRating = useMemo(() => {
    if (!isReviews || !trackingGapId || !gapsSection || !allTables) return null;
    return getGapBaselineRating(trackingGapId, allTables, gapsSection);
  }, [isReviews, trackingGapId, gapsSection, allTables]);

  const coachingRatingsByDate = useMemo(() => {
    if (!isReviews || !trackingGapId || !coachingSection || !allTables) return null;
    return buildCoachingProgressRatingLookup(trackingGapId, allTables, coachingSection);
  }, [isReviews, trackingGapId, coachingSection, allTables]);

  const renderGapEvidenceCell = (row: Record<string, string | number | null>) => {
    const ref = parseAppraisalRef(row[PIP_APPRAISAL_REF_KEY]);
    const hrefAppraisalId = ref?.appraisalId ?? appraisalId;
    if (ref && hrefAppraisalId && ref.sectionKey !== "_narrative") {
      return (
        <Link
          href={buildAppraisalEvidenceHref(hrefAppraisalId, ref.sectionKey, ref.item)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
          target="_blank"
          rel="noopener noreferrer"
        >
          View in appraisal
          <ExternalLink className="w-3 h-3 shrink-0" />
        </Link>
      );
    }
    return <span className="text-sm text-gray-400">—</span>;
  };

  const renderCell = (
    col: (typeof section.columns)[number],
    row: Record<string, string | number | null>,
    rowIndex: number,
    compact?: boolean,
  ) => {
    const autoNumber = isAutoIncrementColumn(col);
    const spec = resolvePipColumnControl(col);
    const gapId = row[PIP_GAP_ID_KEY] ? String(row[PIP_GAP_ID_KEY]) : null;

    if (autoNumber) {
      return (
        <span
          className={`inline-flex items-center justify-center min-w-[2rem] px-2 py-1.5 rounded-md bg-gray-100 text-sm font-semibold text-gray-700 tabular-nums ${compact ? "" : ""}`}
        >
          {rowIndex + 1}
        </span>
      );
    }

    if (isGapReferenceColumn(col) && gapOptions.length > 0) {
      const label =
        gapId && gapsSection && allTables
          ? gapLabelForId(gapId, allTables, gapsSection)
          : String(row[col.key] ?? "");
      return (
        <span className="block text-sm text-gray-800 line-clamp-3">{label || "—"}</span>
      );
    }

    if (isGapTable && gapEvidenceColKey && col.key === gapEvidenceColKey) {
      return renderGapEvidenceCell(row);
    }

    if (isReviews && isBaselineRatingColumn(col)) {
      return (
        <span className="block text-sm font-semibold text-gray-800 tabular-nums">
          {formatRatingDisplay(gapBaselineRating)}
        </span>
      );
    }

    if (isReviews && isReviewProgressRatingColumn(col)) {
      const sessionDate = reviewDateCol ? String(row[reviewDateCol.key] ?? "") : "";
      const progress =
        coachingRatingsByDate?.get(normalizePipSessionDate(sessionDate)) ?? null;
      return (
        <span className="block text-sm font-semibold text-gray-800 tabular-nums">
          {formatRatingDisplay(progress)}
        </span>
      );
    }

    if (isReviews && reviewDateCol && col.key === reviewDateCol.key) {
      return (
        <span className="block text-sm text-gray-800 whitespace-nowrap">
          {String(row[col.key] ?? "") || "—"}
        </span>
      );
    }

    if (isCompetency && competencyDateCol && col.key === competencyDateCol.key) {
      return (
        <span className="block text-sm text-gray-800 whitespace-nowrap">
          {String(row[col.key] ?? "") || "—"}
        </span>
      );
    }

    if (isSupport && isSupportActionColumn(col) && !readOnly) {
      const options = supportActionOptionsForColumn(col);
      return (
        <select
          value={String(row[col.key] ?? "")}
          onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
          aria-label={col.label}
        >
          <option value="">Select support type…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (
      isSupport &&
      (col.key === PIP_SUPPORT_COLUMN_KEYS.providedBy ||
        (/provided by/.test(col.label.toLowerCase()) &&
          !/other|specify/.test(col.label.toLowerCase())))
    ) {
      const options = [
        ...new Set(
          [supervisorName?.trim(), PIP_PROVIDED_BY_OTHER].filter(Boolean) as string[],
        ),
      ];
      if (readOnly) {
        return (
          <span className="block text-sm text-gray-800">{String(row[col.key] ?? "") || "—"}</span>
        );
      }
      return (
        <select
          value={String(row[col.key] ?? "")}
          onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
          aria-label={col.label}
        >
          <option value="">Select provider…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (
      isSupport &&
      (col.key === PIP_SUPPORT_COLUMN_KEYS.providedByOther ||
        /provider name.*other|other.*provider|specify.*provider/.test(col.label.toLowerCase()))
    ) {
      const providedByCol = section.columns.find(
        (c) =>
          c.key === PIP_SUPPORT_COLUMN_KEYS.providedBy ||
          (/provided by/.test(c.label.toLowerCase()) &&
            !/other|specify/.test(c.label.toLowerCase())),
      );
      const providedByVal = providedByCol ? String(row[providedByCol.key] ?? "") : "";
      if (providedByVal !== PIP_PROVIDED_BY_OTHER) {
        return <span className="block text-sm text-gray-400">—</span>;
      }
    }

    if (isTaskAssignedColumn(col) && !readOnly) {
      const options = col.options?.length ? col.options : taskAssignOptions;
      if (options.length) {
        return (
          <select
            value={String(row[col.key] ?? "")}
            onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
            aria-label={col.label}
          >
            <option value="">Select task…</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );
      }
    }

    return (
      <PipValueControl
        spec={spec}
        value={String(row[col.key] ?? "")}
        onChange={(v) => updateCell(rowIndex, col.key, v)}
        readOnly={readOnly}
        compact={compact}
        ariaLabel={col.label}
      />
    );
  };

  const linkedGapChip = (row: Record<string, string | number | null>) => {
    const gapId = row[PIP_GAP_ID_KEY] ? String(row[PIP_GAP_ID_KEY]) : null;
    if (!isSupport || !gapId || !gapsSection || !allTables) return null;
    const label = gapLabelForId(gapId, allTables, gapsSection);
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-semibold mb-2">
        {label}
      </span>
    );
  };

  const rowReactKey = (
    row: Record<string, string | number | null>,
    displayIndex: number,
  ): string => {
    const fullIndex = gapScopedTable ? resolveFullRowIndex(displayIndex) : displayIndex;
    const gapId = row[PIP_GAP_ID_KEY] ? String(row[PIP_GAP_ID_KEY]) : "";
    const sessionDate =
      isReviews && reviewDateCol
        ? normalizePipSessionDate(String(row[reviewDateCol.key] ?? ""))
        : "";
    if (gapId && sessionDate) return `${gapId}:${sessionDate}`;
    if (gapId) return `${gapId}:${fullIndex >= 0 ? fullIndex : displayIndex}`;
    return `row-${fullIndex >= 0 ? fullIndex : displayIndex}`;
  };

  const addButtonVisible =
    !readOnly &&
    !chainLocked &&
    !isFinalOutcomeTable &&
    (isReviews
      ? (canAddReviewRow ?? true)
      : isCompetency
        ? (canAddCompetencyRow ?? true)
        : canAddScheduledRows !== undefined
          ? canAddScheduledRows
          : true);

  return (
    <div className="space-y-3">
      {planNotStarted && (
        <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
          {isReviews ? "Formal reviews" : "Practical assessments"} begin on{" "}
          <strong>{formatPipScheduleDateDisplay(planStartDate!)}</strong>. Rows will appear here
          on that date.
        </p>
      )}
      {!planNotStarted &&
        (isReviews || isCompetency) &&
        displayRows.length === 0 && (
          <p className="text-xs text-gray-500 italic">
            Nothing due yet — rows appear when their scheduled date arrives.
          </p>
        )}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[640px] text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {isSupport && gapOptions.length > 0 && (
                <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2.5 w-36">
                  Gap
                </th>
              )}
              {displayColumns.map((col) => (
                <th
                  key={col.key}
                  className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2.5"
                >
                  {col.label}
                </th>
              ))}
              {!readOnly && !chainLocked && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => {
              const gapId = row[PIP_GAP_ID_KEY] ? String(row[PIP_GAP_ID_KEY]) : null;
              const gapLabel =
                gapId && gapsSection && allTables
                  ? gapLabelForId(gapId, allTables, gapsSection)
                  : null;

              return (
                <tr
                  key={rowReactKey(row, rowIndex)}
                  className={rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50/60"}
                >
                  {isSupport && gapOptions.length > 0 && (
                    <td className="px-2 py-2 align-top border-b border-gray-100">
                      {gapLabel ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-800 text-[11px] font-medium line-clamp-2">
                          {gapLabel}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                  {displayColumns.map((col) => {
                    const autoNumber = isAutoIncrementColumn(col);
                    return (
                      <td
                        key={col.key}
                        className={`px-2 py-2 align-top border-b border-gray-100 ${autoNumber ? "w-16" : "min-w-[140px]"}`}
                      >
                        {renderCell(col, row, rowIndex, true)}
                      </td>
                    );
                  })}
                  {!readOnly && !chainLocked && (
                    <td className="px-1 py-2 align-top border-b border-gray-100">
                      <button
                        type="button"
                        onClick={() => {
                          const minForGap = isReviews ? rowsForDisplay.length : rows.length;
                          if (minForGap <= (section.minRows || 1)) return;
                          if (onRemoveRowAtIndex) onRemoveRowAtIndex(rowIndex);
                          else {
                            const fullIndex = gapScopedTable
                              ? resolveFullRowIndex(rowIndex)
                              : rowIndex;
                            if (fullIndex < 0) return;
                            emitRows(rows.filter((_, i) => i !== fullIndex));
                          }
                        }}
                        disabled={
                          (isReviews ? rowsForDisplay.length : rows.length) <=
                          (section.minRows || 1)
                        }
                        className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {displayRows.map((row, rowIndex) => (
          <div
            key={rowReactKey(row, rowIndex)}
            className="rounded-lg border border-gray-200 p-3 space-y-2 bg-white"
          >
            {linkedGapChip(row)}
            <p className="text-[11px] font-semibold text-gray-400">Row {rowIndex + 1}</p>
            {displayColumns.map((col) => (
              <div key={col.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{col.label}</label>
                {renderCell(col, row, rowIndex, true)}
              </div>
            ))}
          </div>
        ))}
      </div>

      {addButtonVisible && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (isReviews && supportSection && trackingGapId && allTables) {
                const supportRow = (allTables[supportSection.key] ?? []).find(
                  (r) => String(r[PIP_GAP_ID_KEY] ?? "") === trackingGapId,
                );
                if (!supportRow) {
                  toast.error("Could not find the support plan for this gap.");
                  return;
                }
                const { rows: next, added } = appendFormalReviewRow(
                  normalizedReviewsSection as Extract<PipSection, { kind: "table" }>,
                  supportSection,
                  supportRow,
                  rows,
                  effectiveEndDate,
                );
                if (!added) {
                  toast.error("No further review dates before the effective end date.");
                  return;
                }
                emitRows(next);
                return;
              }
              if (isCompetency && section.kind === "table") {
                emitRows(
                  appendCompetencyAssessmentRow(
                    section as Extract<PipSection, { kind: "table" }>,
                    rows,
                  ),
                );
                return;
              }
              emitRows([
                ...rows,
                {
                  ...Object.fromEntries(section.columns.map((col) => [col.key, ""])),
                  ...(sectionRole === "gaps" ? { [PIP_GAP_ID_KEY]: newGapId() } : {}),
                },
              ]);
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
          >
            <Plus className="w-3.5 h-3.5" />{" "}
            {isReviews ? "Add review" : isCompetency ? "Add assessment" : "Add row"}
          </button>
        </div>
      )}
      {!readOnly && !addButtonVisible && nextSchedulePending && (isReviews || isCompetency) && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          Next {isReviews ? "review" : "assessment"} available on{" "}
          <strong>{formatPipScheduleDateDisplay(nextScheduledDate!)}</strong>
          {scheduleFrequency ? ` (${scheduleFrequency.toLowerCase()} schedule)` : ""}.
        </p>
      )}
    </div>
  );
}

export default function PipInstanceForm({
  appraisalId,
  onBack,
}: {
  appraisalId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { viewer, displayName: viewerDisplayName } = useAppraisalViewer();
  const [responses, setResponses] = useState<PipFormResponses | null>(null);
  const [refreshGapsOpen, setRefreshGapsOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [stageTab, setStageTab] = useState<"plan" | "tracking" | "finalOutcome">("plan");
  const [trackingGapId, setTrackingGapId] = useState("");
  const [finalOutcomeGapId, setFinalOutcomeGapId] = useState("");
  const [trackingTabPending, startTrackingTabTransition] = useTransition();

  const { data, isLoading, error } = useQuery({
    queryKey: ["appraisal-pip", appraisalId],
    queryFn: async () => {
      const res = await api.get(`/appraisal/${appraisalId}/pip`);
      return res.data.data as {
        eligible: boolean;
        canManage: boolean;
        canViewHrSections?: boolean;
        templateConfigured: boolean;
        pip: AppraisalPip | null;
        systemFields: Record<string, string> | null;
        appraisalSummary?: PipAppraisalSummary | null;
        hrFacilitators?: HrFacilitatorOption[];
        placementPositionLabel?: string | null;
        competencyTaskOptions?: string[];
      };
    },
  });

  const canViewHrSections =
    data?.canViewHrSections ?? hasFullAppraisalAccess(viewer.role);

  const pip = data?.pip ?? null;
  const rawSchema = pip?.form_schema as PipFormSchema | undefined;
  const schema = useMemo(
    () =>
      rawSchema
        ? ensureHrAdminFieldsInSchema(
            ensurePipExtensionFieldsInSchema(normalizePipSchemaForStages(rawSchema)),
          )
        : undefined,
    [rawSchema],
  );
  const appraisalSummary = data?.appraisalSummary ?? null;
  const hasUnsavedChanges = responses != null;
  const supervisorName = data?.systemFields?.supervisor ?? "";

  const gapChain = useMemo(
    () => (schema ? findGapChainSections(schema) : { gaps: null, rootCause: null, support: null }),
    [schema],
  );

  const visibleSections = useMemo(() => {
    if (!schema?.sections) return [];
    return schema.sections.filter((section) =>
      isPipSectionVisible(section, canViewHrSections),
    );
  }, [schema?.sections, canViewHrSections]);

  const coachingSection = useMemo(
    () => visibleSections.find((s) => s.kind === "table" && isCoachingSection(s)) as
      | Extract<PipSection, { kind: "table" }>
      | undefined,
    [visibleSections],
  );

  const planSections = useMemo(
    () => visibleSections.filter(isStage1Section),
    [visibleSections],
  );

  const trackingSections = useMemo(
    () => visibleSections.filter((s) => isStage2Section(s) && !isCoachingSection(s)),
    [visibleSections],
  );

  const finalOutcomeSections = useMemo(
    () => visibleSections.filter(isStage3Section),
    [visibleSections],
  );

  const hiddenHrSectionCount = (schema?.sections?.length ?? 0) - visibleSections.length;

  const baseResponses = useMemo(() => {
    const source = responses ?? pip?.form_responses ?? { fields: {}, tables: {} };
    let raw: PipFormResponses = {
      fields: source.fields ?? {},
      tables: source.tables ?? {},
      meta: source.meta,
    };
    if (schema) {
      raw = prepareResponsesWithGapChain(raw, schema);
      if (supervisorName) {
        raw = applySupportPlanDefaults(schema, raw, supervisorName);
      }
      raw = syncHrAdminPrefills(schema, raw, {
        pip,
        appraisalSummary,
        appraisalId,
        actorName: viewerDisplayName || pip?.created_by_name,
      });
    }
    return raw;
  }, [
    responses,
    pip,
    pip?.form_responses,
    schema,
    supervisorName,
    appraisalSummary,
    viewerDisplayName,
  ]);

  const effectiveResponses = useMemo(() => {
    if (
      !schema ||
      !isPipPlanSubmitted(baseResponses, pip?.status) ||
      stageTab !== "tracking"
    ) {
      return baseResponses;
    }
    return normalizePipTrackingResponses(schema, baseResponses);
  }, [baseResponses, schema, pip?.status, stageTab]);

  const employeeName =
    String(effectiveResponses.fields?.employee_name ?? "") ||
    pip?.form_responses?.fields?.employee_name?.toString() ||
    "Employee";

  const setFieldValue = useCallback(
    (key: string, value: string) => {
      setResponses((prev) => {
        const base = prev ?? pip?.form_responses ?? { fields: {}, tables: {} };
        return { ...base, fields: { ...(base.fields ?? {}), [key]: value } };
      });
    },
    [pip?.form_responses],
  );

  const setGapFieldValue = useCallback(
    (fieldKey: string, value: string, gapId: string) => {
      setResponses((prev) => {
        const base = prev ?? pip?.form_responses ?? { fields: {}, tables: {} };
        const storageKey = gapId.trim() ? pipGapFieldKey(fieldKey, gapId) : fieldKey;
        let fields = { ...(base.fields ?? {}), [storageKey]: value };

        if (schema && gapChain.support && gapId.trim()) {
          fields = applyPipExtensionSideEffects({
            schema,
            fields,
            gapId,
            tables: base.tables ?? {},
            supportSection: gapChain.support,
          });
        }

        return { ...base, fields };
      });
    },
    [pip?.form_responses, schema, gapChain.support],
  );

  const setTableRows = useCallback(
    (key: string, rows: Array<Record<string, string | number | null>>) => {
      setResponses((prev) => {
        const base = prev ?? pip?.form_responses ?? { fields: {}, tables: {} };
        let tables = { ...(base.tables ?? {}), [key]: rows };
        if (schema && gapChain.gaps?.key === key) {
          tables = syncGapChainTables(tables, gapChain);
        }
        return { ...base, tables };
      });
    },
    [pip?.form_responses, schema, gapChain],
  );

  const removeGapRow = useCallback(
    (rowIndex: number) => {
      if (!gapChain.gaps || !schema) return;
      setResponses((prev) => {
        const base = prev ?? pip?.form_responses ?? { fields: {}, tables: {} };
        const tables = removeGapRowWithChain(
          base.tables ?? {},
          gapChain,
          gapChain.gaps!,
          rowIndex,
        );
        return { ...base, tables };
      });
    },
    [gapChain, pip?.form_responses, schema],
  );

  const gapOptions = useMemo(() => {
    if (!gapChain.gaps) return [];
    return getGapOptions(effectiveResponses.tables ?? {}, gapChain.gaps);
  }, [effectiveResponses.tables, gapChain.gaps]);

  const effectiveTrackingGapId =
    trackingGapId ||
    effectiveResponses.meta?.selected_coaching_gap_id?.trim() ||
    gapOptions[0]?.id ||
    "";

  useEffect(() => {
    const fromMeta = effectiveResponses.meta?.selected_coaching_gap_id?.trim();
    if (fromMeta && fromMeta !== trackingGapId) {
      setTrackingGapId(fromMeta);
    } else if (!trackingGapId && gapOptions[0]?.id) {
      setTrackingGapId(gapOptions[0].id);
    }
  }, [effectiveResponses.meta?.selected_coaching_gap_id, gapOptions, trackingGapId]);

  const trackingGapLabel = useMemo(() => {
    if (!effectiveTrackingGapId || !gapChain.gaps) return "";
    return gapLabelForId(
      effectiveTrackingGapId,
      effectiveResponses.tables ?? {},
      gapChain.gaps,
    );
  }, [effectiveTrackingGapId, gapChain.gaps, effectiveResponses.tables]);

  const dynamicCoachingLogTitle = useMemo(() => {
    if (!gapChain.support) return coachingSection?.title ?? "Session log";
    return coachingLogTitleForGap(
      gapChain.support,
      effectiveResponses.tables ?? {},
      effectiveTrackingGapId,
      coachingSection?.title ?? "Session log",
    );
  }, [
    gapChain.support,
    effectiveResponses.tables,
    effectiveTrackingGapId,
    coachingSection?.title,
  ]);

  const setTrackingGap = useCallback(
    (gapId: string) => {
      setTrackingGapId(gapId);
      setResponses((prev) => {
        const base = prev ?? pip?.form_responses ?? { fields: {}, tables: {} };
        return {
          ...base,
          meta: { ...(base.meta ?? {}), selected_coaching_gap_id: gapId },
        };
      });
    },
    [pip?.form_responses],
  );

  const finalOutcomeGapOptions = useMemo(() => {
    if (!schema) return [];
    return getFinalOutcomeGapOptions(schema, baseResponses);
  }, [schema, baseResponses]);

  const trackingGapLocked = useMemo(() => {
    if (!schema || !effectiveTrackingGapId) return false;
    return isGapTrackingEditingLocked(effectiveTrackingGapId, schema, baseResponses);
  }, [schema, effectiveTrackingGapId, baseResponses]);

  const trackingEffectiveEndDate = useMemo(() => {
    if (!schema || !effectiveTrackingGapId) return "";
    return getGapEffectiveEndDate(effectiveTrackingGapId, schema, baseResponses);
  }, [schema, effectiveTrackingGapId, baseResponses]);

  const trackingSupportRow = useMemo(() => {
    if (!gapChain.support || !effectiveTrackingGapId) return null;
    return (baseResponses.tables?.[gapChain.support.key] ?? []).find(
      (r) => String(r[PIP_GAP_ID_KEY] ?? "") === effectiveTrackingGapId,
    );
  }, [gapChain.support, effectiveTrackingGapId, baseResponses.tables]);

  const canAddCoachingSession = useMemo(() => {
    if (!coachingSection || !gapChain.support || !trackingSupportRow) return false;
    return canAppendCoachingSessionRow(
      coachingSection,
      gapChain.support,
      trackingSupportRow,
      baseResponses.tables?.[coachingSection.key] ?? [],
      trackingEffectiveEndDate,
    );
  }, [
    coachingSection,
    gapChain.support,
    trackingSupportRow,
    baseResponses.tables,
    trackingEffectiveEndDate,
  ]);

  const canAddFormalReview = useMemo(() => {
    const reviewsSection = schema?.sections.find(
      (s) => s.kind === "table" && detectPipSectionRole(s) === "reviews",
    );
    if (!reviewsSection || reviewsSection.kind !== "table" || !gapChain.support || !trackingSupportRow) {
      return false;
    }
    return canAppendFormalReviewRow(
      reviewsSection,
      gapChain.support,
      trackingSupportRow,
      baseResponses.tables?.[reviewsSection.key] ?? [],
      trackingEffectiveEndDate,
    );
  }, [schema, gapChain.support, trackingSupportRow, baseResponses.tables, trackingEffectiveEndDate]);

  const trackingPlanSchedule = useMemo(() => {
    if (!trackingSupportRow || !gapChain.support) return null;
    return readSupportPlanRow(trackingSupportRow, gapChain.support);
  }, [trackingSupportRow, gapChain.support]);

  const nextCoachingSessionDate = useMemo(() => {
    if (!coachingSection || !gapChain.support || !trackingSupportRow) return null;
    return resolveNextCoachingSessionDate(
      coachingSection,
      gapChain.support,
      trackingSupportRow,
      baseResponses.tables?.[coachingSection.key] ?? [],
      trackingEffectiveEndDate,
    );
  }, [
    coachingSection,
    gapChain.support,
    trackingSupportRow,
    baseResponses.tables,
    trackingEffectiveEndDate,
  ]);

  const nextFormalReviewDate = useMemo(() => {
    const reviewsSection = schema?.sections.find(
      (s) => s.kind === "table" && detectPipSectionRole(s) === "reviews",
    );
    if (!reviewsSection || reviewsSection.kind !== "table" || !gapChain.support || !trackingSupportRow) {
      return null;
    }
    return resolveNextFormalReviewDate(
      reviewsSection,
      gapChain.support,
      trackingSupportRow,
      baseResponses.tables?.[reviewsSection.key] ?? [],
      trackingEffectiveEndDate,
    );
  }, [schema, gapChain.support, trackingSupportRow, baseResponses.tables, trackingEffectiveEndDate]);

  const effectiveFinalOutcomeGapId = useMemo(() => {
    const preferred =
      finalOutcomeGapId ||
      effectiveResponses.meta?.selected_final_outcome_gap_id?.trim() ||
      "";
    if (preferred && finalOutcomeGapOptions.some((g) => g.id === preferred)) {
      return preferred;
    }
    return finalOutcomeGapOptions[0]?.id ?? "";
  }, [
    finalOutcomeGapId,
    effectiveResponses.meta?.selected_final_outcome_gap_id,
    finalOutcomeGapOptions,
  ]);

  useEffect(() => {
    const fromMeta = effectiveResponses.meta?.selected_final_outcome_gap_id?.trim();
    const metaInList = fromMeta && finalOutcomeGapOptions.some((g) => g.id === fromMeta);
    if (metaInList && fromMeta !== finalOutcomeGapId) {
      setFinalOutcomeGapId(fromMeta);
    } else if (
      finalOutcomeGapId &&
      !finalOutcomeGapOptions.some((g) => g.id === finalOutcomeGapId)
    ) {
      setFinalOutcomeGapId(finalOutcomeGapOptions[0]?.id ?? "");
    } else if (!finalOutcomeGapId && finalOutcomeGapOptions[0]?.id) {
      setFinalOutcomeGapId(finalOutcomeGapOptions[0].id);
    }
  }, [
    effectiveResponses.meta?.selected_final_outcome_gap_id,
    finalOutcomeGapOptions,
    finalOutcomeGapId,
  ]);

  const finalOutcomeGapLabel = useMemo(() => {
    if (!effectiveFinalOutcomeGapId || !gapChain.gaps) return "";
    return gapLabelForId(
      effectiveFinalOutcomeGapId,
      effectiveResponses.tables ?? {},
      gapChain.gaps,
    );
  }, [effectiveFinalOutcomeGapId, gapChain.gaps, effectiveResponses.tables]);

  const finalOutcomeGapLocked = useMemo(() => {
    if (!schema || !effectiveFinalOutcomeGapId) return false;
    return isGapFullyLocked(effectiveFinalOutcomeGapId, schema, baseResponses);
  }, [schema, effectiveFinalOutcomeGapId, baseResponses]);

  const finalOutcomeLinkedAppraisal = useMemo(() => {
    if (!schema || !effectiveFinalOutcomeGapId) return { label: "", href: null as string | null };
    const periodLabel = appraisalSummary
      ? appraisalSummary.review_quarter === "Q4"
        ? `Annual ${appraisalSummary.review_year}`
        : `${appraisalSummary.review_quarter} ${appraisalSummary.review_year}`
      : undefined;
    return getGapLinkedAppraisalDisplay({
      gapId: effectiveFinalOutcomeGapId,
      schema,
      responses: baseResponses,
      appraisalId,
      appraisalPeriodLabel: periodLabel,
    });
  }, [schema, effectiveFinalOutcomeGapId, baseResponses, appraisalId, appraisalSummary]);

  const setFinalOutcomeGap = useCallback(
    (gapId: string) => {
      setFinalOutcomeGapId(gapId);
      setResponses((prev) => {
        const base = prev ?? pip?.form_responses ?? { fields: {}, tables: {} };
        return {
          ...base,
          meta: { ...(base.meta ?? {}), selected_final_outcome_gap_id: gapId },
        };
      });
    },
    [pip?.form_responses],
  );

  const finalOutcomeResponses = useMemo(() => {
    let result = effectiveResponses;

    if (schema && gapChain.support) {
      result = syncAllPipExtensions(schema, result, gapChain.support);
    }

    if (stageTab !== "finalOutcome" || !effectiveFinalOutcomeGapId) {
      return result;
    }

    const tables = { ...(result.tables ?? {}) };
    for (const section of finalOutcomeSections) {
      if (section.kind !== "table") continue;
      if (!isFinalOutcomeTableRole(detectPipSectionRole(section))) continue;
      tables[section.key] = ensureFinalOutcomeRowForGap(
        section,
        tables[section.key] ?? [],
        effectiveFinalOutcomeGapId,
      );
    }
    return { ...result, tables };
  }, [
    stageTab,
    effectiveResponses,
    finalOutcomeSections,
    effectiveFinalOutcomeGapId,
    schema,
    gapChain.support,
  ]);

  const taskAssignOptions = data?.competencyTaskOptions ?? [];

  const buildSavePayload = useCallback((): PipFormResponses => {
    let payload = schema
      ? mergeResponsesPreservingHrSections(
          effectiveResponses,
          pip?.form_responses ?? { fields: {}, tables: {} },
          schema,
          canViewHrSections,
        )
      : effectiveResponses;

    if (schema) {
      payload = prepareResponsesWithGapChain(payload, schema);
      if (gapChain.support) {
        payload = syncAllPipExtensions(schema, payload, gapChain.support);
      }
      payload = syncHrAdminPrefills(schema, payload, {
        pip,
        appraisalSummary,
        appraisalId,
        actorName: viewerDisplayName || pip?.created_by_name,
      });
      if (!canViewHrSections) {
        for (const section of schema.sections) {
          if (section.kind !== "fields") continue;
          for (const field of section.fields) {
            if (isSystemField(field) && field.systemSource === "hr_facilitator") {
              payload.fields = payload.fields ?? {};
              payload.fields[field.key] =
                pip?.form_responses?.fields?.[field.key] ?? null;
            }
          }
        }
      }
      const tables = { ...(payload.tables ?? {}) };
      if (effectiveFinalOutcomeGapId) {
        for (const section of schema.sections) {
          if (section.kind !== "table") continue;
          if (!isFinalOutcomeTableRole(detectPipSectionRole(section))) continue;
          tables[section.key] = ensureFinalOutcomeRowForGap(
            section,
            tables[section.key] ?? [],
            effectiveFinalOutcomeGapId,
          );
        }
      }
      for (const section of schema.sections) {
        if (section.kind === "table" && tables[section.key]) {
          tables[section.key] = applyTableRowAutoIncrement(section, tables[section.key]!);
        }
      }
      payload = { ...payload, tables };
    }
    return payload;
  }, [
    effectiveResponses,
    effectiveFinalOutcomeGapId,
    gapChain.support,
    pip,
    appraisalSummary,
    viewerDisplayName,
    pip?.form_responses,
    schema,
    canViewHrSections,
  ]);

  const { mutate: savePip, isPending: saving } = useMutation({
    mutationFn: async () => {
      const res = await api.patch(`/appraisal/${appraisalId}/pip`, {
        form_responses: buildSavePayload(),
      });
      return res.data.data as AppraisalPip;
    },
    onSuccess: (updated) => {
      toast.success("PIP saved.");
      setResponses(null);
      queryClient.setQueryData(["appraisal-pip", appraisalId], (prev: typeof data) =>
        prev ? { ...prev, pip: updated } : prev,
      );
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not save the PIP.";
      toast.error(message);
    },
  });

  const { mutate: submitPlan, isPending: submitting } = useMutation({
    mutationFn: async () => {
      const res = await api.patch(`/appraisal/${appraisalId}/pip`, {
        form_responses: buildSavePayload(),
        submit_plan: true,
      });
      return res.data.data as AppraisalPip;
    },
    onSuccess: (updated) => {
      setSubmitOpen(false);
      setResponses(null);
      setStageTab("tracking");
      queryClient.setQueryData(["appraisal-pip", appraisalId], (prev: typeof data) =>
        prev ? { ...prev, pip: updated } : prev,
      );
      toast.success("Improvement plan submitted — coaching sessions are ready in Tracking.");
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not submit the improvement plan.";
      toast.error(message);
    },
  });

  const { mutate: refreshGaps, isPending: refreshingGaps } = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/appraisal/${appraisalId}/pip/refresh-gaps`);
      return res.data.data as {
        pip: AppraisalPip;
        gapCount: number;
        appraisalSummary?: PipAppraisalSummary | null;
      };
    },
    onSuccess: ({ pip: updated, gapCount, appraisalSummary: summary }) => {
      setRefreshGapsOpen(false);
      setResponses(null);
      queryClient.setQueryData(["appraisal-pip", appraisalId], (prev: typeof data) =>
        prev
          ? {
              ...prev,
              pip: updated,
              ...(summary ? { appraisalSummary: summary } : {}),
            }
          : prev,
      );
      toast.success(
        gapCount > 0
          ? `Performance gaps refreshed — ${gapCount} row${gapCount === 1 ? "" : "s"} from the appraisal.`
          : "Performance gaps refreshed — no supervisor ratings below 4/5 were found.",
      );
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not refresh performance gaps.";
      toast.error(message);
    },
  });

  const { mutate: startPip, isPending: starting } = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/appraisal/${appraisalId}/pip`);
      return res.data.data as { pip: AppraisalPip };
    },
    onSuccess: ({ pip: created }) => {
      toast.success("PIP started.");
      queryClient.setQueryData(["appraisal-pip", appraisalId], (prev: typeof data) =>
        prev ? { ...prev, pip: created, templateConfigured: true } : prev,
      );
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not start the PIP.";
      toast.error(message);
    },
  });

  if (isLoading) {
    return <PipFormSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <p className="text-sm font-semibold text-gray-700">Could not load PIP</p>
        <button type="button" onClick={onBack} className="mt-4 text-xs font-semibold text-red-600">
          Back to appraisal
        </button>
      </div>
    );
  }

  if (!data.eligible) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <p className="text-sm font-semibold text-gray-700">PIP not available</p>
        <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
          A PIP can only be started after final review when the score is below 70%.
        </p>
        <button type="button" onClick={onBack} className="mt-4 text-xs font-semibold text-red-600">
          Back to appraisal
        </button>
      </div>
    );
  }

  if (!pip) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-lg">
        <ClipboardList className="w-8 h-8 text-orange-500 mb-3" />
        <h1 className="text-lg font-bold text-gray-900">Start Performance Improvement Plan</h1>
        <p className="text-sm text-gray-600 mt-2">
          Employee details and performance gaps from the appraisal will be filled in automatically.
        </p>
        {!data.templateConfigured && data.placementPositionLabel && (
          <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            No PIP form is published yet for <strong>{data.placementPositionLabel}</strong> at this
            employee&apos;s org placement. HR must configure one under Manage appraisals → PIP form
            setup.
          </p>
        )}
        {data.canManage ? (
          <button
            type="button"
            onClick={() => startPip()}
            disabled={starting || !data.templateConfigured}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Start PIP
          </button>
        ) : (
          <p className="mt-4 text-xs text-gray-500">Only the supervisor or HR can start a PIP.</p>
        )}
      </div>
    );
  }

  const pipStatus = pip.status ?? "draft";
  const planSubmitted = isPipPlanSubmitted(baseResponses, pipStatus);
  const stage1Editable =
    data.canManage && isPipStage1Editable(pipStatus, effectiveResponses);
  const stage2Editable =
    data.canManage && isPipStage2Editable(pipStatus, effectiveResponses);
  const stage3Editable =
    data.canManage && isPipStage3Editable(pipStatus, effectiveResponses);
  const canSave = stage1Editable || stage2Editable || stage3Editable;
  const statusLabel =
    pipStatus === "active" ? "Active" : pipStatus === "completed" ? "Completed" : "Draft";
  const canSubmitPlan = stage1Editable;
  const sectionReadOnly =
    stageTab === "plan"
      ? !stage1Editable
      : stageTab === "tracking"
        ? !stage2Editable
        : !stage3Editable;

  const renderSectionBody = (
    section: PipSection,
    readOnly: boolean,
    options?: { finalOutcomeGapId?: string; responses?: PipFormResponses },
  ) => {
    const sectionRole = detectPipSectionRole(section);
    const sectionResponses = options?.responses ?? effectiveResponses;
    const outcomeGapId = options?.finalOutcomeGapId ?? "";

    return (
      <>
        {(pipSectionFillHint(section) || section.helpText) && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 text-xs text-amber-900 leading-relaxed">
            {pipSectionFillHint(section) ?? section.helpText}
          </div>
        )}

        {section.kind === "fields" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            {section.fields.map((field) => (
              <div key={field.key} className={fieldGridClass(field) || undefined}>
                <FieldInput
                  field={field}
                  value={
                    outcomeGapId
                      ? getGapFieldValue(sectionResponses.fields, field.key, outcomeGapId)
                      : String(sectionResponses.fields?.[field.key] ?? "")
                  }
                  onChange={(v) =>
                    outcomeGapId
                      ? setGapFieldValue(field.key, v, outcomeGapId)
                      : setFieldValue(field.key, v)
                  }
                  readOnly={readOnly}
                  hrFacilitators={data?.hrFacilitators}
                  canEditHrFacilitator={canViewHrSections && stage1Editable}
                  appraisalId={appraisalId}
                  linkedAppraisalHref={
                    outcomeGapId ? finalOutcomeLinkedAppraisal.href : undefined
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <TableSectionEditor
            section={section}
            sectionRole={sectionRole}
            gapOptions={gapChain.gaps ? gapOptions : []}
            allTables={effectiveResponses.tables ?? {}}
            gapsSection={gapChain.gaps}
            appraisalId={appraisalId}
            taskAssignOptions={taskAssignOptions}
            supervisorName={supervisorName}
            trackingGapId={
              sectionRole === "reviews" ? effectiveTrackingGapId : undefined
            }
            finalOutcomeGapId={
              isFinalOutcomeTableRole(sectionRole) ? outcomeGapId : undefined
            }
            coachingSection={
              sectionRole === "reviews" ? coachingSection : undefined
            }
            supportSection={
              sectionRole === "reviews" ? gapChain.support ?? undefined : undefined
            }
            effectiveEndDate={
              sectionRole === "reviews" ? trackingEffectiveEndDate : undefined
            }
            canAddReviewRow={
              sectionRole === "reviews" ? canAddFormalReview : undefined
            }
            canAddCompetencyRow={
              sectionRole === "competency" ? canAddCoachingSession : undefined
            }
            canAddScheduledRows={
              stageTab === "tracking" &&
              sectionRole !== "reviews" &&
              sectionRole !== "competency"
                ? canAddCoachingSession
                : undefined
            }
            nextScheduledDate={
              sectionRole === "reviews"
                ? nextFormalReviewDate
                : sectionRole === "competency"
                  ? nextCoachingSessionDate
                  : undefined
            }
            planStartDate={trackingPlanSchedule?.startDate}
            scheduleFrequency={trackingPlanSchedule?.frequency}
            rows={applyTableRowAutoIncrement(
              section,
              sectionResponses.tables?.[section.key] ??
                Array.from({ length: section.minRows || 1 }, () =>
                  Object.fromEntries(section.columns.map((col) => [col.key, ""])),
                ),
            )}
            onChange={(rows) => setTableRows(section.key, rows)}
            onRemoveRowAtIndex={
              sectionRole === "gaps" && stage1Editable ? removeGapRow : undefined
            }
            readOnly={readOnly}
          />
        )}
      </>
    );
  };

  const renderPlanSection = (section: PipSection, index: number) => {
    const audience = resolvePipSectionAudience(section);
    const sectionRole = detectPipSectionRole(section);

    return (
      <div
        key={section.key}
        className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm"
      >
        <div
          className="px-4 py-3 flex flex-wrap items-center justify-between gap-2"
          style={{ backgroundColor: NAVY }}
        >
          <h2 className="text-sm font-semibold text-white">
            {index + 1}. {section.title}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {sectionRole === "gaps" &&
              canViewHrSections &&
              stage1Editable &&
              gapChain.gaps && (
                <button
                  type="button"
                  onClick={() => setRefreshGapsOpen(true)}
                  disabled={refreshingGaps}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/15 text-white hover:bg-white/25 disabled:opacity-50"
                >
                  {refreshingGaps ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  Refresh from appraisal
                </button>
              )}
            {audience === "hr" && canViewHrSections && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-100">
                HR only
              </span>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {renderSectionBody(section, sectionReadOnly)}
        </div>
      </div>
    );
  };

  return (
    <div className="pb-28">
      {/* Document header */}
      <div
        className="rounded-2xl p-5 sm:p-6 text-white mb-5"
        style={{ backgroundColor: NAVY }}
      >
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white mb-3"
        >
          <ChevronLeft className="w-4 h-4" /> Back to appraisal
        </button>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-1">
              Performance Improvement Plan
            </p>
            <h1 className="text-xl sm:text-2xl font-bold">{schema?.title ?? "PIP"}</h1>
            <p className="text-white/70 text-sm mt-1 flex items-center gap-1.5">
              <User className="w-4 h-4 shrink-0" />
              {employeeName}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-white/90">
            {statusLabel}
          </span>
        </div>
      </div>

      {appraisalSummary && (
        <PipAppraisalReferencePanel summary={appraisalSummary} appraisalId={appraisalId} />
      )}

      {schema?.intro && (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 leading-relaxed whitespace-pre-wrap">
          {schema.intro}
        </div>
      )}

      {stage1Editable ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">Stage 1 — Improvement plan</p>
          <ul className="mt-1.5 text-xs text-emerald-800 space-y-1 list-disc list-inside">
            <li>Complete performance gaps, root causes, and support for each gap.</li>
            <li>Set objectives, dates, and coaching frequency in the support table.</li>
            <li>Save drafts anytime, then submit the plan to unlock coaching logs.</li>
          </ul>
        </div>
      ) : planSubmitted && stage2Editable && stageTab === "tracking" ? (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold">Stage 2 — Tracking</p>
          <p className="mt-1 text-xs text-blue-800">
            The improvement plan is locked. Use the Tracking tab to record coaching sessions and
            complete remaining sections.
          </p>
        </div>
      ) : planSubmitted && stage3Editable && stageTab === "finalOutcome" ? (
        <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <p className="font-semibold">Stage 3 — Final outcome</p>
          <p className="mt-1 text-xs text-violet-800">
            Complete the final outcome, acknowledgements, and HR sections for each gap once
            tracking is finished.
          </p>
        </div>
      ) : planSubmitted && stage2Editable ? (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold">Stage 2 — Tracking</p>
          <p className="mt-1 text-xs text-blue-800">
            The improvement plan is locked. Use the Tracking tab to record coaching sessions and
            complete remaining sections.
          </p>
        </div>
      ) : (
        <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <p className="font-semibold">Read-only</p>
          <p className="mt-1 text-xs text-gray-500">
            This PIP can no longer be changed. Use Preview to review the full document.
          </p>
        </div>
      )}

      <div className="mb-5 flex rounded-xl border border-gray-200 bg-white p-1 gap-1">
        <button
          type="button"
          onClick={() => setStageTab("plan")}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            stageTab === "plan"
              ? "bg-[#1e3a5f] text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Plan
          {planSubmitted && (
            <span className="ml-1.5 text-[10px] font-normal opacity-80">(locked)</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => startTrackingTabTransition(() => setStageTab("tracking"))}
          disabled={(!planSubmitted && pipStatus !== "completed") || trackingTabPending}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            stageTab === "tracking"
              ? "bg-[#1e3a5f] text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          {trackingTabPending ? "Loading…" : "Tracking"}
        </button>
        <button
          type="button"
          onClick={() => setStageTab("finalOutcome")}
          disabled={!planSubmitted && pipStatus !== "completed"}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            stageTab === "finalOutcome"
              ? "bg-[#1e3a5f] text-white"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Final outcome
        </button>
      </div>

      {stageTab === "tracking" && !planSubmitted && pipStatus !== "completed" && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Submit the improvement plan in the Plan tab before recording coaching sessions.
        </div>
      )}

      {/* Role / visibility notice */}
      <div className="mb-5 rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-start gap-3 text-sm">
        {canViewHrSections ? (
          <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        ) : (
          <EyeOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        )}
        <div>
          <p className="font-semibold text-gray-800">
            {canViewHrSections ? "HR view — all sections visible" : "Supervisor view"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {!canSave
              ? "This PIP is read-only — no further edits are allowed."
              : canViewHrSections
                ? "You can see and edit every section, including HR-use-only fields."
                : hiddenHrSectionCount > 0
                  ? `${hiddenHrSectionCount} HR-only section${hiddenHrSectionCount > 1 ? "s are" : " is"} hidden from this view. HR will complete those separately.`
                  : stageTab === "plan"
                    ? "Complete the improvement plan, then submit to unlock coaching logs."
                    : stageTab === "tracking"
                      ? "Record coaching sessions and complete the remaining tracking sections."
                      : "Record final outcomes for gaps once tracking is complete."}
          </p>
        </div>
      </div>

      {!data.canManage && (
        <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-2 text-xs text-gray-600">
          <Eye className="w-4 h-4 shrink-0" />
          Read-only — you can view this PIP but cannot edit it.
        </div>
      )}

      <div className="space-y-5">
        {stageTab === "plan" && planSections.map((section, index) => renderPlanSection(section, index))}

        {stageTab === "tracking" && trackingTabPending && (
          <ListRowsSkeleton rows={4} />
        )}

        {stageTab === "tracking" && !trackingTabPending && planSubmitted && gapOptions.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Select gap
            </label>
            <select
              className="w-full max-w-md border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              value={effectiveTrackingGapId}
              disabled={!stage2Editable && gapOptions.length <= 1}
              onChange={(e) => setTrackingGap(e.target.value)}
            >
              {gapOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-2">
              Tracking sections below apply while this gap is selected.
              {trackingGapLocked && (
                <span className="block mt-1 text-violet-700 font-medium">
                  This gap&apos;s tracking is locked — view only. Add an extension on Final outcome
                  to record more sessions, or complete signatures there to close the gap.
                </span>
              )}
            </p>
          </div>
        )}

        {stageTab === "tracking" &&
          !trackingTabPending &&
          planSubmitted &&
          coachingSection &&
          gapChain.support &&
          gapChain.gaps && (
            <PipTrackingAccordion
              title={dynamicCoachingLogTitle}
              subtitle={trackingGapLabel}
              defaultOpen
            >
              <PipCoachingLogSection
                coachingSection={coachingSection}
                supportSection={gapChain.support}
                gapsSection={gapChain.gaps}
                responses={effectiveResponses}
                onChange={(next) => setResponses(next)}
                readOnly={!stage2Editable || trackingGapLocked}
                selectedGapId={effectiveTrackingGapId}
                effectiveEndDate={trackingEffectiveEndDate}
                canAddSession={canAddCoachingSession}
              />
            </PipTrackingAccordion>
          )}

        {stageTab === "tracking" &&
          !trackingTabPending &&
          planSubmitted &&
          trackingSections.map((section, index) => {
            const audience = resolvePipSectionAudience(section);
            return (
              <PipTrackingAccordion
                key={section.key}
                title={`${index + 2}. ${section.title}`}
                subtitle={audience === "hr" && canViewHrSections ? "HR only" : undefined}
              >
                {renderSectionBody(section, sectionReadOnly || trackingGapLocked)}
              </PipTrackingAccordion>
            );
          })}

        {stageTab === "finalOutcome" && !planSubmitted && pipStatus !== "completed" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Submit the improvement plan before recording final outcomes.
          </div>
        )}

        {stageTab === "finalOutcome" &&
          planSubmitted &&
          finalOutcomeGapOptions.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No gaps have completed tracking yet. Fill in the coaching log and formal progress
              review for each gap&apos;s effective end date in the Tracking tab first.
            </div>
          )}

        {stageTab === "finalOutcome" &&
          planSubmitted &&
          finalOutcomeGapOptions.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Select gap (tracking complete)
              </label>
              <select
                className="w-full max-w-md border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={effectiveFinalOutcomeGapId}
                disabled={!stage3Editable && finalOutcomeGapOptions.length <= 1}
                onChange={(e) => setFinalOutcomeGap(e.target.value)}
              >
                {finalOutcomeGapOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                    {schema &&
                    isGapFullyLocked(g.id, schema, baseResponses)
                      ? " (locked)"
                      : ""}
                  </option>
                ))}
              </select>
              {finalOutcomeGapLabel && (
                <p className="text-xs text-gray-500 mt-2">
                  Final outcome sections below apply to <strong>{finalOutcomeGapLabel}</strong>.
                  {finalOutcomeGapLocked && (
                    <span className="block mt-1 text-violet-700 font-medium">
                      This gap is locked — signed with no extension. View only.
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

        {stageTab === "finalOutcome" &&
          planSubmitted &&
          finalOutcomeGapOptions.length > 0 &&
          effectiveFinalOutcomeGapId &&
          finalOutcomeSections.map((section, index) => {
            const audience = resolvePipSectionAudience(section);
            return (
              <div
                key={section.key}
                className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm"
              >
                <div
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-2"
                  style={{ backgroundColor: NAVY }}
                >
                  <h2 className="text-sm font-semibold text-white">
                    {index + 1}. {section.title}
                  </h2>
                  {audience === "hr" && canViewHrSections && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-100">
                      HR only
                    </span>
                  )}
                </div>
                <div className="p-4 sm:p-5 space-y-4">
                  {renderSectionBody(section, sectionReadOnly || finalOutcomeGapLocked, {
                    finalOutcomeGapId: effectiveFinalOutcomeGapId,
                    responses: finalOutcomeResponses,
                  })}
                </div>
              </div>
            );
          })}
      </div>

      <ConfirmDialog
        open={refreshGapsOpen}
        title="Refresh performance gaps?"
        message="This replaces performance gaps and rebuilds linked root-cause and support rows from the latest supervisor final appraisal. Any manual edits in those sections may be lost."
        confirmLabel="Refresh gaps"
        destructive
        confirming={refreshingGaps}
        onConfirm={() => refreshGaps()}
        onCancel={() => !refreshingGaps && setRefreshGapsOpen(false)}
      />

      <ConfirmDialog
        open={submitOpen}
        title="Submit improvement plan?"
        message="This locks Stage 1 permanently — gaps, support, objectives, and dates cannot be changed. Coaching sessions will be generated and you can continue in the Tracking tab."
        confirmLabel="Submit plan"
        confirming={submitting || saving}
        onConfirm={() => submitPlan()}
        onCancel={() => !submitting && !saving && setSubmitOpen(false)}
      />

      {schema && (
        <PipPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          schema={schema}
          responses={effectiveResponses}
          employeeName={employeeName}
          status={pipStatus}
          canViewHrSections={canViewHrSections}
          appraisalId={appraisalId}
          previewStage={stageTab}
        />
      )}

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            {hasUnsavedChanges && canSave && (
              <p className="text-xs text-amber-700">You have unsaved changes.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              {canSave ? "Cancel" : "Back"}
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
            {canSave && (
              <>
                <button
                  type="button"
                  onClick={() => savePip()}
                  disabled={saving || submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-95 disabled:opacity-50"
                  style={{ backgroundColor: BRAND }}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save
                </button>
                {canSubmitPlan && stageTab === "plan" && (
                  <button
                    type="button"
                    onClick={() => setSubmitOpen(true)}
                    disabled={saving || submitting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#1e3a5f] hover:opacity-95 disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Submit plan
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
