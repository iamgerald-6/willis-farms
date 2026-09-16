import { NextRequest, NextResponse } from "next/server";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";
import { getAuthorizedSiteIds } from "@/lib/siteAccess";

// GET/PUT tm_report_schedule — automatic monthly report config (on/off,
// which day of the month, who it goes to). Now one row per site (site_id
// set) plus at most one company-wide row (site_id null, unfiltered — every
// project) — see docs/multi-site/add-site-id-tm-report-schedule.sql. The
// cron job (src/lib/reports/scheduledReportRunner.ts) reads every row.
//
// A caller not at headquarters can only see/manage their OWN site's row —
// same rule enforced everywhere else in the app (docs/
// SITE_ACCESS_ARCHITECTURE.md §2). The company-wide row is headquarters-only,
// since it necessarily includes every other site's data too.

export async function GET(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  const authorization = getAuthorizedSiteIds(user);

  if (authorization.scope === "ALL_SITES") {
    const { data, error } = await supabaseAdmin.from("tm_report_schedule").select("*").order("site_id", { ascending: true, nullsFirst: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ schedules: data ?? [] });
  }

  // Site-scoped caller: only their own site's row, auto-created (disabled,
  // no recipients yet) so the settings screen always has something to
  // render rather than a 404 before anyone's ever saved one.
  const siteId = authorization.siteId;
  if (siteId == null) {
    return NextResponse.json({ schedules: [] });
  }

  const { data: existing, error: fetchError } = await supabaseAdmin.from("tm_report_schedule").select("*").eq("site_id", siteId).maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (existing) return NextResponse.json({ schedules: [existing] });

  const { data: created, error: createError } = await supabaseAdmin
    .from("tm_report_schedule")
    .insert([{ enabled: false, day_of_month: 1, recipients: [], site_id: siteId }])
    .select()
    .single();
  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
  return NextResponse.json({ schedules: [created] });
}

export async function PUT(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  try {
    const { enabled, day_of_month, recipients, site_id } = await req.json();

    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
    }
    const day = Number(day_of_month);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      return NextResponse.json({ error: "day_of_month must be an integer between 1 and 28" }, { status: 400 });
    }
    const emails: string[] = Array.isArray(recipients) ? recipients.map((e: string) => e.trim()).filter(Boolean) : [];
    if (enabled && emails.length === 0) {
      return NextResponse.json({ error: "Add at least one recipient before enabling the schedule" }, { status: 400 });
    }

    // A site-scoped caller can only ever write their own site's row,
    // regardless of what site_id the client sent — same override pattern
    // used for SiteTagPicker/sop upload/policies create this session. Only
    // a headquarters caller may target a specific site or the company-wide
    // (null) row.
    const authorization = getAuthorizedSiteIds(user);
    let targetSiteId: number | null;
    if (authorization.scope === "ALL_SITES") {
      targetSiteId = site_id == null ? null : Number(site_id);
    } else {
      if (authorization.siteId == null) {
        return NextResponse.json({ error: "Forbidden — you're not placed at a site." }, { status: 403 });
      }
      targetSiteId = authorization.siteId;
    }

    // Postgres can't match a plain .eq against a null column, so the
    // company-wide row needs .is() instead — mirrors the coalesce(-1) trick
    // used by the unique index itself.
    const { data: existingRow } =
      targetSiteId == null
        ? await supabaseAdmin.from("tm_report_schedule").select("id").is("site_id", null).maybeSingle()
        : await supabaseAdmin.from("tm_report_schedule").select("id").eq("site_id", targetSiteId).maybeSingle();

    const payload = { enabled, day_of_month: day, recipients: emails, site_id: targetSiteId, updated_at: new Date().toISOString() };

    const { data, error } = existingRow
      ? await supabaseAdmin.from("tm_report_schedule").update(payload).eq("id", existingRow.id).select().single()
      : await supabaseAdmin.from("tm_report_schedule").insert([payload]).select().single();
    if (error) throw error;

    return NextResponse.json({ schedule: data });
  } catch (err: any) {
    console.error("[PUT /api/task-manager/reports/schedule]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
