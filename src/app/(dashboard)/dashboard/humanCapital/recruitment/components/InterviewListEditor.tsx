"use client";

import { Fragment } from "react";
import { Plus } from "lucide-react";

/**
 * Shared add/edit/remove-rows list UI, used by the per-posting Interview
 * setup screen (PostingInterviewSetup.tsx) for its Screening, Questions,
 * Scenarios, Evaluation checklist, and Extra stages tabs. Pulled out into
 * its own file (previously lived inside the now-retired, shared
 * grade-level InterviewGuidesEditor.tsx) so Interview setup keeps working
 * once that editor is removed.
 */
export function ListEditor<T extends { id: string }>({
  title,
  items,
  onChange,
  renderRow,
  onAdd,
  allowEdit,
}: {
  title: string;
  items: T[] | undefined;
  onChange: (items: T[]) => void;
  renderRow: (
    item: T,
    onPatch: (patch: Partial<T>) => void,
    onRemove: () => void,
  ) => React.ReactNode;
  onAdd: () => T;
  allowEdit: boolean;
}) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-800">{title}</p>
      <div className="space-y-2">
        {safeItems.length === 0 && (
          <p className="text-sm text-gray-400 italic text-center py-4">No rows yet.</p>
        )}
        {safeItems.map((item, index) => (
          <Fragment key={item.id || `row-${index}`}>
            {renderRow(
              item,
              (patch) => {
                const next = [...safeItems];
                next[index] = { ...item, ...patch };
                onChange(next);
              },
              () => onChange(safeItems.filter((_, i) => i !== index)),
            )}
          </Fragment>
        ))}
      </div>
      {/* Placed right after the rows, not above them, so adding another row
          after scrolling down doesn't require scrolling back to the top. */}
      {allowEdit && (
        <button
          type="button"
          onClick={() => onChange([...safeItems, onAdd()])}
          className="inline-flex items-center gap-1 text-xs font-medium text-red-700"
        >
          <Plus className="w-3.5 h-3.5" />
          Add row
        </button>
      )}
    </div>
  );
}
