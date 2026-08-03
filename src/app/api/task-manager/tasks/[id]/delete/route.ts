import { NextRequest, NextResponse } from "next/server";
import { requireSeniorManagement } from "@/lib/taskManagerAuth";
import { applyLifecycleChange } from "@/lib/taskManagerData";

// Soft delete only — lifecycle_status flips to "deleted", the row and its
// full audit trail stay in the database. Nothing is ever hard-deleted.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  const result = await applyLifecycleChange(id, "deleted", user);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task });
}
