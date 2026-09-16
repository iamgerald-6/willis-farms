"use client";

import SOPManagementPage from "@/app/(dashboard)/dashboard/sop/components/SOPManagementPage";
import { useIsHeadquarters } from "@/hooks/useIsHeadquarters";

// Standalone route kept alive for direct links and for anyone with the
// delegated "sop:add" permission (Access Control) who isn't L4+/a manager —
// same content now also reachable via the "Manage" toggle on /dashboard/sop.
// SOP Management is headquarters-only (see isHeadquartersCaller in
// apiRequestAuth.ts, which the server enforces regardless of this page) —
// unlike the toggle on /dashboard/sop, this route has no other gate, so it
// needs its own check here.
export default function AddSopPage() {
  const { isHeadquarters, isLoading } = useIsHeadquarters();
  if (isLoading) return null;
  if (!isHeadquarters) {
    return (
      <div className="p-8 text-sm text-gray-500">
        SOP Management is available only to headquarters staff.
      </div>
    );
  }
  return <SOPManagementPage />;
}
