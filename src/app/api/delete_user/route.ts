import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireSeniorManagement,
  jsonForbidden,
} from "@/lib/apiRequestAuth";

export async function DELETE(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const caller = await requireSeniorManagement(req);
  if (!caller) {
    return jsonForbidden(
      "Forbidden — admin, manager, or super_admin access required.",
    );
  }

  try {
    const { userIds } = await req.json();

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: "No user IDs provided" },
        { status: 400 }
      );
    }

    const errors: string[] = [];

    for (const userId of userIds) {
      const { error: tableError } = await supabaseAdmin
        .from("users")
        .delete()
        .eq("user_id", userId);

      if (tableError) {
        errors.push(`DB delete failed for ${userId}: ${tableError.message}`);
        continue;
      }

      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(
        userId
      );

      if (authError) {
        errors.push(`Auth delete failed for ${userId}: ${authError.message}`);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(", ") }, { status: 207 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
