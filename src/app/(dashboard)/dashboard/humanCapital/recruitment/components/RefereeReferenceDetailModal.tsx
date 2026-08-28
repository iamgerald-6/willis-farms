"use client";

import { X } from "lucide-react";
import {
  REFEREE_ASSESSMENT_ATTRIBUTES,
  type RefereeReferenceFormData,
} from "@/lib/careers/refereeReferenceTypes";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Accra",
  });
}

export default function RefereeReferenceDetailModal({
  refereeName,
  refereeIndex,
  submittedAt,
  formData,
  onClose,
}: {
  refereeName: string;
  refereeIndex: number;
  submittedAt: string | null;
  formData: RefereeReferenceFormData;
  onClose: () => void;
}) {
  const form = formData;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Referee {refereeIndex}: {refereeName}
            </h3>
            {submittedAt && (
              <p className="text-xs text-gray-500 mt-0.5">
                Submitted {formatDate(submittedAt)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          {form.referee?.organisation_position && (
            <div>
              <p className="text-xs text-gray-400">Organisation / position</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {form.referee.organisation_position}
              </p>
            </div>
          )}
          {form.referee?.known_duration_capacity && (
            <div>
              <p className="text-xs text-gray-400">Known duration & capacity</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {form.referee.known_duration_capacity}
              </p>
            </div>
          )}
          {form.would_recommend && (
            <div>
              <p className="text-xs text-gray-400">Would recommend</p>
              <p className="font-medium text-gray-900 mt-0.5">
                {form.would_recommend}
                {form.recommend_explanation ? ` — ${form.recommend_explanation}` : ""}
              </p>
            </div>
          )}
          {form.main_duties && (
            <div>
              <p className="text-xs text-gray-400">Main duties</p>
              <p className="text-gray-900 mt-0.5 whitespace-pre-wrap">{form.main_duties}</p>
            </div>
          )}
          {form.concerns && (
            <div>
              <p className="text-xs text-gray-400">Concerns</p>
              <p className="text-gray-900 mt-0.5 whitespace-pre-wrap">{form.concerns}</p>
            </div>
          )}
          {form.other_comments && (
            <div>
              <p className="text-xs text-gray-400">Other comments</p>
              <p className="text-gray-900 mt-0.5 whitespace-pre-wrap">{form.other_comments}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-700 border-b border-gray-100 pb-2 mb-3">
              Assessment
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {REFEREE_ASSESSMENT_ATTRIBUTES.map((attr) => {
                const rating = form.assessment?.[attr.key];
                if (!rating) return null;
                return (
                  <div key={attr.key} className="text-xs">
                    <span className="text-gray-500">{attr.label}: </span>
                    <span className="font-medium text-gray-900">{rating}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {form.declaration?.signature_name && (
            <div className="pt-2 border-t border-gray-100 text-xs text-gray-500">
              Signed {form.declaration.signature_name}
              {form.declaration.signature_date
                ? ` · ${form.declaration.signature_date}`
                : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
