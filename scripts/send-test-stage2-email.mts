import { sendStage2ScheduleEmail } from "../src/lib/careers/interviewEmails";

const to = process.argv[2] ?? "geraldsix89@gmail.com";

const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const result = await sendStage2ScheduleEmail({
  candidateName: "Gerald Test",
  candidateEmail: to,
  roleTitle: "Farm Assistant (Test)",
  referenceNumber: "WF-TEST-001",
  scheduledAt,
  location: "Wills Farms — Main Site",
  stage2Duration: "Half day (approx. 4 hours)",
});

console.log(JSON.stringify({ to, ...result }, null, 2));
process.exit(result.sent ? 0 : 1);
