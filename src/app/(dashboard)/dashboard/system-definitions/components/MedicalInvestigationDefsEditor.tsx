"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import {
  createBlankInvestigationDef,
  type InvestigationDef,
  type InvestigationDefKind,
} from "@/lib/medical/medicalInvestigationDefs";

const KIND_LABELS: Record<InvestigationDefKind, string> = {
  select: "Choice (e.g. Positive / Negative)",
  text: "Free-text result",
  findings_flag: "Findings + Normal/Abnormal",
  result_flag: "Result + Normal/Abnormal",
  panel: "Result + Normal/Abnormal (legacy)",
};

const inputCls = "border border-gray-200 rounded px-2 py-1 text-xs w-full";

function move<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const next = [...arr];
  const target = index + dir;
  if (target < 0 || target >= next.length) return arr;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function MedicalInvestigationDefsEditor({
  defs,
  onChange,
  canEdit,
}: {
  defs: InvestigationDef[];
  onChange: (defs: InvestigationDef[]) => void;
  canEdit: boolean;
}) {
  const updateDef = (index: number, updater: (d: InvestigationDef) => InvestigationDef) =>
    onChange(defs.map((d, i) => (i === index ? updater(d) : d)));

  const removeDef = (index: number) => onChange(defs.filter((_, i) => i !== index));

  const moveDef = (index: number, dir: -1 | 1) => onChange(move(defs, index, dir));

  const addDef = (kind: InvestigationDefKind) => onChange([...defs, createBlankInvestigationDef(kind)]);

  const changeKind = (index: number, kind: InvestigationDefKind) =>
    updateDef(index, (d) => ({ ...createBlankInvestigationDef(kind), id: d.id, label: d.label }));

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-500 leading-relaxed">
        These are the tests hospital staff see on Part 4. Every investigation appears as a
        row in the results table (Investigation, Result summary, Flag). Choice tests (e.g.
        blood group, Hb electrophoresis) use a dropdown in the Result summary column;
        imaging/screening tests use a text area for findings.
      </p>

      {defs.length === 0 && (
        <p className="text-xs text-gray-400 italic">No investigations configured yet — add one below.</p>
      )}

      <div className="space-y-2">
        {defs.map((def, index) => (
          <div key={def.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50/40">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                readOnly={!canEdit}
                className={`${inputCls} flex-1 min-w-[160px] font-medium`}
                value={def.label}
                onChange={(e) => updateDef(index, (d) => ({ ...d, label: e.target.value }))}
              />
              <select
                disabled={!canEdit}
                className={`${inputCls} w-auto`}
                value={def.kind === "panel" ? "result_flag" : def.kind}
                onChange={(e) => changeKind(index, e.target.value as InvestigationDefKind)}
              >
                {(["result_flag", "select", "findings_flag", "text"] as const).map((value) => (
                  <option key={value} value={value}>
                    {KIND_LABELS[value]}
                  </option>
                ))}
              </select>
              {canEdit && (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveDef(index, -1)}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDef(index, 1)}
                    disabled={index === defs.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDef(index)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                    aria-label="Remove investigation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {def.kind === "select" && (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-gray-400 mr-1">Options:</span>
                  {def.options.map((opt, oi) => (
                    <span
                      key={oi}
                      className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-full pl-2.5 pr-1.5 py-0.5 text-xs"
                    >
                      <input
                        type="text"
                        readOnly={!canEdit}
                        className="w-20 text-xs border-none focus:outline-none bg-transparent"
                        value={opt}
                        onChange={(e) =>
                          updateDef(index, (d) =>
                            d.kind === "select"
                              ? { ...d, options: d.options.map((o, j) => (j === oi ? e.target.value : o)) }
                              : d,
                          )
                        }
                      />
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            updateDef(index, (d) =>
                              d.kind === "select"
                                ? { ...d, options: d.options.filter((_, j) => j !== oi) }
                                : d,
                            )
                          }
                          className="text-gray-400 hover:text-red-600"
                          aria-label="Remove option"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() =>
                        updateDef(index, (d) =>
                          d.kind === "select" ? { ...d, options: [...d.options, "New option"] } : d,
                        )
                      }
                      className="text-[11px] text-red-700 font-medium"
                    >
                      + Add option
                    </button>
                  )}
                </div>
                <label className="mt-2 text-[11px] text-gray-500 flex items-center gap-1">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={def.allowComment === true}
                    onChange={(e) =>
                      updateDef(index, (d) =>
                        d.kind === "select" ? { ...d, allowComment: e.target.checked } : d,
                      )
                    }
                  />
                  Allow optional comment field
                </label>
              </>
            )}

            {def.kind === "text" && (
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <label className="text-[11px] text-gray-500 flex items-center gap-1">
                  Placeholder
                  <input
                    type="text"
                    readOnly={!canEdit}
                    className={`${inputCls} w-auto`}
                    value={def.placeholder ?? ""}
                    onChange={(e) =>
                      updateDef(index, (d) => (d.kind === "text" ? { ...d, placeholder: e.target.value } : d))
                    }
                  />
                </label>
                <label className="text-[11px] text-gray-500 flex items-center gap-1">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={def.allowComment === true}
                    onChange={(e) =>
                      updateDef(index, (d) => (d.kind === "text" ? { ...d, allowComment: e.target.checked } : d))
                    }
                  />
                  Allow optional comment field
                </label>
              </div>
            )}

            {def.kind === "result_flag" && (
              <p className="mt-2 text-[11px] text-gray-400">
                Renders a result field + Normal/Abnormal flag.
              </p>
            )}

            {def.kind === "findings_flag" && (
              <p className="mt-2 text-[11px] text-gray-400">
                Renders a findings/report box + Normal/Abnormal — no extra setup needed.
              </p>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => addDef("result_flag")}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-dashed border-gray-300 rounded-lg hover:border-red-300"
          >
            <Plus className="w-3 h-3" /> Result + flag
          </button>
          <button
            type="button"
            onClick={() => addDef("select")}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-dashed border-gray-300 rounded-lg hover:border-red-300"
          >
            <Plus className="w-3 h-3" /> Choice test
          </button>
          <button
            type="button"
            onClick={() => addDef("findings_flag")}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-dashed border-gray-300 rounded-lg hover:border-red-300"
          >
            <Plus className="w-3 h-3" /> Findings + flag
          </button>
        </div>
      )}
    </div>
  );
}
