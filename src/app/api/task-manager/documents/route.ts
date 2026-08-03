import { NextRequest, NextResponse } from "next/server";
import { requireSeniorManagement, supabaseAdmin } from "@/lib/taskManagerAuth";
import type { PortalDocument } from "@/types/taskManager";

// GET /api/task-manager/documents — Senior Management only.
// Aggregates documents already uploaded elsewhere in the portal (Policies &
// Ops manuals, SOP library) so extraction can run against something that's
// already there, instead of always requiring a fresh upload.
export async function GET(req: NextRequest) {
  const user = await requireSeniorManagement(req);
  if (!user) return NextResponse.json({ error: "Forbidden — Senior Management only" }, { status: 403 });

  const documents: PortalDocument[] = [];

  // ── Policies & Ops manuals — use each manual's most recent version ──
  const { data: manuals, error: manualsError } = await supabaseAdmin
    .from("manuals")
    .select("id, title, category")
    .order("created_at", { ascending: false });

  if (!manualsError && manuals?.length) {
    const manualIds = manuals.map((m) => m.id);
    const { data: versions } = await supabaseAdmin
      .from("manual_versions")
      .select("manual_id, cloudinary_url, file_name, uploaded_at")
      .in("manual_id", manualIds)
      .order("uploaded_at", { ascending: false });

    const latestByManual = new Map<string, { cloudinary_url: string; file_name: string; uploaded_at: string }>();
    for (const v of versions ?? []) {
      if (!latestByManual.has(v.manual_id)) latestByManual.set(v.manual_id, v);
    }

    for (const m of manuals) {
      const latest = latestByManual.get(m.id);
      if (!latest) continue;
      documents.push({
        id: `manual-${m.id}`,
        title: m.title,
        source: "Policies & Ops",
        category: m.category,
        file_name: latest.file_name,
        url: latest.cloudinary_url,
        uploaded_at: latest.uploaded_at,
      });
    }
  }

  // ── SOP / content library — only rows that actually have a document ──
  const { data: contentRows, error: contentError } = await supabaseAdmin
    .from("content")
    .select("id, title, category, document_url, created_at")
    .not("document_url", "is", null)
    .order("created_at", { ascending: false });

  if (!contentError) {
    for (const c of contentRows ?? []) {
      if (!c.document_url) continue;
      documents.push({
        id: `sop-${c.id}`,
        title: c.title,
        source: "SOP",
        category: c.category,
        file_name: c.title,
        url: c.document_url,
        uploaded_at: c.created_at,
      });
    }
  }

  documents.sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));

  return NextResponse.json({ documents });
}
