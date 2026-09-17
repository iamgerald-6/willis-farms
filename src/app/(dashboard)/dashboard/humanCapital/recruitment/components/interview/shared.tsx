"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { RATING_LABELS } from "@/lib/careers/interviewFormConfigs";
import { canBeAssignedAsSupervisorAtOnboardingByRoleLabel } from "@/lib/userRoleAccessControl";

export type PanelCandidate = {
  id: string;
  name: string;
  email: string;
  role: string;
  siteLabel: string;
};

/**
 * HR/Supervisory/Executive staff eligible to sit on an interview panel —
 * from sites OTHER than the one hiring for this posting, so the panel
 * stays independent of the hiring site's own chain of command (same three
 * roles already trusted as a line manager — see
 * canBeAssignedAsSupervisorAtOnboardingByRoleLabel). This is only a list
 * of SUGGESTIONS: HR can still type any name/email directly for a
 * panelist from outside Willis Farms — see PanelMemberNameField below.
 */
export function usePanelMemberCandidates(
  excludeSiteId?: number | null,
): PanelCandidate[] {
  const { data: users } = useQuery({
    queryKey: ["get_users"],
    queryFn: async () =>
      (await api.get("/get_user")).data as Array<{
        user_id: string;
        first_name?: string | null;
        last_name?: string | null;
        email: string;
        user_role_label?: string | null;
        site_id?: string | null;
      }>,
  });

  const { data: listTypes } = useQuery({
    queryKey: ["organizational_structure_custom_list_types"],
    queryFn: async () =>
      (await api.get("/organizational-structure/custom-list-types")).data
        .data as Array<{ id: string; table_name: string }>,
  });
  const sitesListType = listTypes?.find((lt) => lt.table_name === "sites");

  const { data: siteItems } = useQuery({
    queryKey: ["org_custom_list_items", sitesListType?.id],
    queryFn: async () =>
      (
        await api.get(
          `/organizational-structure/custom-list-types/${sitesListType!.id}/items`,
        )
      ).data.data as Array<{ id: string; label: string }>,
    enabled: !!sitesListType,
  });

  return useMemo(() => {
    const siteLabelById = new Map(
      (siteItems ?? []).map((s) => [String(s.id), s.label]),
    );
    return (users ?? [])
      .filter((u) =>
        canBeAssignedAsSupervisorAtOnboardingByRoleLabel(u.user_role_label),
      )
      .filter((u) =>
        excludeSiteId == null
          ? true
          : String(u.site_id ?? "") !== String(excludeSiteId),
      )
      .map((u) => ({
        id: u.user_id,
        name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(),
        email: u.email,
        role: u.user_role_label ?? "",
        siteLabel: siteLabelById.get(String(u.site_id ?? "")) ?? "Unknown site",
      }))
      .filter((c) => c.name && c.email)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, siteItems, excludeSiteId]);
}

/**
 * Panel member "Full name" field — a free-text input backed by a filtered
 * dropdown of internal staff (HR / Supervisory / Executive, other sites).
 * Typing filters the list live; picking a suggestion fills name AND email
 * together (via onPick) so the two never fall out of sync. Typing a name
 * that matches nothing is kept as-is — that's how HR adds an external
 * panelist who isn't a Willis Farms account.
 */
export function PanelMemberNameField({
  value,
  candidates,
  disabled,
  onNameChange,
  onPick,
}: {
  value: string;
  candidates: PanelCandidate[];
  disabled?: boolean;
  onNameChange: (name: string) => void;
  onPick: (candidate: PanelCandidate) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const query = value.trim().toLowerCase();
  const filtered = query
    ? candidates.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query),
      )
    : candidates;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        placeholder="Full name * — pick from staff or type an outside name"
        value={value}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onNameChange(e.target.value);
          setOpen(true);
        }}
        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${
          disabled ? "opacity-60" : ""
        }`}
      />
      {open && !disabled && candidates.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">
              No staff match — this will be saved as an outside panelist. Add
              their email too.
            </p>
          ) : (
            filtered.slice(0, 30).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onPick(c);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex flex-col"
              >
                <span className="text-gray-800">{c.name}</span>
                <span className="text-[11px] text-gray-400">
                  {c.role} · {c.siteLabel} · {c.email}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function RatingRow({
  label,
  lookFor,
  value,
  notes,
  onChange,
  readOnly = false,
}: {
  label: string;
  lookFor?: string;
  value: number | null;
  notes: string;
  onChange: (rating: number | null, notes: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="border border-gray-100 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {lookFor && (
          <p className="text-xs text-gray-500 mt-1">
            <span className="font-semibold">Look for:</span> {lookFor}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onChange(n, notes)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
              value === n
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-red-300"
            } ${readOnly ? "opacity-60" : ""}`}
            title={RATING_LABELS[n]}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        value={notes}
        onChange={(e) => onChange(value, e.target.value)}
        readOnly={readOnly}
        rows={2}
        placeholder="Evidence-based notes"
        className={`w-full text-xs border border-gray-200 rounded-lg px-3 py-2 ${
          readOnly ? "bg-gray-50 text-gray-500" : ""
        }`}
      />
    </div>
  );
}

export function StageInfoBanner({
  stage,
  title,
  duration,
  briefing,
  recommendedPanel,
  totalDuration,
}: {
  stage?: number;
  title: string;
  duration: string;
  briefing?: string;
  recommendedPanel?: string;
  totalDuration?: string;
}) {
  return (
    <section className="bg-amber-50 border border-amber-100 rounded-xl p-4 mt-10 text-sm text-amber-900 space-y-2">
      <div className="space-y-2">
        <p className="font-semibold leading-snug">
          {stage != null && stage > 0 ? `Stage ${stage} — ` : ""}
          {title}
        </p>
        <span className="inline-block text-xs font-medium bg-amber-100 text-amber-800 px-2.5 py-1.5 rounded-lg leading-normal whitespace-normal">
          {duration}
        </span>
      </div>
      {briefing && <p className="leading-relaxed">{briefing}</p>}
      {(recommendedPanel || totalDuration) && (
        <p className="text-xs text-amber-800/80">
          {recommendedPanel && <>Recommended panel: {recommendedPanel}</>}
          {recommendedPanel && totalDuration && " · "}
          {totalDuration && <>Total interview: {totalDuration}</>}
        </p>
      )}
    </section>
  );
}

export function StepIndicator<T extends string>({
  steps,
  current,
  labels,
  maxIndex,
  onStepClick,
  isStepDone,
}: {
  steps: T[];
  current: T;
  labels: string[];
  /** Highest step index reached so far — steps beyond this can't be clicked into yet. */
  maxIndex?: number;
  /** When provided, already-reached steps become clickable (to view them read-only). */
  onStepClick?: (step: T) => void;
  /** Override the default "done" check (i < currentIdx) for a specific step —
   * needed for the last step, which never has a later step to be "past" once
   * it's actually complete. Return the default if you don't want to override. */
  isStepDone?: (step: T, index: number, defaultDone: boolean) => boolean;
}) {
  const currentIdx = steps.indexOf(current);

  return (
    <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const defaultDone = i < currentIdx;
        const done = isStepDone ? isStepDone(step, i, defaultDone) : defaultDone;
        const active = step === current;
        const reachable = maxIndex == null || i <= maxIndex;
        const clickable = !!onStepClick && reachable;
        return (
          <div
            key={step}
            className="flex items-center gap-1 sm:gap-2 shrink-0"
          >
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick?.(step)}
              title={
                clickable
                  ? `View ${labels[i]}${i < (maxIndex ?? -1) ? " (read-only)" : ""}`
                  : undefined
              }
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${
                active
                  ? "bg-red-600 text-white"
                  : done
                    ? "bg-red-50 text-red-800 border border-red-200"
                    : "bg-gray-100 text-gray-500"
              } ${clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
            >
              <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                {done ? "✓" : i + 1}
              </span>
              <span className="hidden sm:inline">{labels[i]}</span>
            </button>
            {i < steps.length - 1 && (
              <span className="text-gray-300 hidden sm:inline">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
