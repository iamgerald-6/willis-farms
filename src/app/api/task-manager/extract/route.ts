import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";
import { extractPdfPages, MAX_EXTRACTION_FILES as MAX_FILES } from "@/lib/pdfPages";
import { FREQUENCY_OPTIONS } from "@/lib/taskManagerConstants";
import type { ExtractedTaskProposal, ExtractionJobFile } from "@/types/taskManager";

// Without this, Vercel falls back to its platform default (as low as 10s
// on some plans) — nowhere near enough for a large scanned page, and now
// potentially several of them in one request. A high-resolution single-
// page scan (phone/scanner-app output routinely runs 10-15MB with an
// oversized page canvas) takes real time to download from Cloudinary,
// base64-encode, and have Claude read — multiplied across every file in
// the batch. A hard platform timeout kills the function before our own
// try/catch ever runs, so the client gets a bodyless error and falls back
// to a generic message — that's what was actually happening for "Couldn't
// read that document" reports on large scanned files, not a genuine read
// failure. (Some Vercel plans cap this lower regardless of what's set here.)
export const maxDuration = 90;

// Keeps a batch fast enough to plausibly finish inside maxDuration and the
// combined request small enough for the Messages API — "a couple of
// related documents", not an entire filing cabinet in one go.
const MAX_BYTES_PER_FILE = 25 * 1024 * 1024;
const MAX_BYTES_TOTAL = 40 * 1024 * 1024;

// Plain Levenshtein edit distance — used to forgive small misreadings of a
// handwritten name (e.g. "Jon" for "John") when matching against real
// users, without a new dependency for something this small.
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

const normalizeName = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

/**
 * Best-effort match of a handwritten/extracted owner name against real
 * users — deliberately conservative, since assigning a task to the wrong
 * person is worse than leaving it for a human to pick. Tries, in order:
 * exact full-name match; a first-or-last-name match, but only when it's
 * unique across every user; then a close (edit distance <= 2) full-name
 * match, but only when it's a clear, unambiguous winner over every other
 * candidate. Returns null rather than guessing when nothing clears that
 * bar — the raw written name is kept on the proposal either way so
 * whoever reviews it can still see what was intended and pick manually.
 */
function matchOwnerId(writtenName: string, users: { user_id: string; first_name: string; last_name: string }[]): string | null {
  const target = normalizeName(writtenName);
  if (!target) return null;

  const withFullName = users.map((u) => ({ ...u, full: normalizeName(`${u.first_name} ${u.last_name}`) }));

  const exact = withFullName.find((u) => u.full === target);
  if (exact) return exact.user_id;

  const firstOrLastMatches = withFullName.filter(
    (u) => normalizeName(u.first_name) === target || normalizeName(u.last_name) === target,
  );
  if (firstOrLastMatches.length === 1) return firstOrLastMatches[0].user_id;

  const scored = withFullName.map((u) => ({ user_id: u.user_id, distance: editDistance(target, u.full) })).sort((a, b) => a.distance - b.distance);
  const best = scored[0];
  const runnerUp = scored[1];
  if (best && best.distance <= 2 && (!runnerUp || runnerUp.distance - best.distance >= 2)) return best.user_id;

  return null;
}

function isWordDoc(fileName: string, contentType: string | null): boolean {
  const name = fileName.toLowerCase();
  return name.endsWith(".docx") || name.endsWith(".doc") || !!contentType?.includes("wordprocessingml") || !!contentType?.includes("msword");
}

// Claude's image blocks accept exactly these four formats — anything else
// (e.g. .heic straight off an iPhone) needs to be converted before upload.
const IMAGE_MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function imageMediaType(fileName: string, contentType: string | null): string | null {
  if (contentType && Object.values(IMAGE_MEDIA_TYPES).includes(contentType)) return contentType;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return IMAGE_MEDIA_TYPES[ext] ?? null;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_TOOL = {
  name: "record_extracted_tasks",
  description:
    "Records the compliance obligations, deadlines, and recurring checks found across the provided document(s) as a structured task list.",
  input_schema: {
    type: "object" as const,
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short, actionable task name" },
            description: { type: "string", description: "Relevant detail/context copied or summarized from the document(s)" },
            start_date: { type: "string", description: "ISO date YYYY-MM-DD if the document states when work on this obligation should begin — separate from its deadline. Omit this field if no start date is stated." },
            due_date: { type: "string", description: "ISO date YYYY-MM-DD if a specific deadline is stated, otherwise omit this field" },
            is_recurring: { type: "boolean", description: "True if this is a recurring obligation (e.g. quarterly monitoring), false for a one-off deadline" },
            frequency: { type: "string", description: `One of: ${FREQUENCY_OPTIONS.join(", ")} — only when is_recurring is true. Pick whichever of these matches the document's stated cadence most closely.` },
            indicator: { type: "string", description: "What is being measured or monitored, if this is a monitoring requirement" },
            method_provider: { type: "string", description: "The lab, test kit, or method used to check a monitoring requirement (e.g. 'Accredited lab', 'In-house test kit') — only for monitoring/testing tasks. Never a person's name; use owner_name for who is responsible." },
            owner_name: { type: "string", description: "The name of the person responsible, exactly as written in the document(s) — omit if no name is stated. This is matched against real user accounts server-side, not used directly." },
            source_file_name: {
              type: "string",
              description:
                "When more than one document was provided: the file name this task was primarily drawn from, exactly as given in that document's label (e.g. 'Document 2: policy.pdf' → 'policy.pdf'). Omit if this task synthesizes information from more than one document, or if only one document was provided.",
            },
          },
          required: ["title"],
        },
      },
    },
    required: ["tasks"],
  },
};

// POST /api/task-manager/extract — Senior Management only.
// Sends one or more already-uploaded documents (Cloudinary URLs) directly
// to Claude in a single message — no separate PDF-parsing or OCR library
// needed, the Messages API reads PDFs and images (including scanned/
// handwritten pages) natively. When there's more than one file, they're
// read together as one set (e.g. a policy plus a separate document
// describing it) so Claude can cross-reference between them, rather than
// each being extracted in isolation. Returns proposed tasks for review;
// nothing is saved as a real task until /extract/[jobId]/save is called.
export async function POST(req: NextRequest) {
  let jobId: string | null = null;
  try {
    const user = await requireSeniorManagement(req);
    if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured on the server" }, { status: 500 });
    }

    const { project_id, files } = (await req.json()) as { project_id?: string; files?: ExtractionJobFile[] };
    if (!project_id || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "project_id and at least one file are required" }, { status: 400 });
    }
    if (files.some((f) => !f?.file_url)) {
      return NextResponse.json({ error: "Every file needs a file_url" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Up to ${MAX_FILES} documents at a time — try splitting this into smaller batches.` }, { status: 400 });
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from("tm_extraction_jobs")
      .insert([
        {
          project_id,
          // Legacy columns — first file, for anything not yet reading `files`.
          file_name: files[0].file_name ?? "document.pdf",
          file_url: files[0].file_url,
          files: files.map((f) => ({ file_name: f.file_name ?? "document", file_url: f.file_url, ...(f.pages?.length ? { pages: f.pages } : {}) })),
          status: "pending",
          created_by: user.id,
        },
      ])
      .select()
      .single();
    if (jobError) throw jobError;
    jobId = job.id;

    const baseInstructions =
      files.length > 1
        ? "These are compliance documents (e.g. permits, licences, or regulatory notices) for a farm operation in Ghana, provided together as a related set — for example, one document may state a policy and another may describe or elaborate on it. Read all of them together and extract every distinct obligation, deadline, renewal date, and recurring monitoring/reporting requirement as a task, drawing on whichever document(s) are relevant to each one. If the same obligation appears in more than one document, record it once, not once per document. Each document below is labeled with its number and file name — use source_file_name on a task when it's clearly drawn from one specific document, and omit it when a task combines information from more than one."
        : "This is a compliance document (e.g. a permit, licence, or regulatory notice) for a farm operation in Ghana. Read it and extract every distinct obligation, deadline, renewal date, and recurring monitoring/reporting requirement as a task.";

    const instructions =
      `${baseInstructions} Use clear, specific task titles a manager could act on directly, and use the units/dates exactly as stated in the document(s). If a date is written in a purely numeric, ambiguous format (e.g. 03/04/2026), read it as day/month/year — Ghana's convention — not month/day/year, unless the document clearly indicates otherwise (e.g. a month spelled out, or a US-format document). If this is a photo or scan of a handwritten page, some words may be genuinely illegible — for anything you can't read with confidence (a date, a number, a name), say so directly in that task's description rather than guessing at a value. If a person's name is written next to a task (an owner, responsible person, etc.), capture it in owner_name exactly as written — don't try to guess who it maps to in any system. If the document states both when work should begin and a separate deadline, capture the former as start_date and the latter as due_date — don't invent a start_date when only a deadline is given.`;

    // Word docs: pull the text out with mammoth and send it as plain text —
    // Claude's document blocks only read PDFs and images natively, and
    // mammoth only reads embedded text, not any images inside the file
    // (so a scanned page pasted into a Word doc won't be read at all).
    // Photos/scans (jpg/png/webp/gif) go as an image block — this is what
    // makes handwritten notes readable, not a separate OCR step; Claude
    // reads the image directly. Everything else (PDF, including scanned/
    // image-only PDFs with no text layer) goes as a native document.
    const content: any[] = [{ type: "text", text: instructions }];
    let totalBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const { file_url, file_name, pages: requestedPages } = files[i];

      const fileRes = await fetch(file_url);
      if (!fileRes.ok) throw new Error(`Could not download "${file_name ?? file_url}" (HTTP ${fileRes.status})`);
      const arrayBuffer = await fileRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = fileRes.headers.get("content-type");

      // A clear, actionable failure instead of quietly running out the
      // clock on maxDuration above — phone/scanner-app PDFs can come out
      // surprisingly large (an oversized page canvas at high resolution
      // easily hits 10-15MB for a single page), which is slow enough to
      // read that it's worth stopping early with real guidance rather than
      // letting it time out. This check runs on the original download —
      // trimming to selected pages (below) still requires downloading the
      // whole file first, it just shrinks what actually gets sent to Claude.
      if (buffer.byteLength > MAX_BYTES_PER_FILE) {
        throw new Error(
          `"${file_name ?? "One of these files"}" is ${(buffer.byteLength / (1024 * 1024)).toFixed(1)}MB, which is too large to read reliably. Try a lower-resolution scan, or split a multi-page document into smaller files.`,
        );
      }
      totalBytes += buffer.byteLength;
      if (totalBytes > MAX_BYTES_TOTAL) {
        throw new Error(`These files add up to more than ${MAX_BYTES_TOTAL / (1024 * 1024)}MB combined, which is too large to read reliably in one batch. Try uploading fewer at a time.`);
      }

      const imgMediaType = imageMediaType(file_name ?? "", contentType);
      const wordDoc = isWordDoc(file_name ?? "", contentType);

      // If the reviewer picked specific pages in the page picker, trim the
      // PDF down to just those before it's sent to Claude — this is what
      // actually keeps a long document's read small, not just a UI
      // affordance. Word docs and images have no page concept here (mammoth
      // has no page boundaries; an image is already a single page), so this
      // only ever applies to the native-PDF branch below. Re-validated and
      // hard-capped server-side (extractPdfPages ignores anything past
      // MAX_EXTRACTION_PAGES) regardless of what the client sent.
      //
      // A reviewer picking pages is a deliberate action, so if the file
      // can't actually be read as a PDF at this point, that's surfaced as a
      // real error with the underlying reason — not swallowed into a silent
      // "send the whole thing instead", which would quietly ignore a choice
      // they made on purpose.
      let pageNote = "";
      let pdfBuffer: Buffer = buffer;
      if (!wordDoc && !imgMediaType && Array.isArray(requestedPages) && requestedPages.length > 0) {
        try {
          const trimmed = await extractPdfPages(buffer, requestedPages);
          if (trimmed.pages.length < trimmed.totalPages) {
            pdfBuffer = Buffer.from(trimmed.bytes);
            pageNote = ` (page${trimmed.pages.length > 1 ? "s" : ""} ${trimmed.pages.join(", ")} of ${trimmed.totalPages} selected)`;
          }
        } catch (err: any) {
          throw new Error(
            `Couldn't apply your page selection to "${file_name ?? "that document"}": ${err?.message ?? "the file couldn't be read as a PDF"}. Remove the page selection and try again, or re-upload the document.`,
          );
        }
      }

      const label =
        files.length > 1
          ? `--- Document ${i + 1}: ${file_name ?? "document"}${pageNote} ---`
          : pageNote
            ? `Reading${pageNote} of "${file_name ?? "this document"}".`
            : null;
      if (label) content.push({ type: "text", text: label });

      if (wordDoc) {
        const { value: text } = await mammoth.extractRawText({ buffer });
        if (!text.trim()) throw new Error(`Couldn't read any text out of "${file_name ?? "that Word document"}".`);
        content.push({ type: "text", text });
      } else if (imgMediaType) {
        const base64 = buffer.toString("base64");
        content.push({ type: "image", source: { type: "base64", media_type: imgMediaType, data: base64 } });
      } else {
        const base64 = pdfBuffer.toString("base64");
        content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
      }
    }

    const message = await anthropic.messages.create({
      // Overridable via env so the model can be swapped without a code
      // deploy if this string ever stops resolving — check
      // console.anthropic.com/models for what's current.
      model: process.env.TASK_MANAGER_EXTRACTION_MODEL ?? "claude-sonnet-4-5",
      // A busy compliance document (or several read together) can easily
      // have 20-30+ distinct obligations, each with a title/description/
      // dates — 4096 was tight enough to truncate the tool call mid-JSON on
      // a large document, which silently produces zero usable tasks (the
      // API can't return a half-written argument object) even though
      // Claude genuinely found plenty. This was previously seen as a
      // document that used to extract fine suddenly returning "no tasks
      // could be identified".
      max_tokens: 8192,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "record_extracted_tasks" },
      messages: [{ role: "user", content }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    const rawProposals: (ExtractedTaskProposal & { owner_name?: string })[] = (toolUse as any)?.input?.tasks ?? [];

    // If generation was cut off before the tool call finished, don't report
    // a flat "no tasks" — that reads as "these documents have nothing in
    // them", which is misleading and sends whoever's debugging it down the
    // wrong path. Returned as a distinguishable `reason` (not just thrown)
    // so the client can offer the page-picker as a recovery step instead of
    // just showing a dead-end error — this is meant to be the exception,
    // not something every upload has to plan around, so documents are read
    // in full by default and only narrowed down when this actually fires.
    if (message.stop_reason === "max_tokens" && rawProposals.length === 0) {
      const msg = "These document(s) have too many obligations to extract in one pass. Select fewer pages per document and try again.";
      await supabaseAdmin.from("tm_extraction_jobs").update({ status: "failed", error_message: msg }).eq("id", job.id);
      return NextResponse.json({ error: msg, reason: "too_many_obligations" }, { status: 422 });
    }

    // Claude reads a written name off the page but has no idea which real
    // account that maps to — matchOwnerId does that lookup here, server-
    // side, against actual users. owner_name is kept on the proposal
    // either way (matched or not) so the review screen can show what was
    // written, not just a silently-filled or silently-blank dropdown.
    let proposals: ExtractedTaskProposal[] = rawProposals;
    if (rawProposals.some((p) => p.owner_name)) {
      const { data: allUsers } = await supabaseAdmin.from("users").select("user_id, first_name, last_name");
      proposals = rawProposals.map((p) => ({
        ...p,
        owner_id: p.owner_name ? matchOwnerId(p.owner_name, allUsers ?? []) : null,
      }));
    }

    if (proposals.length === 0) {
      const message = files.length > 1 ? "No tasks could be identified in these documents." : "No tasks could be identified in this document.";
      await supabaseAdmin.from("tm_extraction_jobs").update({ status: "failed", error_message: message }).eq("id", job.id);
      return NextResponse.json({ error: message }, { status: 422 });
    }

    await supabaseAdmin.from("tm_extraction_jobs").update({ status: "completed", extracted_tasks: proposals }).eq("id", job.id);

    return NextResponse.json({ job: { ...job, status: "completed", extracted_tasks: proposals } });
  } catch (err: any) {
    console.error("[POST /api/task-manager/extract]", err);
    if (jobId) {
      await supabaseAdmin
        .from("tm_extraction_jobs")
        .update({ status: "failed", error_message: err.message ?? "Extraction failed" })
        .eq("id", jobId);
    }
    return NextResponse.json({ error: err.message ?? "Extraction failed" }, { status: 500 });
  }
}
