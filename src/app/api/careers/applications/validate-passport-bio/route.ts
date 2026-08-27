import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import {
  evaluatePassportBioMatch,
  type ExtractedPassportBio,
} from "@/lib/careers/passportBioValidation";

// Same reasoning as the CV/job-posting extraction routes — downloading,
// base64-encoding, and having Claude read an image can take longer than the
// platform's default function timeout.
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PASSPORT_BIO_TOOL = {
  name: "record_passport_bio_details",
  description:
    "Records the identity details printed on a passport bio (data) page photo, for verifying a job applicant's identity.",
  input_schema: {
    type: "object" as const,
    properties: {
      is_passport_bio_page: {
        type: "boolean",
        description:
          "True only if this image genuinely shows a passport bio/data page (with a photo, name, and date of birth printed on it) — false for a selfie, a random photo, an unrelated document, or an unreadable image.",
      },
      surname: {
        type: "string",
        description: "Surname / family name exactly as printed (the 'Surname' field).",
      },
      given_names: {
        type: "string",
        description: "Given name(s) exactly as printed (the 'Given names' field).",
      },
      date_of_birth: {
        type: "string",
        description:
          "Date of birth converted to YYYY-MM-DD, only if legible. Leave empty rather than guessing.",
      },
      nationality: {
        type: "string",
        description: "Nationality as printed, if legible.",
      },
      passport_number: {
        type: "string",
        description: "Passport / document number, if legible.",
      },
    },
    required: ["is_passport_bio_page"],
  },
};

const INSTRUCTIONS =
  "This image is meant to be the bio (data) page of a passport, uploaded by someone applying for a job at Wills Farms so their identity can be checked against the name, date of birth, and passport number they typed into the application form. Read exactly what is printed — surname, given names, date of birth (converted to YYYY-MM-DD), nationality, and passport number, if legible. Leave any field empty rather than guessing if it isn't clearly legible. Set is_passport_bio_page to false if this image doesn't genuinely show a passport bio page.";

function isValidIsoDate(raw: string | undefined): boolean {
  return !!raw && /^\d{4}-\d{2}-\d{2}$/.test(raw);
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured on the server" },
        { status: 500 },
      );
    }

    const body = (await req.json()) as {
      file_url?: string;
      file_name?: string;
      first_name?: string;
      last_name?: string;
      date_of_birth?: string;
      passport_number?: string;
    };

    const fileUrl = body.file_url;
    const firstName = String(body.first_name ?? "").trim();
    const lastName = String(body.last_name ?? "").trim();
    const dateOfBirth = String(body.date_of_birth ?? "").trim();
    const passportNumber = String(body.passport_number ?? "").trim();

    if (!fileUrl) {
      return NextResponse.json({ error: "file_url is required" }, { status: 400 });
    }
    if (!firstName || !lastName || !dateOfBirth || !passportNumber) {
      return NextResponse.json(
        {
          error:
            "first_name, last_name, date_of_birth, and passport_number are required to verify against.",
        },
        { status: 400 },
      );
    }

    const fileName = body.file_name || decodeURIComponent(fileUrl.split("/").pop() ?? "passport.jpg");

    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return NextResponse.json(
        { error: `Could not download "${fileName}" (HTTP ${fileRes.status})` },
        { status: 502 },
      );
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const contentType = fileRes.headers.get("content-type");

    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `"${fileName}" is ${(buffer.byteLength / (1024 * 1024)).toFixed(1)}MB, which is too large to read reliably.`,
        },
        { status: 400 },
      );
    }

    const imgMediaType = imageMediaType(fileName, contentType);
    if (!imgMediaType) {
      return NextResponse.json(
        { error: "Passport bio page must be a JPEG or PNG photo." },
        { status: 400 },
      );
    }

    // Same media_type literal-union gap as the CV extraction route — the
    // installed SDK version's types want a narrower string than what we can
    // statically know here, so this content block is loosely typed.
    const content: any[] = [
      { type: "text", text: INSTRUCTIONS },
      {
        type: "image",
        source: { type: "base64", media_type: imgMediaType, data: buffer.toString("base64") },
      },
    ];

    const message = await anthropic.messages.create({
      model: TASK_MANAGER_AI_MODEL,
      max_tokens: 1024,
      tools: [PASSPORT_BIO_TOOL],
      tool_choice: { type: "tool", name: "record_passport_bio_details" },
      messages: [{ role: "user", content }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const raw = (toolUse as { input?: Record<string, unknown> } | undefined)?.input ?? {};

    const surname = String(raw.surname ?? "").trim();
    const givenNames = String(raw.given_names ?? "").trim();
    const extracted: ExtractedPassportBio = {
      isPassportBioPage: raw.is_passport_bio_page === true,
      fullName: [givenNames, surname].filter(Boolean).join(" "),
      dateOfBirth: isValidIsoDate(raw.date_of_birth as string | undefined)
        ? (raw.date_of_birth as string)
        : "",
      nationality: String(raw.nationality ?? "").trim(),
      passportNumber: String(raw.passport_number ?? "").trim(),
    };

    const result = evaluatePassportBioMatch(
      { firstName, lastName, dateOfBirth, passportNumber },
      extracted,
    );

    return NextResponse.json({
      data: {
        matches: result.matches,
        message: result.message,
        extracted: {
          full_name: extracted.fullName,
          date_of_birth: extracted.dateOfBirth,
          nationality: extracted.nationality,
          passport_number: extracted.passportNumber,
        },
      },
    });
  } catch (err: unknown) {
    console.error("[POST /api/careers/applications/validate-passport-bio]", err);
    const message = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
