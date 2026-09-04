import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminFromAuth,
  jsonForbidden,
  requireSystemDefinitionsAccess,
} from "@/lib/apiRequestAuth";

export type SiteBusinessUnitRow = {
  id: string;
  site_id: string;
  site_label: string;
  business_unit_id: string;
  business_unit_label: string;
  created_at: string;
};

/** GET — every Site ↔ Business unit mapping, with labels attached for display. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "view");
    if (!caller) {
      return jsonForbidden(
        "System Definitions view access is required to view mappings.",
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data, error } = await supabase
      .from("site_business_units")
      .select(
        "id, site_id, business_unit_id, created_at, sites(label), business_units(label)",
      )
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type Joined = {
      id: string;
      site_id: string;
      business_unit_id: string;
      created_at: string;
      sites: { label: string } | { label: string }[] | null;
      business_units: { label: string } | { label: string }[] | null;
    };

    const flat: SiteBusinessUnitRow[] = ((data ?? []) as Joined[]).map((row) => {
      const site = Array.isArray(row.sites) ? row.sites[0] : row.sites;
      const businessUnit = Array.isArray(row.business_units)
        ? row.business_units[0]
        : row.business_units;
      return {
        id: row.id,
        site_id: row.site_id,
        site_label: site?.label ?? "Unknown site",
        business_unit_id: row.business_unit_id,
        business_unit_label: businessUnit?.label ?? "Unknown business unit",
        created_at: row.created_at,
      };
    });

    return NextResponse.json({ data: flat });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — add a new Site ↔ Business unit mapping. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireSystemDefinitionsAccess(req, "add");
    if (!caller) {
      return jsonForbidden(
        "System Definitions add access is required to add a mapping.",
      );
    }

    const body = await req.json();
    const siteId = (body.site_id as string | undefined)?.trim();
    const businessUnitId = (body.business_unit_id as string | undefined)?.trim();

    if (!siteId || !businessUnitId) {
      return NextResponse.json(
        { error: "site_id and business_unit_id are required" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdminFromAuth();
    if (!supabase) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const { data, error } = await supabase
      .from("site_business_units")
      .insert([{ site_id: siteId, business_unit_id: businessUnitId }])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This site is already mapped to that business unit." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
