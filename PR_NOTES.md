# Interview panel workflow + recruitment dashboard improvements

## Interview panel setup & scheduling
- Autosave for the Panel setup step, Stage 2 setup step, and HR's in-progress Stage 1/2 answers — no more losing work if a tab closes mid-form, with a "Saving…/Draft saved" indicator.
- Fixed a bug where "Open panel forms now" closed the application window instead of showing the form.
- Added a Stage 2 continue-to-form button and panel form draft autosave.
- Panel setup now locks once forms are opened, with a "Reschedule" escape hatch for when plans change. Reschedule gating reworked to be completion-based, and it now preserves prior submissions as editable instead of deleting them.
- Panel members can be marked "couldn't make it" — they're excluded from the completion gate and from invite sends, and shown accordingly in the grader matrix.
- Renamed the "Panel" workflow step to "Stage 1 setup" for clarity.
- Panel members and HR now get an actual calendar invite (not just a plain link) when Stage 1/2 invites are sent: a `.ics` attachment plus "Add to Google Calendar" / "Add to Outlook.com" links. Previously HR received no email at all for this step.

## Evaluation & AI analysis
- The critical concerns checklist is now a real input into the AI evaluation summary, not just recited back.
- The AI genuinely weighs the checklist instead of parroting it.
- The "Finish" button on the evaluation step is now gated on AI analysis having been generated first.

## Reports — individual interview report
- Added a Stage / Location / Date & time table under "Applicant & interview details," split by Stage 1 and Stage 2, with panel names tracked per stage instead of combined.
- Decision history summary now shows in the on-screen (editable and read-only) views — previously it only rendered in the PDF.
- Downloading or emailing the report now sends both the AI-generated and HR-edited copies together (zipped), instead of only the most recent one.
- PDF's panel-responses appendix now links back to the platform instead of embedding raw responses inline.

## Reports — role hiring summary
- The "All Applicants" section is now broken into 5 separate tables by furthest funnel stage reached (Application, Screening, Interview Stage 1, Interview Stage 2, Evaluation) instead of one combined table. Stages with no applicants are hidden from the downloaded/emailed PDF.
- The AI-generated role hiring summary can now be viewed directly from an individual applicant's page once their outcome (hire/hold/reject) is confirmed, not just from the standalone role-report modal.
- Downloading or emailing this report now also sends both the AI-generated and HR-edited copies together (zipped).

## Recruitment dashboard
- Tabs reordered and expanded to follow application status end-to-end: Job posting → Applications → Screening → Interview → Evaluation → Offer → Onboarding → Employees.
- Hold/Reserve candidates are now shown via a popup list (with applied date) instead of a permanent row on the Evaluation tab.
- Pagination added across every tab.
- "Update status" and "Reconsider outcome" sections are now hidden for rejected candidates — rejection is effectively terminal in the UI.

## Applications & HR process
- HR notes are now required before specific status transitions, and are archived against the status change they were left on — both reports now narrate this history.
- Added applicant document tagging plus an AI certificate-validation summary.
- Job application form now format-validates name, phone, and email fields.
- Renamed the AI screening box heading to "AI job posting screening" for clarity.

## Housekeeping
- Stopped tracking generated `tsconfig.tsbuildinfo` and `next-env.d.ts` files.

---
**Stats:** 35 commits, 44 files changed (+3,792 / −796) vs. `origin/develop`.
