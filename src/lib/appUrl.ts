import { siteContent } from "@/content/siteContent";

/**
 * Base URL for links in transactional emails, used across every feature
 * that emails a link back into the app (careers/recruitment, Task Manager
 * notifications/reminders/reports, etc.) — a single place so a domain
 * change or a Vercel preview deploy is handled correctly everywhere at
 * once, instead of each feature keeping its own copy of this fallback
 * chain.
 * Local dev → http://localhost:3000; a Vercel preview → that preview's own
 * URL; production → siteContent.seo.siteUrl.
 */
export function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }
  return siteContent.seo.siteUrl.replace(/\/$/, "");
}

export function recruitmentInterviewUrl(applicationId: string): string {
  return `${getAppBaseUrl()}/dashboard/humanCapital/recruitment?interview=${applicationId}`;
}
