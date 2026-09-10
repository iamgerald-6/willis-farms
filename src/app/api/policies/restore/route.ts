import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writePolicyAuditLog } from "@/lib/policyAuditLog";
import { getApiRequestUser } from "@/lib/apiRequestAuth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body as { id?: string };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("manuals")
      .update({ archived_at: null })
      .eq("id", id)
      .select("id, title")
      .single();

    if (error) {
      console.error("[POST /api/policies/restore]", error);
      return NextResponse.json(
        { error: "Failed to restore manual" },
        { status: 500 },
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Manual not found" }, { status: 404 });
    }

    const apiUser = await getApiRequestUser(req);

    await writePolicyAuditLog({
      manual_id: id,
      manual_title: data.title,
      action: "restored",
      performed_by: apiUser?.id ?? null,
      performed_by_name: apiUser?.name ?? null,
    });

    return NextResponse.json({ success: true, manual: data });
  } catch (err) {
    console.error("[POST /api/policies/restore]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
