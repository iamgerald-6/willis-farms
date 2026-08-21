"use client";

import { Loader2, Mail, Plus, Trash2 } from "lucide-react";
import type { InterviewFormData, PanelMember } from "@/lib/careers/types";
import { createPanelMember } from "@/lib/careers/panelInterview";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { StageInfoBanner } from "./shared";

type Props = {
  guide: InterviewGuideConfig;
  formData: InterviewFormData;
  onChange: (data: InterviewFormData) => void;
  onSendStage1Invites: () => void;
  onContinueWithoutResend?: () => void;
  isPending: boolean;
  readOnly?: boolean;
  /** Persists edited member name/email while readOnly, without resending invites. */
  onSaveMemberEdits?: () => void;
  isSavingMemberEdits?: boolean;
};

export default function PanelSetupStep({
  guide,
  formData,
  onChange,
  onSendStage1Invites,
  onContinueWithoutResend,
  isPending,
  readOnly = false,
  onSaveMemberEdits,
  isSavingMemberEdits = false,
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

  const toLocalDatetime = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

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
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          Viewing Stage 1 panel setup. The interview date, location, and panel list are locked —
          you can still fix a panel member&apos;s name or email below.
        </p>
      )}

      <section className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
        <h3 className="text-sm font-bold text-gray-900 mb-1">Stage 1 — Add panel</h3>
        <p className="text-xs text-gray-500 mb-4">
          Panel members score screening and structured questions independently. HR also completes a Stage 1 form.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Stage 1 interview start *
            </label>
            <input
              type="datetime-local"
              value={toLocalDatetime(setup.interview_start_at)}
              disabled={readOnly}
              onChange={(e) => {
                const val = e.target.value;
                onChange({
                  ...formData,
                  setup: {
                    ...setup,
                    interview_start_at: val
                      ? new Date(val).toISOString()
                      : undefined,
                  },
                });
              }}
              className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white ${readOnly ? "opacity-60" : ""}`}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Location</label>
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
                onChange={(e) => updateMember(index, "name", e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="email"
                placeholder="Email *"
                value={member.email}
                onChange={(e) => updateMember(index, "email", e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
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

      {readOnly && onSaveMemberEdits && (
        <button
          type="button"
          onClick={onSaveMemberEdits}
          disabled={isSavingMemberEdits}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
        >
          {isSavingMemberEdits ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : null}
          Save name/email changes
        </button>
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
