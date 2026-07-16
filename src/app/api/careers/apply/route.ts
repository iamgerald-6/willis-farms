import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { sendApplicationConfirmationEmail } from "@/lib/careers/applicationConfirmationEmail";
import {
  generateReferenceNumber,
  getOpeningBySlug,
} from "@/lib/careers/openings";

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  try {
    const body = await req.json();
    const {
      full_name,
      email,
      phone,
      location,
      role_slug,
      cover_note,
      cv_url,
      cv_public_id,
      website,
    } = body;

    if (website) {
      return NextResponse.json({ success: true });
    }

    if (!full_name?.trim() || !email?.trim() || !phone?.trim() || !role_slug) {
      return NextResponse.json(
        { error: "Name, email, phone, and role are required." },
        { status: 400 },
      );
    }

    const opening = getOpeningBySlug(role_slug);
    if (!opening) {
      return NextResponse.json({ error: "Invalid role selected." }, { status: 400 });
    }

    const reference_number = generateReferenceNumber();

    const { data, error } = await supabaseAdmin
      .from("job_applications")
      .insert({
        reference_number,
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        location: location?.trim() || null,
        role_slug: opening.slug,
        role_title: opening.title,
        cover_note: cover_note?.trim() || null,
        cv_url: cv_url || null,
        cv_public_id: cv_public_id || null,
        status: "applied",
      })
      .select("id, reference_number, role_title, created_at")
      .single();

    if (error) {
      console.error("[POST /api/careers/apply]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const emailResult = await sendApplicationConfirmationEmail({
      fullName: full_name.trim(),
      email: email.trim().toLowerCase(),
      roleTitle: data.role_title,
      referenceNumber: data.reference_number,
      submittedAt: data.created_at,
    });

    if (!emailResult.sent) {
      console.warn(
        "[POST /api/careers/apply] Confirmation email not sent:",
        emailResult.error,
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        reference_number: data.reference_number,
        role_title: data.role_title,
        submitted_at: data.created_at,
        confirmation_email_sent: emailResult.sent,
      },
    });
  } catch (err) {
    console.error("[POST /api/careers/apply]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
