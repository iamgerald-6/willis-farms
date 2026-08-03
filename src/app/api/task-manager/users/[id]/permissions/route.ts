import { NextRequest, NextResponse } from "next/server";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";

// PATCH /api/task-manager/users/[id]/permissions — Senior Management only.
// Grants or revokes tm_can_view_all_tasks for one user. Separate from the
// general Add/Delete User flow (src/app/api/create_user,
// src/app/api/delete_user) since this is Task-Manager-specific, not a
// full user-account operation.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  try {
    const { tm_can_view_all_tasks } = await req.json();
    if (typeof tm_can_view_all_tasks !== "boolean") {
      return NextResponse.json({ error: "tm_can_view_all_tasks must be true or false" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("users")
      .update({ tm_can_view_all_tasks })
      .eq("user_id", id)
      .select("user_id, tm_can_view_all_tasks")
      .single();
    if (error) throw error;

    return NextResponse.json({ user: data });
  } catch (err: any) {
    console.error("[PATCH /api/task-manager/users/[id]/permissions]", err);
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
  }
}
