"use client";

import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useState } from "react";
import {
  REFEREE_ASSESSMENT_ATTRIBUTES,
  type RefereeReferenceFormData,
} from "@/lib/careers/refereeReferenceTypes";

export type RefereeSubmissionDisplay = {
  referee_index: number;
  referee_name: string;
  referee_email: string;
  relationship: string;
  phone: string;
  submitted_at: string | null;
  form_data: RefereeReferenceFormData | Record<string, unknown>;
};

type Props = {
  submissions: RefereeSubmissionDisplay[];
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RefereeDetail({ form }: { form: RefereeReferenceFormData }) {
  return (
    <div className="mt-3 space-y-3 text-sm border-t border-gray-200 pt-3">
      {form.referee?.organisation_position && (
        <p>
          <span className="text-gray-500">Organisation: </span>
          {form.referee.organisation_position}
        </p>
      )}
      {form.referee?.known_duration_capacity && (
        <p>
          <span className="text-gray-500">Known: </span>
          {form.referee.known_duration_capacity}
        </p>
      )}
      {form.would_recommend && (
        <p>
          <span className="text-gray-500">Recommend: </span>
          <strong>{form.would_recommend}</strong>
          {form.recommend_explanation ? ` — ${form.recommend_explanation}` : ""}
        </p>
      )}
      {form.main_duties && (
        <p>
          <span className="text-gray-500">Main duties: </span>
          {form.main_duties}
        </p>
      )}
      {form.concerns && (
        <p>
          <span className="text-gray-500">Concerns: </span>
          {form.concerns}
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-1 text-xs">
        {REFEREE_ASSESSMENT_ATTRIBUTES.map((attr) => {
          const rating = form.assessment?.[attr.key];
          if (!rating) return null;
          return (
            <div key={attr.key} className="text-gray-600">
              {attr.label}: <span className="font-medium text-gray-800">{rating}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RefereeSubmissionsView({ submissions }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (submissions.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        No referees were listed on your job application.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 leading-relaxed">
        These are the referees you named when you applied. Each referee receives an email with a
        link to complete their reference form — you do not need to fill this in yourself.
      </p>
      <ul className="space-y-2">
        {submissions.map((row) => {
          const submitted = Boolean(row.submitted_at);
          const form = row.form_data as RefereeReferenceFormData;
          const isOpen = expanded === row.referee_index;

          return (
            <li
              key={row.referee_index}
              className="border border-gray-200 rounded-lg px-3 py-3 bg-gray-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    Referee {row.referee_index}: {row.referee_name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {row.relationship}
                    {row.referee_email ? ` · ${row.referee_email}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                    submitted
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {submitted ? "Submitted" : "Awaiting response"}
                </span>
              </div>

              {submitted && (
                <>
                  <p className="text-xs text-gray-400 mt-2">
                    Received {formatDate(row.submitted_at)}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(isOpen ? null : row.referee_index)
                    }
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    {isOpen ? (
                      <>
                        Hide details <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        View reference summary <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                  {isOpen && <RefereeDetail form={form} />}
                </>
              )}

              {!submitted && (
                <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" />
                  An email was sent to this referee when you submitted your application.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
