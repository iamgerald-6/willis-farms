"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import type { FormDefinition } from "@/lib/moduleRegistry/types";
import type { ModuleBusinessLogic } from "@/lib/systemDefinitions";
import {
  DEFAULT_COMPANY_EMAIL_DOMAIN,
  normalizeCompanyEmailDomain,
} from "@/lib/systemDefinitions/companyEmailDomain";
import { COMPANY_EMAIL_DOMAIN_QUERY_KEY } from "@/hooks/useCompanyEmailDomain";

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

export default function CompanyEmailDomainEditor({
  moduleId,
  readOnly = false,
}: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["system_module_config", moduleId];
  const [draftDomain, setDraftDomain] = useState("");

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchModuleConfigApi(moduleId),
  });

  const savedDomain =
    data?.businessLogic.companyEmailDomain ?? DEFAULT_COMPANY_EMAIL_DOMAIN;

  useEffect(() => {
    setDraftDomain(savedDomain);
  }, [savedDomain]);

  const saveMutation = useMutation({
    mutationFn: async (domain: string) => {
      const current = data?.businessLogic ?? {};
      return api.patch(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
        {
          business_logic: {
            ...current,
            companyEmailDomain: domain,
          },
        },
      );
    },
    onSuccess: () => {
      toast.success("Company email domain saved.");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: [...COMPANY_EMAIL_DOMAIN_QUERY_KEY] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save domain.");
    },
  });

  const normalized = normalizeCompanyEmailDomain(draftDomain);
  const isValid = normalized.length > 0 && normalized.includes(".");
  const isDirty = isValid && normalized !== savedDomain;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading company email domain…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Domain appended to HR-suggested company emails in Section O (e.g.{" "}
        <span className="font-mono text-gray-700">l.akoto@{normalized}</span>).
        HR can edit the name part only; this domain is fixed in the UI.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <AtSign className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500">@</span>
          <input
            type="text"
            value={draftDomain}
            onChange={(e) =>
              setDraftDomain(e.target.value.replace(/^@+/, "").toLowerCase())
            }
            disabled={readOnly}
            placeholder={DEFAULT_COMPANY_EMAIL_DOMAIN}
            className="w-56 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-50 disabled:text-gray-500"
            aria-label="Company email domain"
          />
        </div>

        <button
          type="button"
          onClick={() => saveMutation.mutate(normalized)}
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
