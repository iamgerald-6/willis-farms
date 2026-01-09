import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  const rl = rateLimit(`lead:${ip}`, { windowMs: 60_000, max: 10 }); // 10 requests/minute/ip
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  const leadType = String(body.leadType || "");
  if (!["gilts", "pork"].includes(leadType)) {
    return NextResponse.json({ error: "Invalid lead type." }, { status: 400 });
  }

  // Minimal validation
  const fullName = String(body.fullName || "").trim();
  const company = String(body.company || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();
  const location = String(body.location || "").trim();

  if (!fullName || !company || !phone || !email || !location) {
    return NextResponse.json(
      { error: "Please complete all required fields." },
      { status: 400 }
    );
  }

  // Honeypot (server-side)
  const hp = String(body.company_website || "").trim();
  if (hp.length > 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const record = {
    received_at: new Date().toISOString(),
    ip_address: ip,
    lead_type: leadType,
    full_name: fullName,
    company,
    phone,
    email,
    location,
    status: "new",
    payload: body,
  };

  // Persist to Supabase if configured; otherwise log as fallback.
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { error } = await supabase.from("leads").insert(record);
    if (error) {
      // Log and continue with a friendly response (avoid exposing internals).
      console.error("SUPABASE_INSERT_ERROR", error);
      console.log("NEW_LEAD_FALLBACK", JSON.stringify(record));
    }
  } else {
    console.log("NEW_LEAD", JSON.stringify(record));
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
