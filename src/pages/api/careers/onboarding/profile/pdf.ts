import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  employeeProfilePdfFileName,
  loadEmployeeProfileExportData,
} from "@/lib/careers/loadEmployeeProfileExportData";
import { validateOnboardingToken } from "@/lib/careers/onboardingTokens";
import { isCandidateOnboardingComplete } from "@/lib/careers/onboardingTypes";
import type { OnboardingFormData } from "@/lib/careers/onboardingTypes";
import { renderEmployeeProfilePdf } from "@/lib/reports/renderEmployeeProfilePdf";

// Pages Router — @react-pdf/renderer does not run reliably in the App Router.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const token =
    typeof req.query.token === "string" ? req.query.token.trim() : "";
  const applicationId =
    typeof req.query.application_id === "string"
      ? req.query.application_id.trim()
      : "";

  if (!token && !applicationId) {
    return res.status(400).json({ error: "token or application_id is required." });
  }

  try {
    let resolvedApplicationId = applicationId;

    if (token) {
      const validation = await validateOnboardingToken(supabaseAdmin, token);
      if (!validation.ok) {
        return res.status(validation.reason === "not_found" ? 404 : 410).json({
          error: "This onboarding link is invalid or expired.",
        });
      }
      resolvedApplicationId = validation.applicationId;

      const { data: submission } = await supabaseAdmin
        .from("onboarding_submissions")
        .select("form_data, submitted_at")
        .eq("application_id", resolvedApplicationId)
        .maybeSingle();

      if (
        !isCandidateOnboardingComplete(
          submission?.form_data as OnboardingFormData,
          submission?.submitted_at,
        )
      ) {
        return res.status(400).json({
          error: "Profile download is available after onboarding is submitted.",
        });
      }
    }

    const exportData = await loadEmployeeProfileExportData(
      supabaseAdmin,
      resolvedApplicationId,
    );

    if (!exportData) {
      return res.status(404).json({ error: "Employee profile not found." });
    }

    const pdfBuffer = await renderEmployeeProfilePdf(exportData);
    const fileName = employeeProfilePdfFileName(exportData.header.fullName);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("[GET /api/careers/onboarding/profile/pdf]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
