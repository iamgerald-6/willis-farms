"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { ModuleBusinessLogic } from "@/lib/systemDefinitions";
import type { FormDefinition } from "@/lib/moduleRegistry/types";
import {
  DEFAULT_PAYROLL_TAX_CONFIG,
  normalizePayrollTaxConfig,
  type PayrollTaxBand,
} from "@/lib/systemDefinitions/payrollTaxConfig";

async function fetchModuleConfigApi(moduleId: string) {
  const res = await api.get(
    `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
  );
  return res.data.data as {
    businessLogic: ModuleBusinessLogic;
    formDefinition: FormDefinition | null;
  };
}

type DraftBand = {
  /** Empty string on the last (open-ended) row. */
  uptoMonthly: string;
  ratePercent: string;
};

function bandsToDraft(bands: PayrollTaxBand[]): DraftBand[] {
  return bands.map((b) => ({
    uptoMonthly: b.uptoMonthly === null ? "" : String(b.uptoMonthly),
    ratePercent: String(b.ratePercent),
  }));
}

function draftToBands(draft: DraftBand[]): PayrollTaxBand[] | null {
  const bands: PayrollTaxBand[] = [];
  for (let i = 0; i < draft.length; i++) {
    const row = draft[i];
    const isLast = i === draft.length - 1;
    const rate = Number(row.ratePercent);
    if (!Number.isFinite(rate) || rate < 0) return null;
    if (isLast) {
      bands.push({ uptoMonthly: null, ratePercent: rate });
      continue;
    }
    const upto = Number(row.uptoMonthly);
    if (!Number.isFinite(upto) || upto <= 0) return null;
    bands.push({ uptoMonthly: upto, ratePercent: rate });
  }
  return bands;
}

type Props = {
  moduleId: string;
  readOnly?: boolean;
};

export default function PayrollTaxSettingsEditor({ moduleId, readOnly = false }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["system_module_config", moduleId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchModuleConfigApi(moduleId),
  });

  const savedConfig = normalizePayrollTaxConfig(data?.businessLogic.payrollTaxConfig);

  const [ssnitDraft, setSsnitDraft] = useState("");
  const [bandsDraft, setBandsDraft] = useState<DraftBand[]>([]);

  useEffect(() => {
    setSsnitDraft(String(savedConfig.ssnitEmployeeRatePercent));
    setBandsDraft(bandsToDraft(savedConfig.payeBands));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rate = Number(ssnitDraft);
      if (!Number.isFinite(rate) || rate < 0) {
        throw new Error("Enter a valid SSNIT rate.");
      }
      const bands = draftToBands(bandsDraft);
      if (!bands || bands.length === 0) {
        throw new Error("Each PAYE band needs a valid rate, and a valid upper limit except the last.");
      }
      const current = data?.businessLogic ?? {};
      await api.patch(`/system-definitions/modules/${encodeURIComponent(moduleId)}`, {
        business_logic: {
          ...current,
          payrollTaxConfig: { ssnitEmployeeRatePercent: rate, payeBands: bands },
        },
      });
    },
    onSuccess: () => {
      toast.success("Payroll tax settings saved.");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error | { response?: { data?: { error?: string } } }) => {
      const message =
        err instanceof Error
          ? err.message
          : err?.response?.data?.error ?? "Could not save payroll tax settings.";
      toast.error(message);
    },
  });

  const updateBand = (index: number, patch: Partial<DraftBand>) => {
    setBandsDraft((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const removeBand = (index: number) => {
    setBandsDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const addBand = () => {
    // Insert before the last (open-ended) row.
    setBandsDraft((prev) => {
      const withoutLast = prev.slice(0, -1);
      const last = prev[prev.length - 1];
      return [...withoutLast, { uptoMonthly: "", ratePercent: "0" }, last];
    });
  };

  const resetToDefaults = () => {
    setSsnitDraft(String(DEFAULT_PAYROLL_TAX_CONFIG.ssnitEmployeeRatePercent));
    setBandsDraft(bandsToDraft(DEFAULT_PAYROLL_TAX_CONFIG.payeBands));
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading payroll tax settings…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        SSNIT rate and PAYE (income tax) bands used to auto-calculate Social security
        contribution, Income tax, and Net payable on the Offer Terms form once HR enters a
        Basic salary. Update these when GRA revises rates — no code change needed.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-gray-700">SSNIT employee rate</span>
        <input
          type="number"
          min={0}
          step="0.1"
          value={ssnitDraft}
          onChange={(e) => setSsnitDraft(e.target.value)}
          disabled={readOnly}
          className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-500"
        />
        <span className="text-gray-500">% of basic salary</span>
      </label>

      <div>
        <p className="text-xs font-medium text-gray-700 mb-1.5">
          PAYE bands (monthly chargeable income after SSNIT is deducted)
        </p>
        <div className="space-y-1.5">
          {bandsDraft.map((band, i) => {
            const isLast = i === bandsDraft.length - 1;
            return (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-gray-500 w-10 shrink-0">Up to</span>
                {isLast ? (
                  <span className="w-28 text-gray-500 italic">and above</span>
                ) : (
                  <input
                    type="number"
                    min={1}
                    value={band.uptoMonthly}
                    onChange={(e) => updateBand(i, { uptoMonthly: e.target.value })}
                    disabled={readOnly}
                    className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="GHS/month"
                  />
                )}
                <span className="text-gray-500">at</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={band.ratePercent}
                  onChange={(e) => updateBand(i, { ratePercent: e.target.value })}
                  disabled={readOnly}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-500"
                />
                <span className="text-gray-500">%</span>
                {!readOnly && bandsDraft.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeBand(i)}
                    className="p-1 rounded hover:bg-red-50 text-red-500"
                    title="Remove band"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={addBand}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800"
          >
            <Plus className="w-3.5 h-3.5" /> Add band
          </button>
        )}
      </div>

      {!readOnly && (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60 transition"
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
          <button
            type="button"
            onClick={resetToDefaults}
            className="text-xs text-gray-500 hover:underline"
          >
            Reset to 2026 GRA defaults
          </button>
        </div>
      )}
    </div>
  );
}
