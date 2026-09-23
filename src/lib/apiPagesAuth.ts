import type { NextApiRequest } from "next";
import type { NextRequest } from "next/server";

/** Minimal adapter so Pages API routes can reuse App Router auth helpers
 *  that read Authorization via headers.get() — see task-manager/reports/send. */
export function toNextRequest(req: NextApiRequest): NextRequest {
  return {
    headers: {
      get: (name: string) => {
        const value = req.headers[name.toLowerCase()];
        return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
      },
    },
  } as unknown as NextRequest;
}
