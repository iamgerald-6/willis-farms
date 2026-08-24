-- One-off fix: these applicants finalized their interview evaluation before
-- the status-change fix shipped, so their status is stuck on "interview"
-- instead of "evaluation". Only touches rows whose evaluation was actually
-- finalized (interview_submitted_at is set), and won't affect anyone whose
-- status has already moved past evaluation (hold/onboarding/offer/rejected).

update public.job_applications
set status = 'evaluation'
where reference_number in ('WF-2026-B3XKNV', 'WF-2026-BOYCX8', 'WF-2026-SRBM6R')
  and interview_submitted_at is not null
  and status = 'interview';
