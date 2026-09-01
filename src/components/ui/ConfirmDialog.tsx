"use client";

import { AlertTriangle } from "lucide-react";

/**
 * Shared in-app replacement for the browser's native `confirm()` popup —
 * unstyled system dialogs don't match the rest of the UI (no rounded
 * corners, no brand colors, can't show a loading state while the action
 * runs). Used across Recruitment and Task Manager wherever a destructive or
 * hard-to-undo action needs a yes/no check first.
 *
 * Usage: keep a `useState(false)` flag per confirmation, open it on the
 * triggering button's click instead of calling `confirm()` inline, and run
 * the actual action from `onConfirm` (closing the dialog yourself once it's
 * done, or immediately if there's nothing async to wait for).
 */
export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  confirming = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + warning icon, for destructive/hard-to-undo actions. */
  destructive?: boolean;
  /** Disables the confirm button and swaps its label to a "…ing" state while an action is in flight. */
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            {destructive && (
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4.5 h-4.5 text-red-600" />
              </div>
            )}
            <div>
              <h2 className="text-sm font-bold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-600 mt-1">{message}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className={`px-3 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-60 ${
              destructive ? "bg-red-600 hover:bg-red-700" : "bg-gray-900 hover:bg-gray-800"
            }`}
          >
            {confirming ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
