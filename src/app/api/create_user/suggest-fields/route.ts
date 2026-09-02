import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireUserManagementAccess,
  jsonForbidden,
} from "@/lib/apiRequestAuth";
import {
  collectExistingEmployeeIds,
  suggestCompanyEmail,
  suggestEmployeeId,
} from "@/lib/careers/hrEmployeeDefaults";
import { fetchModuleConfig } from "@/lib/systemDefinitions/getModuleConfig";
import { resolveCompanyEmailDomain } from "@/lib/systemDefinitions/companyEmailDomain";
import { RECRUITMENT_MODULE_ID } from "@/lib/systemDefinitions/recruitmentDefaults";

/** Suggest employee ID and company login email for manual platform invites. */
export async function GET(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const caller = await requireUserManagementAccess(req, "add");
  if (!caller) {
    return jsonForbidden(
      "Forbidden — User Management add or edit access required.",
    );
  }

  try {
    const firstName = req.nextUrl.searchParams.get("first_name")?.trim() ?? "";
    const lastName = req.nextUrl.searchParams.get("last_name")?.trim() ?? "";

    const moduleConfig = await fetchModuleConfig(supabaseAdmin, RECRUITMENT_MODULE_ID);
    const emailDomain = resolveCompanyEmailDomain(moduleConfig.businessLogic);

    const { companyIds, companyEmails } =
      await collectExistingEmployeeIds(supabaseAdmin);

    const employee_id = suggestEmployeeId(companyIds);

    let company_email: string | null = null;
    if (firstName && lastName) {
      company_email = suggestCompanyEmail({
        firstName,
        lastName,
        existingEmails: companyEmails,
        domain: emailDomain,
      });
    }

    return NextResponse.json({
      success: true,
      data: { employee_id, company_email },
    });
  } catch (err) {
    console.error("[GET /api/create_user/suggest-fields]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
