"use client";

import { useCallback, useMemo, useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
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
  isPipEditableStatus,
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
  isGapReferenceColumn,
  isSupportActionColumn,
  newGapId,
  parseAppraisalRef,
  PIP_APPRAISAL_REF_KEY,
  PIP_GAP_ID_KEY,
  prepareResponsesWithGapChain,
  removeGapRowWithChain,
  syncGapChainTables,
  type PipAppraisalSummary,
  type PipSectionRole,
} from "@/lib/appraisal/pipGapChain";
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
}: {
  field: PipField;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  hrFacilitators?: HrFacilitatorOption[];
  canEditHrFacilitator?: boolean;
}) {
  const label = pipFieldLabel(field);
  const isHrFacilitator =
    isSystemField(field) && field.systemSource === "hr_facilitator";
  const spec = resolvePipFieldControl(field);
  const locked =
    (isSystemField(field) && !isHrFacilitator) || readOnly || (isHrFacilitator && !canEditHrFacilitator);

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
          <span className="text-sm text-gray-800 break-words">{value || "—"}</span>
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
}) {

  const emitRows = (next: Array<Record<string, string | number | null>>) => {
    onChange(applyTableRowAutoIncrement(section, next));
  };

  const updateCell = (rowIndex: number, colKey: string, value: string) => {
    if (section.columns.some((c) => c.key === colKey && isAutoIncrementColumn(c))) {
      return;
    }
    emitRows(
      rows.map((row, i) => (i === rowIndex ? { ...row, [colKey]: value } : row)),
    );
  };

  const displayRows = applyTableRowAutoIncrement(section, rows);
  const chainLocked =
    (sectionRole === "root_cause" || sectionRole === "support") && gapOptions.length > 0;
  const isSupport = sectionRole === "support";
  const isGapTable = !!(gapsSection && section.key === gapsSection.key);
  const gapEvidenceColKey =
    isGapTable && gapsSection ? findGapEvidenceColumn(gapsSection)?.key : undefined;

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

    if (isSupport && isSupportActionColumn(col)) {
      return (
        <span className="block text-sm text-gray-800">{String(row[col.key] ?? "") || "—"}</span>
      );
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

  return (
    <div className="space-y-3">
      <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[640px] text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {isSupport && gapOptions.length > 0 && (
                <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2.5 w-36">
                  Gap
                </th>
              )}
              {section.columns.map((col) => (
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
                  key={gapId ?? rowIndex}
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
                  {section.columns.map((col) => {
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
                          if (rows.length <= (section.minRows || 1)) return;
                          if (onRemoveRowAtIndex) onRemoveRowAtIndex(rowIndex);
                          else emitRows(rows.filter((_, i) => i !== rowIndex));
                        }}
                        disabled={rows.length <= (section.minRows || 1)}
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
          <div key={rowIndex} className="rounded-lg border border-gray-200 p-3 space-y-2 bg-white">
            {linkedGapChip(row)}
            <p className="text-[11px] font-semibold text-gray-400">Row {rowIndex + 1}</p>
            {section.columns.map((col) => (
              <div key={col.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{col.label}</label>
                {renderCell(col, row, rowIndex, true)}
              </div>
            ))}
          </div>
        ))}
      </div>

      {!readOnly && !chainLocked && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              emitRows([
                ...rows,
                {
                  ...Object.fromEntries(section.columns.map((col) => [col.key, ""])),
                  ...(sectionRole === "gaps" ? { [PIP_GAP_ID_KEY]: newGapId() } : {}),
                },
              ])
            }
            className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
          >
            <Plus className="w-3.5 h-3.5" /> Add row
          </button>
        </div>
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
  const { viewer } = useAppraisalViewer();
  const [responses, setResponses] = useState<PipFormResponses | null>(null);
  const [refreshGapsOpen, setRefreshGapsOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

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
  const schema = pip?.form_schema as PipFormSchema | undefined;
  const appraisalSummary = data?.appraisalSummary ?? null;
  const hasUnsavedChanges = responses != null;

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

  const hiddenHrSectionCount = (schema?.sections?.length ?? 0) - visibleSections.length;

  const effectiveResponses = useMemo(() => {
    const raw = responses ?? pip?.form_responses ?? { fields: {}, tables: {} };
    if (schema && !responses) {
      return prepareResponsesWithGapChain(raw, schema);
    }
    return raw;
  }, [responses, pip?.form_responses, schema]);

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
      for (const section of schema.sections) {
        if (section.kind === "table" && tables[section.key]) {
          tables[section.key] = applyTableRowAutoIncrement(section, tables[section.key]!);
        }
      }
      payload = { ...payload, tables };
    }
    return payload;
  }, [effectiveResponses, pip?.form_responses, schema, canViewHrSections]);

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

  const { mutate: submitPip, isPending: submitting } = useMutation({
    mutationFn: async () => {
      const res = await api.patch(`/appraisal/${appraisalId}/pip`, {
        form_responses: buildSavePayload(),
        status: "active",
      });
      return res.data.data as AppraisalPip;
    },
    onSuccess: (updated) => {
      setSubmitOpen(false);
      setResponses(null);
      queryClient.setQueryData(["appraisal-pip", appraisalId], (prev: typeof data) =>
        prev ? { ...prev, pip: updated } : prev,
      );
      toast.success("PIP submitted — the plan is now active.");
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not submit the PIP.";
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
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
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
  const canEdit = data.canManage && isPipEditableStatus(pipStatus);
  const statusLabel =
    pipStatus === "active" ? "Active" : pipStatus === "completed" ? "Completed" : "Draft";
  const canSubmit = canEdit;

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

      {canEdit ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">How to complete this form</p>
          <ul className="mt-1.5 text-xs text-emerald-800 space-y-1 list-disc list-inside">
            <li>Gray locked fields are filled automatically — do not retype them.</li>
            <li>Use calendar pickers for dates and dropdowns for choices.</li>
            <li>Work through each section in order, then save your progress.</li>
          </ul>
        </div>
      ) : (
        <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <p className="font-semibold">Submitted PIP — read-only</p>
          <p className="mt-1 text-xs text-gray-500">
            This plan has been submitted and can no longer be changed. Use Preview to review the
            full document.
          </p>
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
            {!canEdit
              ? "This PIP is read-only — no further edits are allowed after submission."
              : canViewHrSections
                ? "You can see and edit every section, including HR-use-only fields."
                : hiddenHrSectionCount > 0
                  ? `${hiddenHrSectionCount} HR-only section${hiddenHrSectionCount > 1 ? "s are" : " is"} hidden from this view. HR will complete those separately.`
                  : "Fill in the coaching and improvement sections below. Locked fields are filled automatically from the employee record."}
          </p>
        </div>
      </div>

      {!data.canManage && (
        <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-2 text-xs text-gray-600">
          <Eye className="w-4 h-4 shrink-0" />
          Read-only — you can view this PIP but cannot edit it.
        </div>
      )}

      {/* Sections — document order */}
      <div className="space-y-5">
        {visibleSections.map((section, index) => {
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
                    canEdit &&
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
                          value={String(effectiveResponses.fields?.[field.key] ?? "")}
                          onChange={(v) => setFieldValue(field.key, v)}
                          readOnly={!canEdit}
                          hrFacilitators={data?.hrFacilitators}
                          canEditHrFacilitator={canViewHrSections && canEdit}
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
              rows={applyTableRowAutoIncrement(
                section,
                effectiveResponses.tables?.[section.key] ??
                  Array.from({ length: section.minRows || 1 }, () =>
                    Object.fromEntries(section.columns.map((col) => [col.key, ""])),
                  ),
              )}
              onChange={(rows) => setTableRows(section.key, rows)}
              onRemoveRowAtIndex={
                sectionRole === "gaps" && canEdit ? removeGapRow : undefined
              }
              readOnly={!canEdit}
            />
                )}
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
        title="Submit this PIP?"
        message="Submitting issues the plan to the employee and supervisor. The PIP becomes active and read-only — no further edits will be allowed."
        confirmLabel="Submit PIP"
        confirming={submitting || saving}
        onConfirm={() => submitPip()}
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
        />
      )}

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            {hasUnsavedChanges && canEdit && (
              <p className="text-xs text-amber-700">You have unsaved changes.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              {canEdit ? "Cancel" : "Back"}
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
            {canEdit && (
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
                {canSubmit && (
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
                    Submit PIP
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
