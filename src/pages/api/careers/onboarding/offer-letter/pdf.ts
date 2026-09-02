import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { OnboardingHrData } from "@/lib/careers/onboardingTypes";
import type { JobApplication } from "@/lib/careers/types";
import { resolveOfferLetterContext } from "@/lib/careers/resolveOfferLetterContext";
import { renderOfferLetterPdf } from "@/lib/reports/renderOfferLetterPdf";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const applicationId = req.query.application_id;
  if (!applicationId || typeof applicationId !== "string") {
    return res.status(400).json({ error: "application_id is required." });
  }

  try {
    const { data: application, error: appError } = await supabaseAdmin
      .from("job_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: "Application not found." });
    }

    const { data: submission } = await supabaseAdmin
      .from("onboarding_submissions")
      .select("hr_data")
      .eq("application_id", applicationId)
      .maybeSingle();

    const hr = (submission?.hr_data ?? {}) as OnboardingHrData;
    const draft = hr.offer_letter_draft?.trim();
    if (!draft) {
      return res.status(400).json({ error: "Generate or save an offer letter draft first." });
    }

    const context = await resolveOfferLetterContext(
      supabaseAdmin,
      application as JobApplication,
      hr,
    );

    const pdfBuffer = await renderOfferLetterPdf({
      ...context,
      body: draft,
    });

    const safeName = application.full_name
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="offer-letter-${safeName}.pdf"`,
    );
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error("[GET /api/careers/onboarding/offer-letter/pdf]", err);
    return res.status(500).json({ error: "Failed to generate offer letter PDF." });
  }
}
