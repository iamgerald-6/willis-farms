"use client";

import { ExternalLink, FileText } from "lucide-react";
import type { UploadedFile } from "@/lib/careers/applicationFormSchema";

type Props = {
  certificates: UploadedFile[];
};

export function ApplicationCertificatesView({ certificates }: Props) {
  if (certificates.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        No certificates were uploaded with your job application.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 leading-relaxed">
        These certificates were uploaded when you applied for this role. You can view them
        here — you do not need to upload them again during onboarding.
      </p>
      <ul className="space-y-2">
      {certificates.map((file, index) => (
        <li
          key={file.public_id ?? `${file.original_name}-${index}`}
          className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50"
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-800 truncate">
              {file.original_name ?? `Certificate ${index + 1}`}
            </span>
          </div>
          {file.secure_url && (
            <a
              href={file.secure_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 shrink-0"
            >
              View
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </li>
      ))}
      </ul>
    </div>
  );
}

export function normalizeApplicationCertificates(value: unknown): UploadedFile[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (f): f is UploadedFile =>
      f != null &&
      typeof f === "object" &&
      typeof (f as UploadedFile).secure_url === "string",
  );
}
