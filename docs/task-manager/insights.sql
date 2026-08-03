-- Round 9: month-over-month trend data for the executive summary page.
--
-- The report's opening page now asks Claude for recommendations grounded in
-- how things have moved since last month (overdue count rising/falling,
-- which projects/owners are trending better or worse), not just a snapshot
-- of the current month in isolation. That needs somewhere to keep last
-- month's numbers around after the report that computed them is gone.
--
-- Run this before generating the next monthly report.

alter table tm_monthly_reports add column if not exists stats_snapshot jsonb;

-- Nothing to backfill — reports already sent didn't capture a snapshot, so
-- the very first report generated after this migration simply won't have a
-- prior month to compare against (handled gracefully in code). Every report
-- from here on stores its own snapshot for the next one to compare to.
