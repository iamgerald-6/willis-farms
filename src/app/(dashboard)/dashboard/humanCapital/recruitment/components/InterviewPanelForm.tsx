"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { InterviewGuideConfig } from "@/lib/careers/interviewFormConfigs";
import { DEFAULT_INTERVIEW_EVALUATION_LABELS } from "@/lib/systemDefinitions/interviewEvaluationConfig";
import {
  combinedAreaScores,
  combinedInterviewAverage,
  interviewWorkflowStepV2,
  stage1ReadyForReview,
  stage2ReadyForEvaluation,
  type WorkflowStep,
} from "@/lib/careers/panelInterview";
import {
  normalizeInterviewFormData,
  type InterviewFormData,
  type StageSubmissionData,
} from "@/lib/careers/types";
import { Clock3, Loader2, Save, X } from "lucide-react";
import { ListRowsSkeleton } from "@/components/skeletons/PageSkeletons";
import { toast } from "sonner";
import PanelSetupStep from "./interview/PanelSetupStep";
import Stage1ScreeningQuestions from "./interview/Stage1ScreeningQuestions";
import Stage1ReviewStep from "./interview/Stage1ReviewStep";
import Stage2SetupStep from "./interview/Stage2SetupStep";
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
  | "open_panel_forms"
  | "send_stage2_invites"
  | "open_stage2_panel_forms"
  | "submit_hr_stage1"
  | "submit_hr_stage2"
  | "stage1_review_pass"
  | "stage1_review_reject"
  | "finalize"
  | "reschedule_stage1"
  | "reschedule_stage2";

const STEP_LABELS: Record<WorkflowStep, string> = {
  panel: "Stage 1 setup",
  stage1: "Stage 1",
  stage1_review: "Review",
  stage2_setup: "Stage 2 setup",
  stage2: "Stage 2",
  evaluation: "Stage 3 Evaluation",
};

const STEP_ORDER: WorkflowStep[] = [
  "panel",
  "stage1",
  "stage1_review",
  "stage2_setup",
  "stage2",
  "evaluation",
];

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
  const [evaluationLabels, setEvaluationLabels] = useState(
    DEFAULT_INTERVIEW_EVALUATION_LABELS,
  );
  const [candidateName, setCandidateName] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [interviewSubmitted, setInterviewSubmitted] = useState(false);
  const [manualStep, setManualStep] = useState<WorkflowStep | null>(null);

  const { isLoading, refetch } = useQuery({
    queryKey: ["interview_guide", applicationId],
    queryFn: async () => {
      const res = await api.get(
        `/careers/interview?application_id=${applicationId}`,
      );
      const { application, guide: g, evaluationLabels: labels } = res.data.data;
      setCandidateName(application.full_name);
      setReferenceNumber(application.reference_number);
      setInterviewSubmitted(!!application.interview_submitted_at);
      setGuide(g);
      setEvaluationLabels(labels ?? DEFAULT_INTERVIEW_EVALUATION_LABELS);
      setFormData(normalizeInterviewFormData(application.interview_form_data));
      return res.data.data;
    },
  });

  const workflowStep = interviewWorkflowStepV2(formData);
  const activeStep = manualStep ?? workflowStep;
  const currentIdx = STEP_ORDER.indexOf(workflowStep);
  const activeIdx = STEP_ORDER.indexOf(activeStep);
  /** Viewing an earlier, already-completed step rather than the live one. */
  const rawIsPastStep = activeIdx < currentIdx;
  // The Stage 1 and Stage 2 panel setup steps stay fully editable — even
  // while viewing them "in the past" from a later step — until that stage is
  // actually done (HR's form plus every panel member's submission). Every
  // other step keeps the normal past-step rule.
  const stage1PanelLocked = stage1ReadyForReview(formData);
  const stage2PanelLocked = stage2ReadyForEvaluation(formData);
  const isPastStep =
    activeStep === "panel"
      ? stage1PanelLocked && rawIsPastStep
      : activeStep === "stage2_setup"
        ? stage2PanelLocked && rawIsPastStep
        : rawIsPastStep;

  // Once HR opens a stage's panel forms, its setup fields (date, location,
  // panel member list) lock — editing them mid-interview (or after
  // members have started submitting) would silently invalidate whatever
  // members already filled in. "Reschedule" is the deliberate escape
  // hatch: it clears that stage's forms-opened flag and un-submits any
  // panel member/HR submissions already collected (their answers stay
  // intact — they just become editable again rather than starting over),
  // then hands editing back on the setup fields. Only available while at
  // least one grader for that stage hasn't submitted yet — once everyone
  // has (stage1PanelLocked / stage2PanelLocked), the stage is done and
  // reschedule is no longer offered.
  const stage1FormsLocked = !!formData.setup?.stage1_forms_opened_at;
  const stage2FormsLocked = !!formData.setup?.stage2_forms_opened_at;
  const canRescheduleStage1 = stage1FormsLocked && !stage1PanelLocked;
  const canRescheduleStage2 = stage2FormsLocked && !stage2PanelLocked;

  const combinedScore = useMemo(() => {
    if (!guide) return null;
    return combinedInterviewAverage(formData, guide);
  }, [guide, formData]);

  useEffect(() => {
    if (combinedScore == null) return;
    setFormData((prev) => ({
      ...prev,
      summary: {
        ...prev.summary,
        total_weighted: combinedScore,
        stage1_average: prev.summary?.stage1_average,
        stage2_average: prev.summary?.stage2_average,
      },
    }));
  }, [combinedScore]);

  // Memoized so the fallback object keeps a stable identity across
  // unrelated re-renders — otherwise a fresh `{}` literal every render
  // would look like a "change" to the autosave effect below and fire it
  // even when HR hasn't typed anything yet.
  const hrStage1: StageSubmissionData = useMemo(
    () => formData.hr_submission?.stage1 ?? { screening: {}, question_ratings: {} },
    [formData.hr_submission?.stage1],
  );

  const hrStage2: StageSubmissionData = useMemo(
    () => formData.hr_submission?.stage2 ?? { scenario_ratings: {} },
    [formData.hr_submission?.stage2],
  );

  const setHrStage1 = (stage1: StageSubmissionData) => {
    setFormData((prev) => ({
      ...prev,
      hr_submission: { ...prev.hr_submission, stage1 },
    }));
  };

  const setHrStage2 = (stage2: StageSubmissionData) => {
    setFormData((prev) => ({
      ...prev,
      hr_submission: { ...prev.hr_submission, stage2 },
    }));
  };

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

      // "Open panel forms now" (Stage 1 and Stage 2) unlocks the actual
      // fillable form for panel members and HR — it should land the user
      // straight on that form, not close the window. onSaved() bubbles up
      // to the parent's setSelected(null), which unmounts this whole
      // component along with the application detail view it lives in, so
      // these two actions deliberately skip it and just refetch instead.
      if (params.action === "open_panel_forms") {
        toast.success("Panel forms opened — members can now access their evaluation forms.");
        setManualStep("panel");
        refetch();
        return;
      }
      if (params.action === "open_stage2_panel_forms") {
        toast.success("Panel forms opened — members can now access their evaluation forms.");
        setManualStep("stage2_setup");
        refetch();
        return;
      }
      // Same reasoning as the two "open panel forms" actions above —
      // rescheduling should land HR back on the (now editable) setup
      // screen to fix the date/panel, not close the whole application view.
      if (params.action === "reschedule_stage1") {
        toast.success("Stage 1 reset — update the details and resend invites when ready.");
        setManualStep("panel");
        refetch();
        return;
      }
      if (params.action === "reschedule_stage2") {
        toast.success("Stage 2 reset — update the details and resend invites when ready.");
        setManualStep("stage2_setup");
        refetch();
        return;
      }

      if (params.action === "send_panel_invites") {
        toast.success("Stage 1 panel invites sent.");
        setManualStep("stage1");
      } else if (params.action === "send_stage2_invites") {
        toast.success("Stage 2 invites sent.");
        setManualStep("stage2");
      } else if (params.action === "submit_hr_stage1") {
        toast.success("HR Stage 1 submitted.");
        setManualStep("stage1_review");
      } else if (params.action === "submit_hr_stage2") {
        toast.success("HR Stage 2 submitted.");
        setManualStep("evaluation");
      } else if (params.action === "stage1_review_pass") {
        toast.success("Candidate passed Stage 1 review.");
        setManualStep("stage2_setup");
      } else if (params.action === "stage1_review_reject") {
        toast.success("Candidate rejected at Stage 1.");
        onInterviewSubmitted?.();
      } else if (params.action === "finalize") {
        toast.success(
          "Evaluation submitted. Review results in the application view and confirm an outcome when ready.",
        );
        setInterviewSubmitted(true);
        onInterviewSubmitted?.();
      } else {
        toast.success("Draft saved.");
      }

      refetch();
      onSaved();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "Save failed.");
    },
  });

  // Silently persists HR's in-progress work — Stage 1 / Stage 2 evaluation
  // answers, and the Panel setup / Stage 2 setup fields (interview date,
  // location, panel member names/emails) — a couple seconds after they
  // stop editing, so leaving the page or the tab closing doesn't erase
  // progress the way it would if HR had to remember to click "Save draft"
  // or "Send invites" first. Deliberately its own mutation, separate from
  // saveMutation — that one's onSuccess resets manualStep and calls
  // onSaved(), which closes the whole application detail view (see the
  // "open panel forms" fix above); an autosave firing mid-edit must never
  // do that.
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const autosaveMutation = useMutation({
    mutationFn: (data: InterviewFormData) =>
      api.post("/careers/interview", {
        application_id: applicationId,
        interview_form_data: data,
        submitted_by: adminId,
        action: "save_draft",
      }),
    onSuccess: () => setAutosaveStatus("saved"),
    onError: () => setAutosaveStatus("idle"),
  });

  const skipHrStage1AutosaveRef = useRef(true);
  useEffect(() => {
    if (isLoading || hrStage1.submitted_at) return;
    if (skipHrStage1AutosaveRef.current) {
      skipHrStage1AutosaveRef.current = false;
      return;
    }
    setAutosaveStatus("saving");
    const timer = setTimeout(() => {
      autosaveMutation.mutate({
        ...formData,
        hr_submission: { ...formData.hr_submission, stage1: hrStage1 },
      });
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hrStage1]);

  const skipHrStage2AutosaveRef = useRef(true);
  useEffect(() => {
    if (isLoading || hrStage2.submitted_at) return;
    if (skipHrStage2AutosaveRef.current) {
      skipHrStage2AutosaveRef.current = false;
      return;
    }
    setAutosaveStatus("saving");
    const timer = setTimeout(() => {
      autosaveMutation.mutate({
        ...formData,
        hr_submission: { ...formData.hr_submission, stage2: hrStage2 },
      });
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hrStage2]);

  const skipSetupAutosaveRef = useRef(true);
  useEffect(() => {
    const isSetupStep = activeStep === "panel" || activeStep === "stage2_setup";
    if (isLoading || !isSetupStep || isPastStep) return;
    if (skipSetupAutosaveRef.current) {
      skipSetupAutosaveRef.current = false;
      return;
    }
    setAutosaveStatus("saving");
    const timer = setTimeout(() => {
      autosaveMutation.mutate(formData);
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.setup]);

  const analysisMutation = useMutation({
    mutationFn: () =>
      api.post("/careers/interview/stage1-analysis", {
        application_id: applicationId,
      }),
    onSuccess: (res) => {
      setFormData(
        normalizeInterviewFormData(res.data.data.interview_form_data),
      );
      toast.success("AI analysis ready.");
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "AI analysis failed.");
    },
  });

  const finalAnalysisMutation = useMutation({
    // The AI reads the critical concerns checklist from the database, not
    // from this component's local state — save the current checklist
    // first so "Generate" (only enabled once every item is answered) is
    // guaranteed to analyze exactly what's on screen, even if HR never
    // clicked "Save draft" themselves.
    mutationFn: async () => {
      await autosaveMutation.mutateAsync(formData);
      return api.post("/careers/interview/final-analysis", {
        application_id: applicationId,
      });
    },
    onSuccess: (res) => {
      setFormData(
        normalizeInterviewFormData(res.data.data.interview_form_data),
      );
      toast.success("AI analysis ready.");
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error?.response?.data?.error ?? "AI analysis failed.");
    },
  });

  // Per-area figures for the Evaluation step's Combined scores table — see
  // combinedAreaScores() for how each area is averaged across every grader.
  // formData.summary.area_scores is never populated by anything, so reading
  // it directly (as this used to) always showed an empty column.
  const evaluationScores = {
    areaScores: guide ? combinedAreaScores(formData, guide) : {},
    total: combinedScore,
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl max-h-[95vh] flex flex-col">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex flex-col gap-3 shrink-0 z-10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                HR — interview management
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
            <StepIndicator
              steps={STEP_ORDER}
              current={activeStep}
              labels={STEP_ORDER.map((s) => STEP_LABELS[s])}
              maxIndex={currentIdx}
              onStepClick={(step) =>
                setManualStep(step === workflowStep ? null : step)
              }
              isStepDone={(step, _i, defaultDone) =>
                step === "evaluation" ? interviewSubmitted : defaultDone
              }
            />
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {isPastStep && (
            <div className="mt-4 flex items-center justify-between gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
              <p className="text-xs text-amber-800">
                Viewing a completed step — read-only.
              </p>
              <button
                type="button"
                onClick={() => setManualStep(null)}
                className="text-xs font-medium text-amber-900 underline underline-offset-2 shrink-0"
              >
                Return to current step
              </button>
            </div>
          )}
          {isLoading || !guide ? (
            <ListRowsSkeleton rows={4} />
          ) : activeStep === "panel" ? (
            <PanelSetupStep
              guide={guide}
              formData={formData}
              onChange={setFormData}
              onSendStage1Invites={() =>
                saveMutation.mutate({
                  action: "send_panel_invites",
                  data: formData,
                })
              }
              onContinueWithoutResend={() => setManualStep("stage1")}
              isPending={saveMutation.isPending}
              readOnly={isPastStep || stage1FormsLocked}
              onOpenPanelForms={() =>
                saveMutation.mutate({
                  action: "open_panel_forms",
                  data: formData,
                })
              }
              isOpeningPanelForms={saveMutation.isPending}
              saveStatus={autosaveStatus}
              canReschedule={canRescheduleStage1}
              onReschedule={() =>
                saveMutation.mutate({
                  action: "reschedule_stage1",
                  data: formData,
                })
              }
              isRescheduling={saveMutation.isPending}
            />
          ) : activeStep === "stage1" &&
            !formData.setup?.stage1_forms_opened_at &&
            !hrStage1.submitted_at ? (
            <FormsNotOpenNotice stage={1} onGoToSetup={() => setManualStep("panel")} />
          ) : activeStep === "stage1" ? (
            <Stage1ScreeningQuestions
              guide={guide}
              submission={hrStage1}
              onChange={setHrStage1}
              submitted={!!hrStage1.submitted_at}
              onSaveDraft={() =>
                saveMutation.mutate({
                  action: "save_draft",
                  data: {
                    ...formData,
                    hr_submission: {
                      ...formData.hr_submission,
                      stage1: hrStage1,
                    },
                  },
                })
              }
              onSubmit={() =>
                saveMutation.mutate({
                  action: "submit_hr_stage1",
                  data: {
                    ...formData,
                    hr_submission: {
                      ...formData.hr_submission,
                      stage1: hrStage1,
                    },
                  },
                })
              }
              isPending={saveMutation.isPending}
              saveStatus={autosaveStatus}
            />
          ) : activeStep === "stage1_review" ? (
            <Stage1ReviewStep
              guide={guide}
              formData={formData}
              readOnly={!!formData.stage1_review?.reviewed_at || isPastStep}
              onPass={() =>
                saveMutation.mutate({
                  action: "stage1_review_pass",
                  data: formData,
                })
              }
              onReject={() =>
                saveMutation.mutate({
                  action: "stage1_review_reject",
                  data: formData,
                })
              }
              isPending={saveMutation.isPending}
              onGenerateAnalysis={() => analysisMutation.mutate()}
              isGeneratingAnalysis={analysisMutation.isPending}
            />
          ) : activeStep === "stage2_setup" ? (
            <Stage2SetupStep
              guide={guide}
              formData={formData}
              onChange={setFormData}
              onSendStage2Invites={(scheduledAt) =>
                saveMutation.mutate({
                  action: "send_stage2_invites",
                  data: formData,
                  stage2_scheduled_at: scheduledAt,
                })
              }
              isPending={saveMutation.isPending}
              readOnly={isPastStep || stage2FormsLocked}
              onOpenPanelForms={() =>
                saveMutation.mutate({
                  action: "open_stage2_panel_forms",
                  data: formData,
                })
              }
              isOpeningPanelForms={saveMutation.isPending}
              onContinueToStage2Form={() => setManualStep("stage2")}
              saveStatus={autosaveStatus}
              canReschedule={canRescheduleStage2}
              onReschedule={() =>
                saveMutation.mutate({
                  action: "reschedule_stage2",
                  data: formData,
                })
              }
              isRescheduling={saveMutation.isPending}
            />
          ) : activeStep === "stage2" &&
            !formData.setup?.stage2_forms_opened_at &&
            !hrStage2.submitted_at ? (
            <FormsNotOpenNotice stage={2} onGoToSetup={() => setManualStep("stage2_setup")} />
          ) : activeStep === "stage2" ? (
            <Stage2Practical
              guide={guide}
              submission={hrStage2}
              scheduledAt={
                formData.stage2_scheduled_at ??
                formData.setup?.stage2_scheduled_at
              }
              location={
                formData.setup?.stage2_location ?? formData.setup?.location
              }
              onChange={setHrStage2}
              submitted={!!hrStage2.submitted_at}
              onSaveDraft={() =>
                saveMutation.mutate({
                  action: "save_draft",
                  data: {
                    ...formData,
                    hr_submission: {
                      ...formData.hr_submission,
                      stage2: hrStage2,
                    },
                  },
                })
              }
              onSubmit={() =>
                saveMutation.mutate({
                  action: "submit_hr_stage2",
                  data: {
                    ...formData,
                    hr_submission: {
                      ...formData.hr_submission,
                      stage2: hrStage2,
                    },
                  },
                })
              }
              isPending={saveMutation.isPending}
              saveStatus={autosaveStatus}
            />
          ) : (
            <Stage3Evaluation
              guide={guide}
              formData={formData}
              scores={evaluationScores}
              onChange={setFormData}
              readOnly={interviewSubmitted}
              evaluationLabels={evaluationLabels}
              onGenerateAnalysis={() => finalAnalysisMutation.mutate()}
              isGeneratingAnalysis={finalAnalysisMutation.isPending}
            />
          )}
        </div>

        {activeStep === "evaluation" && !interviewSubmitted && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex flex-col gap-2 shrink-0">
            {!formData.summary?.ai_analysis && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Generate the AI analysis above before finishing.
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
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
                disabled={
                  saveMutation.isPending || isLoading || !formData.summary?.ai_analysis
                }
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
              >
                {saveMutation.isPending ? "Submitting…" : "Finish"}
              </button>
            </div>
          </div>
        )}

        {activeStep === "evaluation" && interviewSubmitted && (
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 shrink-0">
            <p className="text-sm text-gray-600 text-center">
              Evaluation submitted. Review results in the application view,
              discuss as a team, then confirm hire, hold, or reject.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Same "not open yet" gate as the panel members' own links — HR's own
// scoring form is blocked too, so nobody (including HR) can fill anything
// in before the interview actually starts.
function FormsNotOpenNotice({
  stage,
  onGoToSetup,
}: {
  stage: 1 | 2;
  onGoToSetup: () => void;
}) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex gap-3">
      <Clock3 className="w-6 h-6 text-amber-600 shrink-0" />
      <div>
        <p className="font-semibold text-amber-900">
          Stage {stage} forms are not open yet.
        </p>
        <p className="text-sm text-amber-800 mt-1">
          Nobody — including HR — can fill in Stage {stage} scores until you
          open the forms from Panel setup, once the interview actually
          starts.
        </p>
        <button
          type="button"
          onClick={onGoToSetup}
          className="mt-3 text-sm font-medium text-amber-900 underline underline-offset-2"
        >
          Go to Stage {stage} panel setup
        </button>
      </div>
    </div>
  );
}
