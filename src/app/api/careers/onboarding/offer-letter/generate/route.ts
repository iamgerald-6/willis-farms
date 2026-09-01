import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import type { JobApplication } from "@/lib/careers/types";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import { resolveOfferLetterContext } from "@/lib/careers/resolveOfferLetterContext";
import { validateOfferTerms } from "@/lib/careers/offerTerms";
import { formatMedicalReportsPlainText } from "@/lib/systemDefinitions/onboardingMedicalReports";
import { fetchModuleConfig } from "@/lib/systemDefinitions/getModuleConfig";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const OFFER_LETTER_TOOL = {
  name: "record_offer_letter",
  description: "Records the full body of a formal employment offer letter.",
  input_schema: {
    type: "object" as const,
    properties: {
      letter_body: {
        type: "string",
        description:
          "The complete offer letter body in plain text. Use double line breaks between paragraphs. Do not include the letterhead, date line, recipient address, subject line, or sign-off — only the letter body starting with a salutation (Dear …) through the paragraph before 'Yours sincerely'.",
      },
    },
    required: ["letter_body"],
  },
};

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 },
    );
  }

  const { application_id } = await req.json();
  if (!application_id) {
    return NextResponse.json({ error: "application_id is required." }, { status: 400 });
  }

  const { data: application, error: appError } = await supabaseAdmin
    .from("job_applications")
    .select("*")
    .eq("id", application_id)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  if (application.status !== "offer") {
    return NextResponse.json(
      { error: "Offer letters can only be generated for applicants on Offer status." },
      { status: 400 },
    );
  }

  try {
    const { data: submission } = await supabaseAdmin
      .from("onboarding_submissions")
      .select("hr_data")
      .eq("application_id", application_id)
      .maybeSingle();

    const hr = (submission?.hr_data ?? {}) as OnboardingHrData;

    const moduleConfig = await fetchModuleConfig(supabaseAdmin, RECRUITMENT_MODULE_ID);
    const gradeConfig = moduleConfig.businessLogic.gradeLevelsConfig;

    const termsValidation = validateOfferTerms(hr, gradeConfig);
    if (!hr.offer_terms_saved_at || !termsValidation.valid) {
      return NextResponse.json(
        {
          error:
            termsValidation.message ??
            "Save offer terms (role, salary, frequency, and placement) before generating the offer letter.",
        },
        { status: 400 },
      );
    }

    const ctx = await resolveOfferLetterContext(
      supabaseAdmin,
      application as JobApplication,
      hr,
    );

    const salaryLine = ctx.salaryDisplay
      ? `Gross salary: ${ctx.salaryDisplay}`
      : ctx.salaryGhs
        ? `Gross salary: GHS ${ctx.salaryGhs}`
        : ctx.salaryRange
          ? `Salary band: ${ctx.salaryRange}`
          : "Salary: to be confirmed in HR records";

    const placementLines = [
      ctx.employmentType ? `- Employment type: ${ctx.employmentType}` : "",
      ctx.department ? `- Department: ${ctx.department}` : "",
      ctx.workLocation ? `- Work location: ${ctx.workLocation}` : "",
    ].filter(Boolean);

    const medicalBlock = formatMedicalReportsPlainText(ctx.medicalReports);

    const prompt = [
      "Draft a formal employment offer letter body for Wills Farms Ltd., a professional genetics-led agribusiness in Ghana.",
      "",
      "IMPORTANT: This letter is for a NEW external candidate who has just been selected for hire. They are NOT yet an employee.",
      "Do NOT write as if they are already in the company. Do NOT mention probation periods, six-month reviews, or internal promotion language.",
      "",
      "Candidate details:",
      `- Name: ${ctx.candidateName}`,
      `- Role: ${ctx.roleTitle}`,
      `- Reference: ${ctx.referenceNumber}`,
      `- Email: ${ctx.candidateEmail}`,
      ctx.recommendedStartDate
        ? `- Proposed start date: ${ctx.recommendedStartDate}`
        : "- Proposed start date: to be agreed with HR",
      ctx.gradeLevel ? `- Grade level: ${ctx.gradeLevel}` : "",
      `- ${salaryLine}`,
      ctx.payFrequency ? `- Pay frequency: ${ctx.payFrequency}` : "",
      ...placementLines,
      "",
      "Required medical reports (must be listed clearly in the letter as pre-employment requirements before start):",
      medicalBlock || "Standard pre-employment medical clearance as directed by HR.",
      "",
      "Write in clear, professional British English suitable for a senior agribusiness employer.",
      "Include: warm congratulations, role title, gross salary amount in GHS, pay frequency, proposed start date,",
      "employment type and work location, required pre-employment medical reports, standard company policies reference,",
      "and invitation to accept via the onboarding link.",
      "Keep to roughly 350-550 words. Do not invent benefits not implied above.",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await anthropic.messages.create({
      model: TASK_MANAGER_AI_MODEL,
      max_tokens: 2048,
      tools: [OFFER_LETTER_TOOL],
      tool_choice: { type: "tool", name: "record_offer_letter" },
      messages: [{ role: "user", content: prompt }],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json({ error: "AI did not return an offer letter." }, { status: 502 });
    }

    const input = toolBlock.input as { letter_body?: string };
    const letterBody = input.letter_body?.trim();
    if (!letterBody) {
      return NextResponse.json({ error: "AI returned an empty offer letter." }, { status: 502 });
    }

    const now = new Date().toISOString();
    const nextHr: OnboardingHrData = {
      ...hr,
      offer_letter_draft: letterBody,
      offer_letter_generated_at: now,
    };

    await supabaseAdmin.from("onboarding_submissions").upsert(
      {
        application_id,
        form_data: {},
        hr_data: nextHr,
      },
      { onConflict: "application_id" },
    );

    return NextResponse.json({
      success: true,
      data: {
        offer_letter_draft: letterBody,
        context: {
          salary_ghs: ctx.salaryGhs ?? null,
          salary_range: ctx.salaryRange ?? null,
          grade_level: ctx.gradeLevel ?? null,
          pay_frequency: ctx.payFrequency ?? null,
          salary_display: ctx.salaryDisplay ?? null,
          employment_type: ctx.employmentType ?? null,
          department: ctx.department ?? null,
          work_location: ctx.workLocation ?? null,
          medical_reports: ctx.medicalReports,
        },
      },
    });
  } catch (err) {
    console.error("[POST /api/careers/onboarding/offer-letter/generate]", err);
    const message =
      err instanceof Error ? err.message : "Failed to generate offer letter.";
    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      {
        error: isDev
          ? message
          : "Failed to generate offer letter. Check server logs or try again.",
      },
      { status: 500 },
    );
  }
}
