import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  emptyRefereeReferenceForm,
  mergeRefereeReferenceForm,
  type RefereeReferenceFormData,
} from "@/lib/careers/refereeReferenceTypes";
import { validateRefereeReferenceForm } from "@/lib/careers/refereeReferenceSchema";
import { validateRefereeReferenceToken } from "@/lib/careers/refereeReferenceTokens";

type RouteParams = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { token } = await params;
  const validation = await validateRefereeReferenceToken(supabaseAdmin, token);
  if (!validation.ok) {
    const messages = {
      not_found: "This reference link is invalid.",
      revoked: "This reference link has been replaced. Check your email for the latest link.",
      expired: "This reference link has expired. Contact HR if you still need to submit.",
    };
    return NextResponse.json(
      { error: messages[validation.reason] },
      { status: validation.reason === "not_found" ? 404 : 410 },
    );
  }

  const { data: application, error: appError } = await supabaseAdmin
    .from("job_applications")
    .select("id, full_name, role_title, reference_number, application_form_data")
    .eq("id", validation.applicationId)
    .single();

  if (appError || !application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const { data: submission } = await supabaseAdmin
    .from("referee_reference_submissions")
    .select("*")
    .eq("application_id", validation.applicationId)
    .eq("referee_index", validation.refereeIndex)
    .maybeSingle();

  if (submission?.submitted_at) {
    return NextResponse.json({
      success: true,
      data: {
        submitted: true,
        submitted_at: submission.submitted_at,
        candidate: {
          full_name: application.full_name,
          role_title: application.role_title,
          reference_number: application.reference_number,
        },
        referee: {
          name: validation.refereeName,
          email: validation.refereeEmail,
          index: validation.refereeIndex,
        },
        expires_at: validation.expiresAt,
      },
    });
  }

  const appFormData = application.application_form_data as Record<string, unknown> | null;
  const contact = {
    index: validation.refereeIndex,
    name: validation.refereeName,
    email: validation.refereeEmail,
    phone: String(appFormData?.[`reference_${validation.refereeIndex}_phone`] ?? "").trim(),
    relationship: String(
      appFormData?.[`reference_${validation.refereeIndex}_relationship`] ?? "",
    ).trim(),
  };

  const initialForm = mergeRefereeReferenceForm(
    (submission?.form_data as RefereeReferenceFormData | undefined) ??
      emptyRefereeReferenceForm(contact),
    contact,
  );

  return NextResponse.json({
    success: true,
    data: {
      submitted: false,
      candidate: {
        full_name: application.full_name,
        role_title: application.role_title,
        reference_number: application.reference_number,
      },
      referee: {
        name: validation.refereeName,
        email: validation.refereeEmail,
        index: validation.refereeIndex,
      },
      form_data: initialForm,
      expires_at: validation.expiresAt,
    },
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const { token } = await params;
  const validation = await validateRefereeReferenceToken(supabaseAdmin, token);
  if (!validation.ok) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 410 });
  }

  const { data: existing } = await supabaseAdmin
    .from("referee_reference_submissions")
    .select("submitted_at")
    .eq("application_id", validation.applicationId)
    .eq("referee_index", validation.refereeIndex)
    .maybeSingle();

  if (existing?.submitted_at) {
    return NextResponse.json(
      { error: "This reference has already been submitted." },
      { status: 400 },
    );
  }

  const body = await req.json();
  const form_data = body.form_data as RefereeReferenceFormData;
  if (!form_data || typeof form_data !== "object") {
    return NextResponse.json({ error: "Form data is required." }, { status: 400 });
  }

  const errors = validateRefereeReferenceForm(form_data);
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0] }, { status: 400 });
  }

  const now = new Date().toISOString();
  const payload = {
    application_id: validation.applicationId,
    token_id: validation.tokenId,
    referee_index: validation.refereeIndex,
    form_data,
    submitted_at: now,
  };

  const { error } = await supabaseAdmin
    .from("referee_reference_submissions")
    .upsert(payload, { onConflict: "application_id,referee_index" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, submitted_at: now });
}
