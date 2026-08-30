"use client";

// Shared page size for every paginated list in the Recruitment tabs.
export const PAGE_SIZE = 20;

export default function Pagination({
  page,
  pageCount,
  onPageChange,
  totalItems,
  pageSize = PAGE_SIZE,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  pageSize?: number;
}) {
  if (pageCount <= 1) return null;

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
      <p>
        Showing {start}–{end} of {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-lg border border-gray-200 font-medium text-gray-600 hover:border-gray-400 disabled:opacity-40 disabled:hover:border-gray-200"
        >
          Previous
        </button>
        <span className="text-gray-500">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className="px-3 py-1.5 rounded-lg border border-gray-200 font-medium text-gray-600 hover:border-gray-400 disabled:opacity-40 disabled:hover:border-gray-200"
        >
          Next
        </button>
      </div>
    </div>
  );
}
