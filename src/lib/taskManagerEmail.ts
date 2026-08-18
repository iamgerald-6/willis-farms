import { getResendFromAddress } from "@/lib/email/resendClient";

// Single source of truth for the "from" address on every Task Manager email
// — assignment notifications (taskManagerNotifications.ts), deadline
// reminders (reminders/sendReminders.ts), and monthly reports
// (reports/sendMonthlyReport.tsx). All three used to hardcode this string
// independently, and separately from the rest of the app's own emails
// (careers, appraisal), which had the exact same "from" fallback typed out
// by hand yet again. getResendFromAddress (in src/lib/email/resendClient.ts)
// is now the one place that fallback actually lives — this just gives Task
// Manager's emails their own display label ("Wills Farms Task Manager")
// while sharing the same underlying address/env-var logic as everyone
// else's emails.
//
// Falls back to Resend's shared sandbox sender when no verified domain
// address is configured — that sandbox address only reliably delivers to
// the Resend account's own verified test email, not to real staff inboxes,
// so it's fine for local development but NOT for production. Set
// RESEND_FROM_EMAIL to a "Name <address@yourverifieddomain.com>" string
// once a domain is verified in Resend, and every email in the app —not just
// Task Manager's — switches over automatically, no code change needed.
export const TASK_MANAGER_FROM_EMAIL = getResendFromAddress("Wills Farms Task Manager");
