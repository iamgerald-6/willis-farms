// Single source of truth for the "from" address on every Task Manager email
// — assignment notifications (taskManagerNotifications.ts), deadline
// reminders (reminders/sendReminders.ts), and monthly reports
// (reports/sendMonthlyReport.tsx). All three used to hardcode this string
// independently.
//
// Falls back to Resend's shared sandbox sender when no verified domain
// address is configured — that sandbox address only reliably delivers to
// the Resend account's own verified test email, not to real staff inboxes,
// so it's fine for local development but NOT for production. Set
// RESEND_FROM_EMAIL to a "Name <address@yourverifieddomain.com>" string
// once a domain is verified in Resend, and every Task Manager email switches
// over automatically — no code change needed.
export const TASK_MANAGER_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "Wills Farms Task Manager <onboarding@resend.dev>";
