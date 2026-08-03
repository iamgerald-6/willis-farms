import type { NextApiRequest, NextApiResponse } from "next";
import type { NextRequest } from "next/server";
import { requireSeniorManagement } from "@/lib/taskManagerAuth";
import { sendMonthlyReport } from "@/lib/reports/sendMonthlyReport";

// This lives in the Pages Router (src/pages/api/...) rather than the App
// Router (src/app/api/...) that every other Task Manager route uses. That's
// deliberate, not an oversight: @react-pdf/renderer's renderToBuffer()
// crashes with "Minified React error #31" specifically inside Next's App
// Router request handling (a currently-unresolved upstream issue — see
// https://github.com/diegomura/react-pdf/issues/2994 and
// https://github.com/diegomura/react-pdf/issues/2940). Confirmed via a
// side-by-side test: the exact same component/data/react-pdf version
// worked from a Pages API route and from a plain Node script, and failed
// identically from an App Router route regardless of bundler (webpack vs
// Turbopack), react-pdf version (3.4.4 vs 4.x), or reactStrictMode. If
// react-pdf ships a fix for the App Router case later, this can move back
// to src/app/api/task-manager/reports/send/route.tsx to match the rest of
// the app — until then, leave it here.
//
// requireSeniorManagement()/getRequestUser() only read the Authorization
// header, so a minimal object with a fetch-style headers.get() is enough
// to reuse them as-is rather than duplicating the auth/role-lookup logic.
function toNextRequest(req: NextApiRequest): NextRequest {
  return {
    headers: {
      get: (name: string) => {
        const value = req.headers[name.toLowerCase()];
        return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
      },
    },
  } as unknown as NextRequest;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireSeniorManagement(toNextRequest(req));
    if (!user) return res.status(403).json({ error: "Forbidden — Senior Management only" });

    const { period_start, period_end, recipients } = req.body ?? {};
    if (!period_start || !period_end || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: "period_start, period_end and at least one recipient are required" });
    }

    const result = await sendMonthlyReport({
      period_start,
      period_end,
      recipients,
      generatedByUserId: user.id,
      generatedByName: user.name,
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[POST /api/task-manager/reports/send]", err);
    return res.status(500).json({ error: err.message ?? "Failed to send report" });
  }
}
