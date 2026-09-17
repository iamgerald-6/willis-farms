"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { CLOUDINARY_UPLOAD_PRESET, cloudinaryUploadUrl } from "@/lib/cloudinary";
import { ACCEPT_IMAGE_JPEG_PNG, validateImageFile } from "@/lib/uploadConstraints";
import type { FormDefinition } from "@/lib/moduleRegistry/types";
import type { ModuleBusinessLogic } from "@/lib/systemDefinitions";
import {
  DEFAULT_COMPANY_ADDRESS_LINES,
  DEFAULT_COMPANY_PRIMARY_COLOR,
  isValidHexColor,
  resolveCompanyBranding,
} from "@/lib/systemDefinitions/companyBrandingConfig";

async function fetchModuleConfigApi(moduleId: string) {
  const res = await api.get(
    `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
  );
  return res.data.data as {
    businessLogic: ModuleBusinessLogic;
    formDefinition: FormDefinition | null;
  };
}

async function uploadLogoToCloudinary(
  file: File,
): Promise<{ secure_url: string; public_id: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "CompanyBranding");

  const res = await fetch(cloudinaryUploadUrl("image"), {
    method: "POST",
    body: formData,
  });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(json?.error?.message ?? `Cloudinary upload failed (HTTP ${res.status})`);
  }
  return { secure_url: json.secure_url, public_id: json.public_id };
}

type Props = {
  moduleId: string;
  readOnly?: boolean;
};

export default function CompanyBrandingEditor({ moduleId, readOnly = false }: Props) {
  const queryClient = useQueryClient();
  const queryKey = ["system_module_config", moduleId];
  const [uploading, setUploading] = useState(false);
  const [draftAddress, setDraftAddress] = useState("");
  const [draftColor, setDraftColor] = useState(DEFAULT_COMPANY_PRIMARY_COLOR);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchModuleConfigApi(moduleId),
  });

  const saved = resolveCompanyBranding(data?.businessLogic);
  const savedAddressText = saved.addressLines.join("\n");

  useEffect(() => {
    setDraftAddress(savedAddressText);
  }, [savedAddressText]);

  useEffect(() => {
    setDraftColor(saved.primaryColor);
    // Only re-sync when the saved value itself changes, not on every
    // keystroke in the color input below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.primaryColor]);

  const saveMutation = useMutation({
    mutationFn: async (patch: { logoUrl?: string; logoPublicId?: string; addressLines?: string[]; primaryColor?: string }) => {
      const current = data?.businessLogic ?? {};
      const currentBranding = current.companyBranding ?? {};
      return api.patch(
        `/system-definitions/modules/${encodeURIComponent(moduleId)}`,
        {
          business_logic: {
            ...current,
            companyBranding: {
              ...currentBranding,
              ...patch,
            },
          },
        },
      );
    },
    onSuccess: () => {
      toast.success("Company branding saved.");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? "Could not save company branding.");
    },
  });

  const handleLogoFile = async (file: File) => {
    const validationError = validateImageFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setUploading(true);
    try {
      const { secure_url, public_id } = await uploadLogoToCloudinary(file);
      await saveMutation.mutateAsync({ logoUrl: secure_url, logoPublicId: public_id });
    } catch (err: any) {
      toast.error(err?.message ?? "Logo upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const addressLines = draftAddress
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const isAddressDirty =
    addressLines.length > 0 &&
    JSON.stringify(addressLines) !== JSON.stringify(saved.addressLines);

  const isColorValid = isValidHexColor(draftColor);
  const isColorDirty = isColorValid && draftColor !== saved.primaryColor;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading company branding…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">
        The logo below appears in the offer letter header and, at low opacity, as the
        page watermark — upload a new one any time the company logo changes and both
        update together. The address lines appear next to the logo in the letterhead.
        The accent color is used across every generated PDF (offer letter, employee
        profile, interview reports, hiring summaries, and the Task Manager monthly
        report) — section titles, dividers, and highlight bars all pick it up.
      </p>

      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
          Logo
        </label>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
            {saved.logoUrl ? (
              // Preview only — not the letter itself, plain <img> is fine here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={saved.logoUrl} alt="Company logo" className="w-full h-full object-contain" />
            ) : (
              <ImageIcon className="w-7 h-7 text-gray-300" />
            )}
          </div>
          <div>
            <input
              id="company-branding-logo-input"
              type="file"
              accept={ACCEPT_IMAGE_JPEG_PNG}
              className="hidden"
              disabled={readOnly || uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleLogoFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={readOnly || uploading}
              onClick={() => document.getElementById("company-branding-logo-input")?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {saved.logoUrl ? "Replace logo" : "Upload logo"}
            </button>
            <p className="text-[11px] text-gray-400 mt-1">JPEG or PNG, up to 5MB.</p>
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
          Accent color
        </label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={isColorValid ? draftColor : DEFAULT_COMPANY_PRIMARY_COLOR}
            onChange={(e) => setDraftColor(e.target.value)}
            disabled={readOnly}
            className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer disabled:cursor-not-allowed"
          />
          <input
            type="text"
            value={draftColor}
            onChange={(e) => setDraftColor(e.target.value)}
            disabled={readOnly}
            placeholder={DEFAULT_COMPANY_PRIMARY_COLOR}
            className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-50 disabled:text-gray-500"
          />
          <button
            type="button"
            onClick={() => saveMutation.mutate({ primaryColor: draftColor.trim() })}
            disabled={readOnly || saveMutation.isPending || !isColorDirty}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60 transition"
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Save color
          </button>
        </div>
        {!isColorValid && (
          <p className="text-[11px] text-red-500 mt-1">Enter a valid hex color, e.g. #991B1B.</p>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
          Address & contact details
        </label>
        <textarea
          value={draftAddress}
          onChange={(e) => setDraftAddress(e.target.value)}
          disabled={readOnly}
          rows={4}
          placeholder={DEFAULT_COMPANY_ADDRESS_LINES.join("\n")}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-50 disabled:text-gray-500 resize-none font-mono"
        />
        <p className="text-[11px] text-gray-400 mt-1">One line per row — shown exactly as typed.</p>

        <button
          type="button"
          onClick={() => saveMutation.mutate({ addressLines })}
          disabled={readOnly || saveMutation.isPending || !isAddressDirty}
          className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60 transition"
        >
          {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Save address
        </button>
      </div>
    </div>
  );
}
