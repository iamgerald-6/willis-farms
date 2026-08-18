"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  computeWeightedScore,
  type InterviewGuideConfig,
} from "@/lib/careers/interviewFormConfigs";
import {
  interviewWorkflowStep,
  normalizeInterviewFormData,
  type InterviewFormData,
} from "@/lib/careers/types";
import { Loader2, Save, X } from "lucide-react";
import { ListRowsSkeleton } from "@/components/skeletons/PageSkeletons";
import { toast } from "sonner";
import PanelSetupStep from "./interview/PanelSetupStep";
import Stage1ScreeningQuestions from "./interview/Stage1ScreeningQuestions";
import Stage2Practical from "./interview/Stage2Practical";
import Stage3Evaluation from "./interview/Stage3Evaluation";
import { StepIndicator } from "./interview/shared";

type Props = {
  applicationId: string;
  adminId: string;
  onClose: () => void;
  onSaved: () => void;
  onInterviewSubmitted?: () => void;
};

type InterviewAction =
  | "save_draft"
  | "send_panel_invites"
  | "schedule_stage2"
  | "complete_stage2"
  | "finalize";

function emptyForm(): InterviewFormData {
  return normalizeInterviewFormData(null);
}

export default function InterviewPanelForm({
  applicationId,
  adminId,
  onClose,
  onSaved,
  onInterviewSubmitted,
}: Props) {
  const [formData, setFormData] = useState<InterviewFormData>(emptyForm());
  const [guide, setGuide] = useState<InterviewGuideConfig | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [interviewSubmitted, setInterviewSubmitted] = useState(false);
  const [manualStep, setManualStep] = useState<"panel" | 1 | 2 | 3 | null>(
    null,
  );

  const { isLoading, refetch } = useQuery({
    queryKey: ["interview_guide", applicationId],
    queryFn: async () => {
      const res = await api.get(
        `/careers/interview?application_id=${applicationId}`,
      );
      const { application, guide: g } = res.data.data;
      setCandidateName(application.full_name);
      setReferenceNumber(application.reference_number);
      setInterviewSubmitted(!!application.interview_submitted_at);
      setGuide(g);
      setFormData(normalizeInterviewFormData(application.interview_form_data));
      return res.data.data;
    },
  });

  const workflowStep = interviewWorkflowStep(formData);
  const activeStep = manualStep ?? workflowStep;

  const scores = useMemo(() => {
    if (!guide) return { areaScores: {}, total: null };
    return computeWeightedScore(
      guide,
      formData.question_ratings ?? {},
      formData.scenario_ratings ?? {},
    );
  }, [guide, formData.question_ratings, formData.scenario_ratings]);

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      summary: {
        ...prev.summary,
        area_scores: scores.areaScores,
        total_weighted: scores.total,
      },
    }));
  }, [scores.areaScores, scores.total]);

  const saveMutation = useMutation({
    mutationFn: (params: {
      action: InterviewAction;
      data?: InterviewFormData;
      stage2_scheduled_at?: string;
    }) =>
      api.post("/careers/interview", {
        application_id: applicationId,
        interview_form_data: params.data ?? formData,
        submitted_by: adminId,
        action: params.action,
        stage2_scheduled_at: params.stage2_scheduled_at,
      }),
    onSuccess: (res, params) => {
      const updated = normalizeInterviewFormData(
        res.data.data.interview_form_data,
      );
      setFormData(updated);
      setManualStep(null);

      const warnings = res.data.email_warnings as string[] | undefined;
      if (warnings?.length) {
        toast.warning(`Saved, but: ${warnings.join("; ")}`);
      }

      if (params.action === "send_panel_invites") {
        toast.success(
          "Panel invites sent and candidate notified. Stage 1 is now open.",
        );
        setManualStep(1);
      } else if (params.action === "schedule_stage2") {
        toast.success("Practical scheduled. Stage 2 is now open.");
        setManualStep(2);
      } else if (params.action === "complete_stage2") {
        toast.success("Stage 2 complete. Proceed to evaluation.");
        setManualStep(3);
      } else if (params.action === "finalize") {
        toast.success(
          "Interview submitted. Confirm the outcome from the application detail.",
        );
        setInterviewSubmitted(true);
        onInterviewSubmitted?.();
      } else {
        toast.success("Draft saved.");
      }

      refetch();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Save failed.");
    },
  });

  const stepLabels = ["Panel", "Stage 1", "Stage 2", "Evaluation"] as [
    string,
    string,
    string,
    string,
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl max-h-[95vh] flex flex-col">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex flex-col gap-3 shrink-0 z-10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                Internal — panel use only
              </p>
              <h2 className="text-lg font-bold text-gray-900 mt-1">
                {guide?.title ?? "Interview guide"}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {candidateName} · Ref {referenceNumber}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {!isLoading && guide && (
            <StepIndicator current={activeStep} labels={stepLabels} />
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {isLoading || !guide ? (
            <ListRowsSkeleton rows={4} />
          ) : activeStep === "panel" ? (
            <PanelSetupStep
              guide={guide}
              formData={formData}
              onChange={setFormData}
              onSendInvites={() =>
                saveMutation.mutate({
                  action: "send_panel_invites",
                  data: formData,
                })
              }
              onContinueWithoutResend={() => setManualStep(1)}
              isPending={saveMutation.isPending}
            />
          ) : activeStep === 1 ? (
            <Stage1ScreeningQuestions
              guide={guide}
              formData={formData}
              onChange={setFormData}
              onSaveDraft={() =>
                saveMutation.mutate({ action: "save_draft", data: formData })
              }
              onScheduleStage2={(scheduledAt) =>
                saveMutation.mutate({
                  action: "schedule_stage2",
                  data: formData,
                  stage2_scheduled_at: scheduledAt,
                })
              }
              isPending={saveMutation.isPending}
            />
          ) : activeStep === 2 ? (
            <Stage2Practical
              guide={guide}
              formData={formData}
              onChange={setFormData}
              onSaveDraft={() =>
                saveMutation.mutate({ action: "save_draft", data: formData })
              }
              onComplete={() =>
                saveMutation.mutate({
                  action: "complete_stage2",
                  data: formData,
                })
              }
              isPending={saveMutation.isPending}
            />
          ) : (
            <Stage3Evaluation
              guide={guide}
              formData={formData}
              scores={scores}
              onChange={setFormData}
              readOnly={interviewSubmitted}
            />
          )}
        </div>

        {activeStep === 3 && !interviewSubmitted && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex flex-col sm:flex-row gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                saveMutation.mutate({ action: "save_draft", data: formData })
              }
              disabled={saveMutation.isPending || isLoading}
              className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              Save draft
            </button>
            <button
              type="button"
              onClick={() =>
                saveMutation.mutate({ action: "finalize", data: formData })
              }
              disabled={saveMutation.isPending || isLoading}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
            >
              {saveMutation.isPending ? "Submitting…" : "Submit interview"}
            </button>
          </div>
        )}

        {activeStep === 3 && interviewSubmitted && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 shrink-0">
            <p className="text-sm text-gray-600 text-center">
              Interview submitted. Confirm the outcome from the application detail view.
            </p>
          </div>
        )}

        {(activeStep === 1 || activeStep === 2) && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-3 shrink-0">
            <div className="flex gap-2 text-xs">
              {activeStep !== 1 && (
                <button
                  type="button"
                  onClick={() => setManualStep(1)}
                  className="text-red-600 hover:underline"
                >
                  ← Stage 1
                </button>
              )}
              {formData.stage1_completed_at && activeStep !== 2 && (
                <button
                  type="button"
                  onClick={() => setManualStep(2)}
                  className="text-red-600 hover:underline"
                >
                  Stage 2
                </button>
              )}
              {formData.stage2_completed_at && (
                <button
                  type="button"
                  onClick={() => setManualStep(3)}
                  className="text-red-600 hover:underline ml-auto"
                >
                  Evaluation →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
