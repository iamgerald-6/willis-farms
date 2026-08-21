import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  APPLICATION_STEPS,
  extractApplicantSummary,
  validateStep,
} from "@/lib/careers/applicationFormSchema";
import { fetchApplicationFormFields } from "@/lib/careers/getApplicationFormFields";
import { isPostingPublic } from "@/lib/careers/jobPostings";
import { generateReferenceNumber } from "@/lib/careers/openings";
import { sendApplicationConfirmationEmail } from "@/lib/careers/applicationConfirmationEmail";
import { sendApplicationHrNotificationEmail } from "@/lib/careers/applicationHrNotificationEmail";
import { sendRefereeReferenceInvites, type SendRefereeInvitesResult } from "@/lib/careers/sendRefereeReferenceInvites";

function createDraftToken(): string {
  return randomBytes(24).toString("hex");
}

export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Draft token is required." }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("job_applications")
      .select(
        "id, reference_number, role_title, role_slug, submission_status, application_form_data, job_posting_id, draft_token",
      )
      .eq("draft_token", token)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.submission_status !== "draft") {
      return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[GET /api/careers/applications/save]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const {
      posting_id,
      form_data,
      draft_token,
      finalize,
      website,
    } = body as {
      posting_id?: string;
      form_data?: Record<string, unknown>;
      draft_token?: string;
      finalize?: boolean;
      website?: string;
    };

    if (website) {
      return NextResponse.json({ success: true });
    }

    if (!posting_id && !draft_token) {
      return NextResponse.json(
        { error: "Job posting is required to start an application." },
        { status: 400 },
      );
    }

    if (!form_data || typeof form_data !== "object") {
      return NextResponse.json({ error: "Form data is required." }, { status: 400 });
    }

    const fields = await fetchApplicationFormFields(supabaseAdmin);

    if (finalize) {
      for (const step of APPLICATION_STEPS) {
        const stepErrors = validateStep(fields, step, form_data);
        if (stepErrors.length > 0) {
          return NextResponse.json({ error: stepErrors[0] }, { status: 400 });
        }
      }
    } else {
      const lastStep = APPLICATION_STEPS[APPLICATION_STEPS.length - 1];
      const stepErrors = validateStep(fields, lastStep, form_data);
      if (stepErrors.length > 0) {
        return NextResponse.json(
          { error: "Complete all required fields before saving a draft." },
          { status: 400 },
        );
      }
    }

    const summary = extractApplicantSummary(form_data);
    if (finalize && (!summary.email || !summary.phone || !summary.full_name)) {
      return NextResponse.json(
        { error: "Name, email, and phone are required to submit." },
        { status: 400 },
      );
    }

    let posting:
      | {
          id: string;
          slug: string;
          title: string;
          interview_guide_key: string;
          closes_at: string;
          is_active: boolean;
        }
      | null = null;

    if (draft_token) {
      const { data: existingDraft, error: draftErr } = await supabaseAdmin
        .from("job_applications")
        .select("*, job_postings(*)")
        .eq("draft_token", draft_token)
        .maybeSingle();

      if (draftErr) {
        return NextResponse.json({ error: draftErr.message }, { status: 500 });
      }
      if (!existingDraft || existingDraft.submission_status !== "draft") {
        return NextResponse.json({ error: "Draft not found." }, { status: 404 });
      }

      posting = existingDraft.job_postings as typeof posting;
      if (!posting) {
        return NextResponse.json({ error: "Linked job posting not found." }, { status: 404 });
      }

      const updates: Record<string, unknown> = {
        application_form_data: form_data,
        full_name: summary.full_name || existingDraft.full_name,
        email: summary.email || existingDraft.email,
        phone: summary.phone || existingDraft.phone,
        cover_note: summary.cover_note,
        cv_url: summary.cv_url,
        cv_public_id: summary.cv_public_id,
      };

      if (finalize) {
        updates.submission_status = "submitted";
        updates.status = "applied";
        updates.draft_token = null;
      }

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("job_applications")
        .update(updates)
        .eq("id", existingDraft.id)
        .select("id, reference_number, role_title, created_at, updated_at, draft_token")
        .single();

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      if (finalize) {
        const refereeInvites = await sendSubmissionEmails(supabaseAdmin, {
          applicationId: updated.id,
          formData: form_data,
          fullName: summary.full_name,
          email: summary.email,
          phone: summary.phone,
          roleTitle: updated.role_title,
          referenceNumber: updated.reference_number,
          submittedAt: updated.updated_at ?? updated.created_at,
        });

        return NextResponse.json({
          success: true,
          data: {
            ...updated,
            submitted: true,
            referee_invites: refereeInvites,
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          ...updated,
          submitted: finalize ?? false,
        },
      });
    }

    const { data: postingRow, error: postingErr } = await supabaseAdmin
      .from("job_postings")
      .select("*")
      .eq("id", posting_id)
      .maybeSingle();

    if (postingErr) {
      return NextResponse.json({ error: postingErr.message }, { status: 500 });
    }
    if (!postingRow || !isPostingPublic(postingRow)) {
      return NextResponse.json(
        { error: "This job posting is no longer accepting applications." },
        { status: 400 },
      );
    }

    posting = postingRow;
    const reference_number = generateReferenceNumber();
    const token = createDraftToken();

    const insertPayload: Record<string, unknown> = {
      reference_number,
      full_name: summary.full_name || "Draft applicant",
      email: summary.email || `draft-${token.slice(0, 8)}@pending.local`,
      phone: summary.phone || "—",
      role_slug: postingRow.job_title_key ?? postingRow.slug,
      role_title: postingRow.title,
      cover_note: summary.cover_note,
      cv_url: summary.cv_url,
      cv_public_id: summary.cv_public_id,
      job_posting_id: postingRow.id,
      application_form_data: form_data,
      submission_status: finalize ? "submitted" : "draft",
      draft_token: finalize ? null : token,
      status: finalize ? "applied" : "applied",
    };

    const { data: created, error: insertErr } = await supabaseAdmin
      .from("job_applications")
      .insert(insertPayload)
      .select("id, reference_number, role_title, created_at, updated_at, draft_token")
      .single();

    if (insertErr) {
      console.error("[POST /api/careers/applications/save]", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    if (finalize) {
      const refereeInvites = await sendSubmissionEmails(supabaseAdmin, {
        applicationId: created.id,
        formData: form_data,
        fullName: summary.full_name,
        email: summary.email,
        phone: summary.phone,
        roleTitle: created.role_title,
        referenceNumber: created.reference_number,
        submittedAt: created.created_at,
      });

      return NextResponse.json({
        success: true,
        data: {
          ...created,
          submitted: true,
          referee_invites: refereeInvites,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...created,
        submitted: finalize ?? false,
      },
    });
  } catch (err) {
    console.error("[POST /api/careers/applications/save]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

async function sendSubmissionEmails(
  supabaseAdmin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  params: {
    applicationId: string;
    formData: Record<string, unknown>;
    fullName: string;
    email: string;
    phone: string;
    roleTitle: string;
    referenceNumber: string;
    submittedAt: string;
  },
): Promise<SendRefereeInvitesResult | null> {
  const candidateResult = await sendApplicationConfirmationEmail({
    fullName: params.fullName,
    email: params.email,
    roleTitle: params.roleTitle,
    referenceNumber: params.referenceNumber,
    submittedAt: params.submittedAt,
  });

  if (!candidateResult.sent) {
    console.warn(
      "[applications/save] Candidate confirmation email not sent:",
      candidateResult.error,
    );
  }

  const hrResult = await sendApplicationHrNotificationEmail(params);
  if (!hrResult.sent) {
    console.warn(
      "[applications/save] HR notification email not sent:",
      hrResult.error,
    );
  }

  const refereeResult = await sendRefereeReferenceInvites(supabaseAdmin, {
    applicationId: params.applicationId,
    formData: params.formData,
    candidateName: params.fullName,
    roleTitle: params.roleTitle,
    referenceNumber: params.referenceNumber,
  });

  if (refereeResult.errors.length > 0) {
    console.error("[applications/save] Referee invite issues:", refereeResult.errors);
  } else if (refereeResult.sent > 0) {
    console.info(
      `[applications/save] Referee invites sent: ${refereeResult.sent}, skipped: ${refereeResult.skipped}`,
    );
  }

  return refereeResult;
}
