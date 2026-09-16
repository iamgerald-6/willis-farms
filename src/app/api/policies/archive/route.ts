import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writePolicyAuditLog } from "@/lib/policyAuditLog";
import { requirePolicyManageAccess } from "@/lib/apiRequestAuth";
import { assertSiteAccess, getAuthorizedSiteIds } from "@/lib/siteAccess";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const apiUser = await requirePolicyManageAccess(req);
    if (!apiUser) {
      return NextResponse.json(
        { error: "Forbidden — you don't have access to manage Policies." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { id } = body as { id?: string };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // A SITE-scoped caller can only archive a manual that's untagged
    // (visible to everyone) or already tagged to their own site.
    if (getAuthorizedSiteIds(apiUser).scope !== "ALL_SITES") {
      const { data: existingTags } = await supabase
        .from("manual_sites")
        .select("site_id")
        .eq("manual_id", id);
      const tags = (existingTags ?? []).map((r) => r.site_id);
      const allowed = tags.length === 0 || tags.some((t) => assertSiteAccess(apiUser, t));
      if (!allowed) {
        return NextResponse.json(
          { error: "Forbidden — this manual isn't tagged to a site you have access to." },
          { status: 403 },
        );
      }
    }

    const { data, error } = await supabase
      .from("manuals")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, title")
      .single();

    if (error) {
      console.error("[POST /api/policies/archive]", error);
      return NextResponse.json(
        { error: "Failed to archive manual" },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Manual not found" }, { status: 404 });
    }

    await writePolicyAuditLog({
      manual_id: id,
      manual_title: data.title,
      action: "archived",
      performed_by: apiUser?.id ?? null,
      performed_by_name: apiUser?.name ?? null,
    });

    return NextResponse.json({ success: true, manual: data });
  } catch (err) {
    console.error("[POST /api/policies/archive]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
