import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/admin/:path*"],
};

function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Wills Farms Admin", charset="UTF-8"',
    },
  });
}

function decodeBasicAuth(b64: string) {
  // Middleware runs on the Edge runtime; use atob.
  try {
    return atob(b64);
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;

  // If credentials are not set, allow access (useful for local dev).
  // IMPORTANT: Set ADMIN_USER and ADMIN_PASSWORD in production.
  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (!auth || !auth.toLowerCase().startsWith("basic ")) return unauthorized();

  const b64 = auth.split(" ")[1] || "";
  const decoded = decodeBasicAuth(b64);
  if (!decoded) return unauthorized();

  const [u, p] = decoded.split(":");
  if (u === user && p === pass) return NextResponse.next();

  return unauthorized();
}
