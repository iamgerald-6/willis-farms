"use client";

import { Loader2, Mail, Plus, Trash2 } from "lucide-react";
import type { InterviewFormData, PanelMember } from "@/lib/careers/types";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { StageInfoBanner } from "./shared";

type Props = {
  guide: InterviewGuideConfig;
  formData: InterviewFormData;
  onChange: (data: InterviewFormData) => void;
  onSendInvites: () => void;
  onContinueWithoutResend?: () => void;
  isPending: boolean;
};

export default function PanelSetupStep({
  guide,
  formData,
  onChange,
  onSendInvites,
  onContinueWithoutResend,
  isPending,
}: Props) {
  const setup = formData.setup ?? { members: [{ name: "", email: "" }] };
  const members = setup.members?.length
    ? setup.members
    : [{ name: "", email: "" }];

  const updateMember = (index: number, field: keyof PanelMember, value: string) => {
    const next = members.map((m, i) =>
      i === index ? { ...m, [field]: value } : m,
    );
    onChange({
      ...formData,
      setup: { ...setup, members: next },
    });
  };

  const addMember = () => {
    onChange({
      ...formData,
      setup: { ...setup, members: [...members, { name: "", email: "" }] },
    });
  };

  const removeMember = (index: number) => {
    if (members.length <= 1) return;
    onChange({
      ...formData,
      setup: {
        ...setup,
        members: members.filter((_, i) => i !== index),
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

  return (
    <div className="space-y-6">
      <StageInfoBanner
        title="Panel setup"
        duration="Before Stage 1"
        briefing="Configure the interview panel and send calendar invites before opening the staged guide. Panel details are kept separate from scoring stages."
        recommendedPanel={guide.recommendedPanel}
        totalDuration={guide.duration}
      />

      <section>
        <h3 className="text-sm font-bold text-gray-900 mb-3">
          Interview schedule
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Interview start date & time *
            </label>
            <input
              type="datetime-local"
              value={toLocalDatetime(setup.interview_start_at)}
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Location</label>
            <input
              type="text"
              placeholder="Farm office / barn meeting room"
              value={setup.location ?? ""}
              onChange={(e) =>
                onChange({
                  ...formData,
                  setup: { ...setup, location: e.target.value },
                })
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900">Panel members</h3>
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
          {members.map((member, index) => (
            <div
              key={index}
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
                disabled={members.length <= 1}
                className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Each panel member receives an email with a link to this interview session
          in WillsOne.
        </p>
      </section>

      {setup.invites_sent_at && (
        <>
          <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            Invites sent{" "}
            {new Date(setup.invites_sent_at).toLocaleString("en-GB")}.
          </p>
          <button
            type="button"
            onClick={() => onContinueWithoutResend?.()}
            className="w-full py-2.5 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50"
          >
            Continue to Stage 1
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onSendInvites}
        disabled={isPending}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Mail className="w-4 h-4" />
        )}
        {setup.invites_sent_at ? "Resend invites & continue" : "Send invites & begin Stage 1"}
      </button>
    </div>
  );
}
