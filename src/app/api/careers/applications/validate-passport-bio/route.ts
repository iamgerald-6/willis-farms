import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { TASK_MANAGER_AI_MODEL } from "@/lib/taskManagerConstants";
import {
  evaluatePassportIdentityMatch,
  INVALID_PASSPORT_BIO_PAGE_MESSAGE,
  isUnprocessablePassportImageError,
  type ExtractedPassportBio,
  normalizePassportGender,
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

function isPdfFile(fileName: string, contentType: string | null): boolean {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return contentType === "application/pdf" || ext === "pdf";
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
          "True only if this image genuinely shows a passport bio/data page (with a photo, name, and date of birth printed on it) — false for a national ID card, Ghana Card, driver's licence, selfie, random photo, unrelated document, or unreadable image.",
      },
      surname: {
        type: "string",
        description:
          "Surname / family name, read from the large printed field near the top of the page — whatever it's labeled in the document's language (e.g. 'Surname', 'Nom', 'Apellido(s)', 'Sobrenome') — don't require an English label. Only fall back to the MRZ (see instructions) if this printed field is missing or genuinely illegible.",
      },
      given_names: {
        type: "string",
        description:
          "Given name(s), read from the large printed field — whatever it's labeled (e.g. 'Given Names', 'Prénom(s)', 'Nombre(s)'). Only fall back to the MRZ if the printed field is missing or illegible.",
      },
      date_of_birth: {
        type: "string",
        description:
          "Date of birth converted to YYYY-MM-DD, read from the printed field (e.g. 'Date of Birth', 'Date de naissance'), only if legible. Leave empty rather than guessing.",
      },
      nationality: {
        type: "string",
        description:
          "Nationality as printed on the passport (required when legible) — e.g. GHANAIAN, BRITISH CITIZEN, or a 3-letter code from the MRZ. Read from the printed nationality field or MRZ, not guessed.",
      },
      gender: {
        type: "string",
        description:
          "Sex/gender as printed on the passport or MRZ — M or F, or Male/Female when legible. Leave empty if not readable.",
      },
      passport_number: {
        type: "string",
        description:
          "Passport / document number, read from the printed field (e.g. 'Passport No.', 'N° de passeport'), if legible.",
      },
    },
    required: ["is_passport_bio_page"],
  },
};

const INSTRUCTIONS =
  "This upload is meant to be the bio (data) page of a passport — as a photo (JPEG/PNG) or a PDF scan — uploaded by someone applying for a job at Wills Farms so their identity can be checked against the name, date of birth, gender, and nationality they typed into the application form. Passports from any country may be printed in a different language than English (French, Spanish, Portuguese, Arabic, etc.) — don't rely on a field being labeled in English; match fields by their position/layout on the standard passport bio page, not by an English word. " +
  "Read surname, given names, date of birth, gender/sex, nationality, and passport number from the large printed text first — it's far more reliable to read than the tiny Machine Readable Zone (MRZ) text at the bottom of the page. Nationality and gender are required when legible — read them from the printed fields or MRZ when present. Only use the MRZ as a fallback when a printed field is missing, smudged, or otherwise illegible, and if you do, parse it carefully: the MRZ has two lines. Line 1 starts with 'P<' plus a 3-letter country code, then the surname, then a double filler '<<', then the given names (each separate given name is divided by a single '<'), then '<' padding to the end — do not confuse the double '<<' separator (which marks the end of the surname) with the single '<' separators between given names, and do not drop the surname. Line 2 starts with the passport number as exactly the first 9 characters (padded with trailing '<' if shorter) followed by a single check-digit character — the passport number is ONLY those first 9 characters, never include the check digit or the 3-letter nationality code that comes right after it. The sex/gender character in the MRZ (M or F) should be captured in gender when the printed sex field is missing. " +
  "Leave any field empty rather than guessing if it isn't clearly legible. Set is_passport_bio_page to false if this is a national ID card, Ghana Card, driver's licence, or any document that is not a passport bio page.";

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
      nationality?: string;
      gender?: string;
      passport_number?: string;
    };

    const fileUrl = body.file_url;
    const firstName = String(body.first_name ?? "").trim();
    const lastName = String(body.last_name ?? "").trim();
    const dateOfBirth = String(body.date_of_birth ?? "").trim();
    const nationality = String(body.nationality ?? "").trim();
    const gender = String(body.gender ?? "").trim();
    const passportNumber = String(body.passport_number ?? "").trim();

    if (!fileUrl) {
      return NextResponse.json({ error: "file_url is required" }, { status: 400 });
    }
    if (!firstName || !lastName || !dateOfBirth || !nationality || !gender) {
      return NextResponse.json(
        {
          error:
            "first_name, last_name, date_of_birth, gender, and nationality are required to verify against.",
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
    const pdfFile = isPdfFile(fileName, contentType);

    if (!imgMediaType && !pdfFile) {
      return NextResponse.json(
        { error: "Passport bio page must be a JPEG, PNG, or PDF file." },
        { status: 400 },
      );
    }

    const content: any[] = [{ type: "text", text: INSTRUCTIONS }];

    if (imgMediaType) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: imgMediaType, data: buffer.toString("base64") },
      });
    } else {
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buffer.toString("base64"),
        },
      });
    }

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
      gender: normalizePassportGender(String(raw.gender ?? "")),
    };

    const extractedPayload = {
      full_name: extracted.fullName,
      date_of_birth: extracted.dateOfBirth,
      nationality: extracted.nationality,
      gender: extracted.gender,
      passport_number: extracted.passportNumber,
    };

    const identityResult = evaluatePassportIdentityMatch(
      { firstName, lastName, dateOfBirth, nationality, gender },
      extracted,
    );

    if (identityResult.identityMatches) {
      return NextResponse.json({
        data: {
          matches: true,
          identity_verified: true,
          full_match: true,
          message: null,
          extracted: extractedPayload,
        },
      });
    }

    return NextResponse.json({
      data: {
        matches: false,
        identity_verified: false,
        full_match: false,
        message: identityResult.message,
        extracted: extractedPayload,
      },
    });
  } catch (err: unknown) {
    console.error("[POST /api/careers/applications/validate-passport-bio]", err);

    if (isUnprocessablePassportImageError(err)) {
      return NextResponse.json({
        data: {
          matches: false,
          identity_verified: false,
          full_match: false,
          message: INVALID_PASSPORT_BIO_PAGE_MESSAGE,
          extracted: {
            full_name: "",
            date_of_birth: "",
            nationality: "",
            passport_number: "",
          },
        },
      });
    }

    return NextResponse.json(
      {
        error:
          "We couldn't verify this photo automatically. Please upload a clear passport bio page and try again.",
      },
      { status: 500 },
    );
  }
}
