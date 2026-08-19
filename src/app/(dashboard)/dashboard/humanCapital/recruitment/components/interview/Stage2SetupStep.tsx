"use client";

import { useEffect } from "react";
import { Loader2, Mail, Plus, Trash2 } from "lucide-react";
import type { InterviewFormData, PanelMember } from "@/lib/careers/types";
import { createPanelMember } from "@/lib/careers/panelInterview";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { stageMembers } from "@/lib/careers/panelInterview";
import { StageInfoBanner } from "./shared";

type Props = {
  guide: InterviewGuideConfig;
  formData: InterviewFormData;
  onChange: (data: InterviewFormData) => void;
  onSendStage2Invites: (scheduledAt: string) => void;
  isPending: boolean;
};

function toLocalDatetime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Stage2SetupStep({
  guide,
  formData,
  onChange,
  onSendStage2Invites,
  isPending,
}: Props) {
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

      <section className="border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-1">Stage 2 — Add panel</h3>
        <p className="text-xs text-gray-500 mb-4">
          Pre-filled from Stage 1. You can add additional panel members for the practical assessment.
        </p>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Stage 2 practical date & time *
            </label>
            <input
              type="datetime-local"
              value={toLocalDatetime(scheduledAt)}
              onChange={(e) => {
                const val = e.target.value;
                const iso = val ? new Date(val).toISOString() : "";
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Location *</label>
            <input
              type="text"
              placeholder="Practical assessment location"
              value={setup.stage2_location ?? setup.location ?? ""}
              onChange={(e) =>
                onChange({
                  ...formData,
                  setup: { ...setup, stage2_location: e.target.value },
                })
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Stage 2 panel
          </span>
          <button
            type="button"
            onClick={addMember}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            Add member
          </button>
        </div>

        <div className="space-y-3">
          {stage2Members.map((member, index) => (
            <div
              key={member.id || index}
              className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-start border border-gray-100 rounded-xl p-3"
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
              <button
                type="button"
                onClick={() => removeMember(index)}
                className="p-2 text-gray-400 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
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
    </div>
  );
}
