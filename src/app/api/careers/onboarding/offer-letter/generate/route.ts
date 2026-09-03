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
          "The complete offer letter body in plain text, following the exact section structure and labels given in the prompt. Use double line breaks between sections/paragraphs, and single line breaks within a section (e.g. between the labelled lines under 'Position Details:'). Do not include the letterhead, date line, recipient address, subject line, or sign-off — only the letter body starting with a salutation (Dear …) through the paragraph before 'Yours sincerely'. Never invent a fact that was not given to you — if a value was not supplied, write exactly \"[HR TO COMPLETE]\" in its place.",
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
      .select("hr_data, form_data")
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

    let keyResponsibilitiesSource: string | null = null;
    const jobPostingId = (application as JobApplication).job_posting_id;
    if (jobPostingId) {
      const { data: postingRow } = await supabaseAdmin
        .from("job_postings")
        .select("key_responsibilities")
        .eq("id", jobPostingId)
        .maybeSingle();
      keyResponsibilitiesSource = postingRow?.key_responsibilities?.trim() || null;
    }

    const startDate = ctx.recommendedStartDate || "[HR TO COMPLETE]";
    const salaryLine = ctx.salaryDisplay
      ? ctx.salaryDisplay
      : ctx.salaryGhs
        ? `GHS ${ctx.salaryGhs}`
        : "[HR TO COMPLETE]";

    const medicalBlock = formatMedicalReportsPlainText(ctx.medicalReports);

    const facts = [
      `- Candidate name: ${ctx.candidateName}`,
      `- Position: ${ctx.roleTitle}`,
      `- Start date: ${startDate}`,
      `- Reporting to: ${ctx.reportingTo || "[HR TO COMPLETE]"}`,
      `- Work location: ${ctx.workLocation || "[HR TO COMPLETE]"}`,
      `- Gross salary: ${salaryLine}`,
      `- Pay frequency: ${ctx.payFrequency || "[HR TO COMPLETE]"}`,
      `- Working hours: ${ctx.workingHours || "[HR TO COMPLETE]"}`,
      `- Notice period (for termination clause): ${ctx.noticePeriod || "[HR TO COMPLETE]"}`,
      `- Offer acceptance deadline: ${ctx.acceptanceDeadline || "[HR TO COMPLETE]"}`,
      ctx.employmentType ? `- Employment type: ${ctx.employmentType}` : "",
      ctx.department ? `- Department: ${ctx.department}` : "",
    ].filter(Boolean);

    const prompt = [
      "Draft a formal employment offer letter body for Wills Farms Ltd., a professional genetics-led agribusiness in Ghana.",
      "",
      "IMPORTANT: This letter is for a NEW external candidate who has just been selected for hire. They are NOT yet an employee.",
      "Do NOT write as if they are already in the company. Do NOT mention probation periods, six-month reviews, or internal promotion language.",
      "",
      "CRITICAL: Every fact you need is listed below. Use these values exactly as given — do not reword, compute, or invent numbers, dates, or names.",
      "If a value below reads \"[HR TO COMPLETE]\", write that exact placeholder text in the letter at that spot instead of guessing — never make one up.",
      "",
      "Known facts:",
      ...facts,
      "",
      "Required medical reports (list clearly as pre-employment requirements before start):",
      medicalBlock || "Standard pre-employment medical clearance as directed by HR.",
      "",
      keyResponsibilitiesSource
        ? `Key responsibilities for this role, taken from the job posting (reformat into a clean bulleted list, do not add duties not present here):\n${keyResponsibilitiesSource}`
        : "No key-responsibilities text is on file for this job posting — write \"[HR TO COMPLETE]\" as the single line under the 'Key Responsibilities:' heading instead of inventing duties.",
      "",
      "Write in clear, professional British English suitable for a senior agribusiness employer, using this EXACT section structure and headings, in this order:",
      "",
      "1. Opening paragraph: warm congratulations, stating the position and effective start date.",
      "2. A section headed exactly \"Position Details:\" followed by four lines, each on its own line: \"Position: …\", \"Start Date: …\", \"Reporting To: …\", \"Location: …\".",
      "3. A section headed exactly \"Compensation:\" with one paragraph starting \"Salary:\" that states the gross salary and pay frequency exactly as given, and says the full breakdown is provided in Annex 1 to this letter. Do not restate or compute a different salary figure.",
      "4. A section headed exactly \"Working Hours:\" with one paragraph stating the working hours exactly as given.",
      "5. A section headed exactly \"Key Responsibilities:\" followed by a bulleted list (one responsibility per line, starting each line with a dash) built only from the key-responsibilities text given above.",
      "6. A section headed exactly \"Terms of Employment:\" with one paragraph noting the employment is governed by the labour laws of Ghana and may be terminated by either party with the notice period given above.",
      "7. A closing paragraph inviting the candidate to accept by signing and returning the letter by the acceptance deadline given above, and inviting questions.",
      "",
      "Keep section headings on their own line, exactly as written above (including the trailing colon), each followed by a blank line before the next section.",
      "Do not invent benefits, clauses, or figures not implied by the facts above.",
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
        form_data: submission?.form_data ?? {},
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
          grade_level: ctx.gradeLevel ?? null,
          pay_frequency: ctx.payFrequency ?? null,
          salary_display: ctx.salaryDisplay ?? null,
          employment_type: ctx.employmentType ?? null,
          department: ctx.department ?? null,
          work_location: ctx.workLocation ?? null,
          medical_reports: ctx.medicalReports,
          recommended_start_date: ctx.recommendedStartDate ?? null,
          reporting_to: ctx.reportingTo ?? null,
          notice_period: ctx.noticePeriod ?? null,
          working_hours: ctx.workingHours ?? null,
          acceptance_deadline: ctx.acceptanceDeadline ?? null,
          basic_salary_ghs: ctx.basicSalaryGhs ?? null,
          housing_allowance: ctx.housingAllowance ?? null,
          medical_allowance: ctx.medicalAllowance ?? null,
          social_security_contribution: ctx.socialSecurityContribution ?? null,
          income_tax: ctx.incomeTax ?? null,
          net_payable: ctx.netPayable ?? null,
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
