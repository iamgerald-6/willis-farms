"use client";

import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  roleTitle: string;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeclineOfferConfirmModal({
  open,
  roleTitle,
  confirming = false,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="decline-offer-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-label="Close"
        onClick={confirming ? undefined : onCancel}
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 id="decline-offer-title" className="text-lg font-bold text-gray-900">
          Decline this offer?
        </h2>
        <p className="text-sm text-gray-600">
          You are about to decline the offer for{" "}
          <strong>{roleTitle}</strong>. Our HR team will be notified and this cannot be
          undone from this link.
        </p>
        <p className="text-xs text-gray-500">
          If you clicked this by mistake, choose Cancel and contact HR at{" "}
          <a href="mailto:info@willsfarms.com" className="text-red-600 hover:underline">
            info@willsfarms.com
          </a>
          .
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
          >
            {confirming && <Loader2 className="w-4 h-4 animate-spin" />}
            Yes, decline offer
          </button>
        </div>
      </div>
    </div>
  );
}
