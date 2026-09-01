"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Clock, Loader2, Mail, Plus, Trash2, Unlock } from "lucide-react";
import type { InterviewFormData, PanelMember } from "@/lib/careers/types";
import { createPanelMember } from "@/lib/careers/panelInterview";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { stageMembers } from "@/lib/careers/panelInterview";
import { IOSTimePicker } from "@/components/IOSTimePicker";
import { StageInfoBanner } from "./shared";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type Props = {
  guide: InterviewGuideConfig;
  formData: InterviewFormData;
  onChange: (data: InterviewFormData) => void;
  onSendStage2Invites: (scheduledAt: string) => void;
  isPending: boolean;
  readOnly?: boolean;
  /** HR clicks this once the practical actually starts — unlocks the Stage 2 panel members' forms. */
  onOpenPanelForms?: () => void;
  isOpeningPanelForms?: boolean;
  /** Takes HR straight to the Stage 2 form once panel forms are open — mirrors PanelSetupStep's Stage 1 equivalent. */
  onContinueToStage2Form?: () => void;
  /** Background autosave status for the setup fields below. */
  saveStatus?: "idle" | "saving" | "saved";
  /** Shown once forms are opened, before the interview evaluation is finalized. */
  canReschedule?: boolean;
  onReschedule?: () => void;
  isRescheduling?: boolean;
};

// Same date + IOSTimePicker split used when creating a job posting
// (CareersTab.tsx) — Ghana has no DST and is always UTC+0, so the picker
// values are stored as literal UTC ("...THH:mm:00Z") rather than run
// through Date parsing, which would reinterpret them using whichever
// timezone the admin's own computer happens to be set to.
function isoDatePart(iso?: string) {
  return iso ? iso.slice(0, 10) : "";
}
function isoTimePart(iso?: string) {
  return iso ? iso.slice(11, 16) : "";
}
function combineDateTime(date: string, time: string): string {
  return date && time ? `${date}T${time}:00Z` : "";
}

export default function Stage2SetupStep({
  guide,
  formData,
  onChange,
  onSendStage2Invites,
  isPending,
  readOnly = false,
  onOpenPanelForms,
  isOpeningPanelForms = false,
  onContinueToStage2Form,
  saveStatus = "idle",
  canReschedule = false,
  onReschedule,
  isRescheduling = false,
}: Props) {
  const [showRescheduleConfirm, setShowRescheduleConfirm] = useState(false);
  const setup = formData.setup ?? {};
  const stage1Members = stageMembers(formData, 1);

  useEffect(() => {
    if (setup.stage2_members?.length) return;
    if (stage1Members.length === 0) return;
    onChange({
      ...formData,
      setup: {
        ...setup,
        stage2_members: stage1Members.map((m) =>
          createPanelMember(m.name, m.email, 2),
        ),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.stage1_review?.passed]);

  const stage2Members = setup.stage2_members?.length
    ? setup.stage2_members
    : stage1Members.map((m) => createPanelMember(m.name, m.email, 2));

  const updateMember = (index: number, field: keyof PanelMember, value: string) => {
    const next = stage2Members.map((m, i) =>
      i === index ? { ...m, [field]: value } : m,
    );
    onChange({
      ...formData,
      setup: { ...setup, stage2_members: next },
    });
  };

  const addMember = () => {
    onChange({
      ...formData,
      setup: {
        ...setup,
        stage2_members: [
          ...stage2Members,
          createPanelMember("", "", 2),
        ],
      },
    });
  };

  const removeMember = (index: number) => {
    onChange({
      ...formData,
      setup: {
        ...setup,
        stage2_members: stage2Members.filter((_, i) => i !== index),
      },
    });
  };

  const toggleUnavailable = (index: number, unavailable: boolean) => {
    const next = stage2Members.map((m, i) =>
      i === index ? { ...m, unavailable } : m,
    );
    onChange({
      ...formData,
      setup: { ...setup, stage2_members: next },
    });
  };

  const scheduledAt =
    setup.stage2_scheduled_at ??
    formData.stage2_scheduled_at ??
    "";

  return (
    <div className="space-y-6">
      <StageInfoBanner
        title="Panel setup — Stage 2"
        duration={guide.stageDurations.stage2}
        briefing="Stage 1 panel members are listed below. Add more panel members if needed, then set the practical date, time, and location before sending Stage 2 invites."
      />

      {readOnly && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
          <p className="text-xs text-gray-500">
            {canReschedule
              ? "Panel forms are open, so the date, location, and panel list are locked to protect what's already been submitted."
              : "Stage 2 is complete and all panel members have submitted — this panel setup is now locked."}
          </p>
          {canReschedule && onReschedule && (
            <button
              type="button"
              onClick={() => setShowRescheduleConfirm(true)}
              disabled={isRescheduling}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-60 shrink-0"
            >
              {isRescheduling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CalendarClock className="w-3.5 h-3.5" />
              )}
              Reschedule
            </button>
          )}
        </div>
      )}

      <section className="border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-1">Stage 2 — Add panel</h3>
        <p className="text-xs text-gray-500 mb-4">
          Pre-filled from Stage 1. You can add additional panel members for the practical assessment.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Stage 2 practical date *
            </label>
            <input
              type="date"
              value={isoDatePart(scheduledAt)}
              disabled={readOnly}
              onChange={(e) => {
                const time = isoTimePart(scheduledAt) || "09:00";
                const iso = combineDateTime(e.target.value, time);
                onChange({
                  ...formData,
                  stage2_scheduled_at: iso,
                  setup: {
                    ...setup,
                    stage2_scheduled_at: iso,
                    stage2_members: stage2Members,
                  },
                });
              }}
              className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${readOnly ? "opacity-60" : ""}`}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Stage 2 practical time *
            </label>
            <IOSTimePicker
              value={isoTimePart(scheduledAt)}
              disabled={readOnly}
              onChange={(time) => {
                const date = isoDatePart(scheduledAt);
                if (!date) return;
                const iso = combineDateTime(date, time);
                onChange({
                  ...formData,
                  stage2_scheduled_at: iso,
                  setup: {
                    ...setup,
                    stage2_scheduled_at: iso,
                    stage2_members: stage2Members,
                  },
                });
              }}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Practical format *</label>
            <select
              value={setup.stage2_location_type ?? ""}
              disabled={readOnly}
              onChange={(e) =>
                onChange({
                  ...formData,
                  setup: {
                    ...setup,
                    stage2_location_type:
                      (e.target.value as "onsite" | "online") || undefined,
                  },
                })
              }
              className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${readOnly ? "opacity-60" : ""}`}
            >
              <option value="">Select…</option>
              <option value="onsite">Onsite</option>
              <option value="online">Online</option>
            </select>
          </div>
          {setup.stage2_location_type === "online" ? (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Meeting link *</label>
              <input
                type="text"
                placeholder="https://meet.google.com/..."
                value={setup.stage2_meeting_link ?? ""}
                disabled={readOnly}
                onChange={(e) =>
                  onChange({
                    ...formData,
                    setup: { ...setup, stage2_meeting_link: e.target.value },
                  })
                }
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${readOnly ? "opacity-60" : ""}`}
              />
            </div>
          ) : setup.stage2_location_type === "onsite" ? (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Location *</label>
              <input
                type="text"
                placeholder="Practical assessment location"
                value={setup.stage2_location ?? ""}
                disabled={readOnly}
                onChange={(e) =>
                  onChange({
                    ...formData,
                    setup: { ...setup, stage2_location: e.target.value },
                  })
                }
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${readOnly ? "opacity-60" : ""}`}
              />
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Stage 2 panel
          </span>
          {!readOnly && (
            <button
              type="button"
              onClick={addMember}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              Add member
            </button>
          )}
        </div>

        <div className="space-y-3">
          {stage2Members.map((member, index) => (
            <div
              key={member.id || index}
              className={`border rounded-xl p-3 space-y-2 ${
                member.unavailable ? "border-amber-200 bg-amber-50/40" : "border-gray-100"
              }`}
            >
              <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-start">
                <input
                  type="text"
                  placeholder="Full name *"
                  value={member.name}
                  disabled={readOnly}
                  onChange={(e) => updateMember(index, "name", e.target.value)}
                  className={`border border-gray-200 rounded-lg px-3 py-2 text-sm ${readOnly ? "opacity-60" : ""}`}
                />
                <input
                  type="email"
                  placeholder="Email *"
                  value={member.email}
                  disabled={readOnly}
                  onChange={(e) => updateMember(index, "email", e.target.value)}
                  className={`border border-gray-200 rounded-lg px-3 py-2 text-sm ${readOnly ? "opacity-60" : ""}`}
                />
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeMember(index)}
                    className="p-2 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-amber-800">
                <input
                  type="checkbox"
                  checked={!!member.unavailable}
                  disabled={readOnly}
                  onChange={(e) => toggleUnavailable(index, e.target.checked)}
                  className="rounded border-gray-300"
                />
                Couldn&apos;t make it — exclude from this round (stays on record, won&apos;t be sent invites or block progress)
              </label>
            </div>
          ))}
        </div>
      </section>

      {setup.stage2_invites_sent_at && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          Stage 2 invites sent{" "}
          {new Date(setup.stage2_invites_sent_at).toLocaleString("en-GB")}
        </p>
      )}

      {setup.stage2_invites_sent_at && (
        <section className="border border-amber-200 bg-amber-50 rounded-xl p-4">
          <h3 className="text-sm font-bold text-amber-900 mb-1">Panel forms</h3>
          {setup.stage2_forms_opened_at ? (
            <p className="text-xs text-amber-800">
              Panel members can access their forms — opened{" "}
              {new Date(setup.stage2_forms_opened_at).toLocaleString("en-GB")}.
            </p>
          ) : (
            <>
              <p className="text-xs text-amber-800 mb-3">
                Panel members&apos; links stay locked with a &quot;not open yet&quot; message
                until you open the forms — do this once the practical actually starts, not before.
              </p>
              {onOpenPanelForms && (
                <button
                  type="button"
                  onClick={onOpenPanelForms}
                  disabled={isOpeningPanelForms}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-60"
                >
                  {isOpeningPanelForms ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unlock className="w-4 h-4" />
                  )}
                  Open panel forms now
                </button>
              )}
            </>
          )}
        </section>
      )}

      {!readOnly && saveStatus !== "idle" && (
        <p className="text-xs text-gray-400 text-right">
          {saveStatus === "saving" ? "Saving…" : "Draft saved"}
        </p>
      )}

      {/* Always available once invited, even while the setup fields are
          locked (forms opened, or the stage fully done) — this only
          navigates to HR's own grading form, it doesn't edit anything
          here. */}
      {setup.stage2_invites_sent_at && (
        <button
          type="button"
          onClick={() => onContinueToStage2Form?.()}
          className="w-full py-2.5 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50"
        >
          Continue to HR Stage 2 form
        </button>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={() => scheduledAt && onSendStage2Invites(scheduledAt)}
          disabled={isPending || !scheduledAt}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Mail className="w-4 h-4" />
          )}
          {setup.stage2_invites_sent_at
            ? "Resend Stage 2 invites"
            : "Send Stage 2 invites & open practical"}
        </button>
      )}

      <ConfirmDialog
        open={showRescheduleConfirm}
        title="Reschedule Stage 2?"
        message="Panel forms will lock again until you reopen them. Anyone who already submitted keeps their answers but can edit and resubmit — nothing is deleted."
        confirmLabel={isRescheduling ? "Rescheduling…" : "Reschedule"}
        destructive
        confirming={isRescheduling}
        onConfirm={() => {
          onReschedule?.();
          setShowRescheduleConfirm(false);
        }}
        onCancel={() => setShowRescheduleConfirm(false)}
      />
    </div>
  );
}
