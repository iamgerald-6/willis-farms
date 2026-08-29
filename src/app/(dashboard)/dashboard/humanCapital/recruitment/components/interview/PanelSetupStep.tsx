"use client";

import { CalendarClock, Clock, Loader2, Mail, Plus, Trash2, Unlock } from "lucide-react";
import type { InterviewFormData, PanelMember } from "@/lib/careers/types";
import { createPanelMember } from "@/lib/careers/panelInterview";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { IOSTimePicker } from "@/components/IOSTimePicker";
import { StageInfoBanner } from "./shared";

type Props = {
  guide: InterviewGuideConfig;
  formData: InterviewFormData;
  onChange: (data: InterviewFormData) => void;
  onSendStage1Invites: () => void;
  onContinueWithoutResend?: () => void;
  isPending: boolean;
  readOnly?: boolean;
  /** HR clicks this once the interview actually starts — unlocks the panel members' forms. */
  onOpenPanelForms?: () => void;
  isOpeningPanelForms?: boolean;
  /** Background autosave status for the setup fields below. */
  saveStatus?: "idle" | "saving" | "saved";
  /** Shown once forms are opened, before Stage 1's pass/reject decision is recorded. */
  canReschedule?: boolean;
  onReschedule?: () => void;
  isRescheduling?: boolean;
};

export default function PanelSetupStep({
  guide,
  formData,
  onChange,
  onSendStage1Invites,
  onContinueWithoutResend,
  isPending,
  readOnly = false,
  onOpenPanelForms,
  isOpeningPanelForms = false,
  saveStatus = "idle",
  canReschedule = false,
  onReschedule,
  isRescheduling = false,
}: Props) {
  const setup = formData.setup ?? {};
  const members = setup.stage1_members?.length
    ? setup.stage1_members
    : [createPanelMember("", "", 1)];

  const updateMember = (index: number, field: keyof PanelMember, value: string) => {
    const next = members.map((m, i) =>
      i === index ? { ...m, [field]: value } : m,
    );
    onChange({
      ...formData,
      setup: { ...setup, stage1_members: next },
    });
  };

  const addMember = () => {
    onChange({
      ...formData,
      setup: {
        ...setup,
        stage1_members: [...members, createPanelMember("", "", 1)],
      },
    });
  };

  const removeMember = (index: number) => {
    if (members.length <= 1) return;
    onChange({
      ...formData,
      setup: {
        ...setup,
        stage1_members: members.filter((_, i) => i !== index),
      },
    });
  };

  // Same date + IOSTimePicker split used when creating a job posting
  // (CareersTab.tsx) — Ghana has no DST and is always UTC+0, so the picker
  // values are stored as literal UTC ("...T HH:mm:00Z") rather than run
  // through Date parsing, which would reinterpret them using whichever
  // timezone the admin's own computer happens to be set to.
  const isoDatePart = (iso?: string) => (iso ? iso.slice(0, 10) : "");
  const isoTimePart = (iso?: string) => (iso ? iso.slice(11, 16) : "");
  const combineDateTime = (date: string, time: string) =>
    date && time ? `${date}T${time}:00Z` : undefined;

  const invitesSent =
    setup.stage1_invites_sent_at ?? setup.invites_sent_at;

  return (
    <div className="space-y-6">
      <StageInfoBanner
        title="Panel setup — Stage 1"
        duration="Before Stage 1"
        briefing="Add panel members for Stage 1 screening. Each member receives a link to complete their evaluation — no WillsOne account required."
        recommendedPanel={guide.recommendedPanel}
        totalDuration={guide.duration}
      />

      {readOnly && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
          <p className="text-xs text-gray-500">
            {canReschedule
              ? "Panel forms are open, so the date, location, and panel list are locked to protect what's already been submitted."
              : "Stage 1 is complete and all panel members have submitted — this panel setup is now locked."}
          </p>
          {canReschedule && onReschedule && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "Reschedule Stage 1? This clears the \"forms opened\" status and wipes any Stage 1 panel member or HR submissions/drafts already collected. Invite-sent status and the panel member list are kept so you can edit and resend. This cannot be undone.",
                  )
                ) {
                  onReschedule();
                }
              }}
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

      <section className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
        <h3 className="text-sm font-bold text-gray-900 mb-1">Stage 1 — Add panel</h3>
        <p className="text-xs text-gray-500 mb-4">
          Panel members score screening and structured questions independently. HR also completes a Stage 1 form.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Stage 1 interview date *
            </label>
            <input
              type="date"
              value={isoDatePart(setup.interview_start_at)}
              disabled={readOnly}
              onChange={(e) => {
                const time = isoTimePart(setup.interview_start_at) || "09:00";
                onChange({
                  ...formData,
                  setup: {
                    ...setup,
                    interview_start_at: combineDateTime(e.target.value, time),
                  },
                });
              }}
              className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white ${readOnly ? "opacity-60" : ""}`}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Stage 1 interview time *
            </label>
            <IOSTimePicker
              value={isoTimePart(setup.interview_start_at)}
              disabled={readOnly}
              onChange={(time) => {
                const date = isoDatePart(setup.interview_start_at);
                if (!date) return;
                onChange({
                  ...formData,
                  setup: {
                    ...setup,
                    interview_start_at: combineDateTime(date, time),
                  },
                });
              }}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Interview format *</label>
            <select
              value={setup.location_type ?? ""}
              disabled={readOnly}
              onChange={(e) =>
                onChange({
                  ...formData,
                  setup: {
                    ...setup,
                    location_type:
                      (e.target.value as "onsite" | "online") || undefined,
                  },
                })
              }
              className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white ${readOnly ? "opacity-60" : ""}`}
            >
              <option value="">Select…</option>
              <option value="onsite">Onsite</option>
              <option value="online">Online</option>
            </select>
          </div>
          {setup.location_type === "online" ? (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Meeting link *</label>
              <input
                type="text"
                placeholder="https://meet.google.com/..."
                value={setup.meeting_link ?? ""}
                disabled={readOnly}
                onChange={(e) =>
                  onChange({
                    ...formData,
                    setup: { ...setup, meeting_link: e.target.value },
                  })
                }
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white ${readOnly ? "opacity-60" : ""}`}
              />
            </div>
          ) : setup.location_type === "onsite" ? (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Location *</label>
              <input
                type="text"
                placeholder="Farm office / barn meeting room"
                value={setup.location ?? ""}
                disabled={readOnly}
                onChange={(e) =>
                  onChange({
                    ...formData,
                    setup: { ...setup, location: e.target.value },
                  })
                }
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white ${readOnly ? "opacity-60" : ""}`}
              />
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Panel members
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
          {members.map((member, index) => (
            <div
              key={member.id || index}
              className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-start border border-gray-100 rounded-xl p-3 bg-white"
            >
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
                  disabled={members.length <= 1}
                  className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {invitesSent && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          Stage 1 invites sent {new Date(invitesSent).toLocaleString("en-GB")}
          {setup.candidate_invite_sent_at && (
            <> · Candidate notified</>
          )}
          .
        </p>
      )}

      {invitesSent && (
        <section className="border border-amber-200 bg-amber-50 rounded-xl p-4">
          <h3 className="text-sm font-bold text-amber-900 mb-1">Panel forms</h3>
          {setup.stage1_forms_opened_at ? (
            <p className="text-xs text-amber-800">
              Panel members can access their forms — opened{" "}
              {new Date(setup.stage1_forms_opened_at).toLocaleString("en-GB")}.
            </p>
          ) : (
            <>
              <p className="text-xs text-amber-800 mb-3">
                Panel members&apos; links stay locked with a &quot;not open yet&quot; message
                until you open the forms — do this once the interview actually starts, not before.
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

      {!readOnly && invitesSent && (
        <button
          type="button"
          onClick={() => onContinueWithoutResend?.()}
          className="w-full py-2.5 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50"
        >
          Continue to HR Stage 1 form
        </button>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={onSendStage1Invites}
          disabled={isPending}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Mail className="w-4 h-4" />
          )}
          {invitesSent
            ? "Resend Stage 1 invites"
            : "Send Stage 1 invites & notify candidate"}
        </button>
      )}
    </div>
  );
}
