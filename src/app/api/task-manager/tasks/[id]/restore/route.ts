import { NextRequest, NextResponse } from "next/server";
import { requireSeniorManagement } from "@/lib/taskManagerAuth";
import { applyLifecycleChange } from "@/lib/taskManagerData";

// Brings a completed/archived/deleted task back to "active".
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  const result = await applyLifecycleChange(id, "restored", user);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task });
}
