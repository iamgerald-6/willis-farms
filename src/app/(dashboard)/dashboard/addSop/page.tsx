"use client";

import SOPManagementPage from "@/app/(dashboard)/dashboard/sop/components/SOPManagementPage";

// Standalone route kept alive for direct links and for anyone with the
// delegated "sop:add" permission (Access Control) who isn't L4+/a manager —
// same content now also reachable via the "Manage" toggle on /dashboard/sop.
export default function AddSopPage() {
  return <SOPManagementPage />;
}
