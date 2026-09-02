import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import type { OnboardingFormData } from "@/lib/careers/onboardingTypes";
import {
  evaluateMedicalReportMatch,
  INVALID_MEDICAL_REPORT_MESSAGE,
  isUnprocessableMedicalImageError,
  type ExtractedMedicalReport,
} from "@/lib/careers/medicalReportValidation";

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

function imageMediaType(fileName: string, contentType: string | null): string | null {
  if (contentType && Object.values(IMAGE_MEDIA_TYPES).includes(contentType)) return contentType;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return IMAGE_MEDIA_TYPES[ext] ?? null;
}

function isPdfFile(fileName: string, contentType: string | null): boolean {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return contentType === "application/pdf" || ext === "pdf";
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MEDICAL_REPORT_TOOL = {
  name: "record_medical_report_details",
  description:
    "Records key details from a pre-employment medical certificate or fitness report.",
  input_schema: {
    type: "object" as const,
    properties: {
      is_medical_report: {
        type: "boolean",
        description:
          "True only if this is a genuine medical/fitness certificate from a clinic or hospital — false for unrelated documents, blank pages, or unreadable uploads.",
      },
      blood_group: {
        type: "string",
        description: "Blood group as printed on the report (e.g. O+, A-, B+). Empty if not found.",
      },
      allergies_noted: {
        type: "string",
        description: "Allergies or adverse reactions noted on the report. Empty if none stated.",
      },
      conditions_noted: {
        type: "string",
        description:
          "Medical conditions, chronic illnesses, or relevant findings noted. Empty if none stated.",
      },
      summary: {
        type: "string",
        description: "One short sentence summarising fitness / clearance stated on the report.",
      },
    },
    required: ["is_medical_report"],
  },
};

const INSTRUCTIONS =
  "This upload is a pre-employment medical certificate or fitness report for a Wills Farms job candidate. " +
  "Extract blood group, any allergies, and any medical conditions or findings if legible. " +
  "Leave fields empty rather than guessing. Set is_medical_report to false if this is not a medical document.";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured on the server" },
        { status: 500 },
      );
    }

    const body = (await req.json()) as {
      application_id?: string;
      file_url?: string;
      file_name?: string;
    };

    const applicationId = body.application_id?.trim();
    const fileUrl = body.file_url?.trim();
    const fileName = body.file_name?.trim() || "medical-report.pdf";

    if (!applicationId || !fileUrl) {
      return NextResponse.json(
        { error: "application_id and file_url are required." },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data: submission, error: subError } = await supabaseAdmin
      .from("onboarding_submissions")
      .select("form_data")
      .eq("application_id", applicationId)
      .maybeSingle();

    if (subError) {
      return NextResponse.json({ error: subError.message }, { status: 500 });
    }

    const formData = (submission?.form_data ?? {}) as OnboardingFormData;
    const declared = {
      blood_group: formData.medical?.blood_group,
      allergies: formData.medical?.allergies,
      conditions: formData.medical?.conditions,
    };

    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return NextResponse.json({ error: "Could not download the uploaded file." }, { status: 400 });
    }

    const contentType = fileRes.headers.get("content-type");
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json({ error: "File is too large (max 8 MB)." }, { status: 400 });
    }

    const pdf = isPdfFile(fileName, contentType);
    const imageType = imageMediaType(fileName, contentType);

    if (!pdf && !imageType) {
      return NextResponse.json(
        { error: "Upload a PDF or image (JPEG/PNG) of the medical report." },
        { status: 400 },
      );
    }

    const contentBlocks: any[] = [];

    if (pdf) {
      contentBlocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buffer.toString("base64"),
        },
      });
    } else {
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: imageType as "image/jpeg" | "image/png",
          data: buffer.toString("base64"),
        },
      });
    }

    contentBlocks.push({
      type: "text",
      text: [
        INSTRUCTIONS,
        "",
        "Candidate self-declaration on onboarding form:",
        `- Blood group: ${declared.blood_group?.trim() || "(not declared)"}`,
        `- Allergies: ${declared.allergies?.trim() || "(none declared)"}`,
        `- Conditions: ${declared.conditions?.trim() || "(none declared)"}`,
        "",
        "Use the record_medical_report_details tool.",
      ].join("\n"),
    });

    let message: Anthropic.Message;
    try {
      message = await anthropic.messages.create({
        model: TASK_MANAGER_AI_MODEL,
        max_tokens: 600,
        tools: [MEDICAL_REPORT_TOOL],
        tool_choice: { type: "tool", name: "record_medical_report_details" },
        messages: [{ role: "user", content: contentBlocks }],
      });
    } catch (err) {
      if (isUnprocessableMedicalImageError(err)) {
        return NextResponse.json(
          { ok: false, error: INVALID_MEDICAL_REPORT_MESSAGE },
          { status: 422 },
        );
      }
      throw err;
    }

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const raw = (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};

    const extracted: ExtractedMedicalReport = {
      isMedicalReport: raw.is_medical_report === true,
      bloodGroup: String(raw.blood_group ?? "").trim(),
      allergiesNoted: String(raw.allergies_noted ?? "").trim(),
      conditionsNoted: String(raw.conditions_noted ?? "").trim(),
      summary: String(raw.summary ?? "").trim(),
    };

    const match = evaluateMedicalReportMatch(declared, extracted);

    return NextResponse.json({
      ok: match.ok,
      message: match.message,
      warnings: match.warnings,
      extracted: match.extracted,
      error: match.ok ? undefined : match.message,
    });
  } catch (err) {
    console.error("[POST /api/careers/onboarding/validate-medical-report]", err);
    return NextResponse.json(
      { ok: false, error: "Could not validate the medical report. Please try again." },
      { status: 500 },
    );
  }
}
