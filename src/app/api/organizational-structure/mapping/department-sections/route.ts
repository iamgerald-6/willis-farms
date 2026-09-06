import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";

/** GET — every Department set up mapping row (site_id, business_unit_id, department_id, section_id). */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "view");
    if (!caller) {
      return jsonForbidden("System Definitions view access is required.");
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("org_department_sections")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST — map a section as available under an already-mapped site+business-unit+department chain. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden("System Definitions add access is required.");
    }

    const body = await req.json();
    const siteId = body.site_id as string | undefined;
    const businessUnitId = body.business_unit_id as string | undefined;
    const departmentId = body.department_id as string | undefined;
    const sectionId = body.section_id as string | undefined;

    if (!siteId || !businessUnitId || !departmentId || !sectionId) {
      return NextResponse.json(
        { error: "site_id, business_unit_id, department_id, and section_id are required" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("org_department_sections")
      .insert([
        {
          site_id: siteId,
          business_unit_id: businessUnitId,
          department_id: departmentId,
          section_id: sectionId,
        },
      ])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "That section is already mapped to this site + business unit + department." },
          { status: 409 },
        );
      }
      if (error.code === "23503") {
        return NextResponse.json(
          {
            error:
              "That site + business unit + department chain hasn't been mapped in Business unit set up yet.",
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
