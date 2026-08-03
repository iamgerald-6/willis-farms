import { siteContent } from "@/content/siteContent";

/**
 * Base URL for links in transactional emails.
 * Local dev → http://localhost:3000; production → siteContent.seo.siteUrl.
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
