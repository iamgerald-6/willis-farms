"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { FormDefinition } from "@/lib/moduleRegistry/types";
import type { ModuleBusinessLogic } from "@/lib/systemDefinitions";
import { DEFAULT_ANNUAL_LEAVE_CAP_DAYS } from "@/lib/leave/leavePolicy";

async function fetchModuleConfigApi(moduleId: string) {
  const res = await api.get(
    `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
  );
  return res.data.data as {
    businessLogic: ModuleBusinessLogic;
    formDefinition: FormDefinition | null;
  };
}

type Props = {
  moduleId: string;
  readOnly?: boolean;
};

export default function LeavePolicyEditor({ moduleId, readOnly = false }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["system_module_config", moduleId];
  const [draftDays, setDraftDays] = useState("");

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchModuleConfigApi(moduleId),
  });

  const annualLeaveCapDays =
    data?.businessLogic.annualLeaveCapDays ?? DEFAULT_ANNUAL_LEAVE_CAP_DAYS;

  useEffect(() => {
    setDraftDays(String(annualLeaveCapDays));
  }, [annualLeaveCapDays]);

  const saveMutation = useMutation({
    mutationFn: async (days: number) => {
      const current = data?.businessLogic ?? {};
      return api.patch(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
        {
          business_logic: {
            ...current,
            annualLeaveCapDays: days,
          },
        },
      );
    },
    onSuccess: () => {
      toast.success("Annual leave allowance saved.");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["my_leave"] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(
        err?.response?.data?.error ?? "Could not save leave allowance.",
      );
    },
  });

  const parsed = Number.parseInt(draftDays, 10);
  const isValid = Number.isFinite(parsed) && parsed >= 1 && parsed <= 365;
  const isDirty = isValid && parsed !== annualLeaveCapDays;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading leave policy…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Working days each employee may take as <strong>Annual</strong> leave per
        calendar year. Used for balance cards and apply validation on the Leave
        page.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-gray-400" />
          <input
            type="number"
            min={1}
            max={365}
            value={draftDays}
            onChange={(e) => setDraftDays(e.target.value)}
            disabled={readOnly}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-50 disabled:text-gray-500"
            aria-label="Annual leave days per year"
          />
          <span className="text-sm text-gray-500">days / year</span>
        </div>

        <button
          type="button"
          onClick={() => saveMutation.mutate(parsed)}
          disabled={readOnly || saveMutation.isPending || !isDirty}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60 transition"
        >
          {saveMutation.isPending && (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}
          Save
        </button>
      </div>
    </div>
  );
}
