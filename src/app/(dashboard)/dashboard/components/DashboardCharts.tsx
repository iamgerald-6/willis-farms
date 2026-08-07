"use client";

const BRAND = "#C62828";

type Segment = { label: string; value: number; color: string };

// ── Donut chart ─────────────────────────────────────────────────────────────
export function DonutChart({
  segments,
  centerLabel,
  centerSub,
  size = 160,
}: {
  segments: Segment[];
  centerLabel: string;
  centerSub?: string;
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  let offset = 0;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6">
        <div
          className="rounded-full border-[10px] border-gray-100 flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-300">0</p>
            <p className="text-xs text-gray-400">No data</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#f3f4f6" strokeWidth="12" />
          {segments.map((seg) => {
            if (seg.value === 0) return null;
            const pct = seg.value / total;
            const dash = pct * c;
            const el = (
              <circle
                key={seg.label}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth="12"
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-bold text-gray-900">{centerLabel}</p>
          {centerSub && <p className="text-xs text-gray-400">{centerSub}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2 w-full sm:w-auto">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2 text-sm">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-gray-600 flex-1">{seg.label}</span>
            <span className="font-semibold text-gray-900 tabular-nums">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Grouped bar chart ───────────────────────────────────────────────────────
type BarGroup = { label: string; draft: number; done: number };

export function AppraisalBarChart({ groups }: { groups: BarGroup[] }) {
  const max = Math.max(...groups.map((g) => g.draft + g.done), 1);

  if (!groups.length) {
    return (
      <p className="text-sm text-gray-400 text-center py-10">No appraisal data yet</p>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-3 sm:gap-4 h-44 px-1">
        {groups.map((g) => {
          const total = g.draft + g.done;
          const hPct = (total / max) * 100;
          const draftPct = total > 0 ? (g.draft / total) * 100 : 0;
          return (
            <div key={g.label} className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-gray-700 tabular-nums">{total}</span>
              <div
                className="w-full max-w-[48px] mx-auto rounded-t-lg overflow-hidden flex flex-col justify-end bg-gray-50"
                style={{ height: `${Math.max(hPct, 8)}%` }}
              >
                {g.done > 0 && (
                  <div
                    className="w-full transition-all"
                    style={{ height: `${100 - draftPct}%`, backgroundColor: BRAND }}
                  />
                )}
                {g.draft > 0 && (
                  <div
                    className="w-full bg-amber-400 transition-all"
                    style={{ height: `${draftPct}%` }}
                  />
                )}
              </div>
              <span className="text-[10px] sm:text-xs text-gray-500 text-center truncate w-full">
                {g.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-5 mt-4 pt-3 border-t border-gray-50">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />
          Draft
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BRAND }} />
          Submitted
        </div>
      </div>
    </div>
  );
}

// ── Horizontal bar chart ──────────────────────────────────────────────────────
export function HorizontalBarChart({
  items,
}: {
  items: { label: string; value: number; color?: string }[];
}) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">{item.label}</span>
            <span className="font-semibold text-gray-900 tabular-nums">{item.value}</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color ?? BRAND,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Segmented horizontal bar ──────────────────────────────────────────────────
export function SegmentedBar({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);

  if (total === 0) {
    return (
      <div className="h-4 bg-gray-100 rounded-full" />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex h-5 rounded-full overflow-hidden">
        {segments.map((seg) =>
          seg.value > 0 ? (
            <div
              key={seg.label}
              style={{
                width: `${(seg.value / total) * 100}%`,
                backgroundColor: seg.color,
              }}
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            {seg.label} ({seg.value})
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Score ring ────────────────────────────────────────────────────────────────
export function ScoreRing({
  score,
  max = 4,
  size = 140,
}: {
  score: number | null;
  max?: number;
  size?: number;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = score != null ? Math.min(score / max, 1) : 0;
  const dash = pct * c;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f3f4f6" strokeWidth="8" />
        {score != null && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={BRAND}
            strokeWidth="8"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-3xl font-bold text-gray-900">{score ?? "—"}</p>
        <p className="text-xs text-gray-400">/ {max}</p>
      </div>
    </div>
  );
}

// ── Vertical score bars (employee history) ────────────────────────────────────
export function ScoreHistoryChart({
  items,
}: {
  items: { label: string; score: number | null }[];
}) {
  const scored = items.filter((i) => i.score != null);
  const max = 4;

  if (!scored.length) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">No scored appraisals yet</p>
    );
  }

  return (
    <div className="flex items-end gap-3 h-36 px-1">
      {items.map((item) => {
        const hPct = item.score != null ? (item.score / max) * 100 : 0;
        return (
          <div key={item.label} className="flex-1 flex flex-col items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-gray-700 tabular-nums">
              {item.score ?? "—"}
            </span>
            <div className="w-full max-w-[40px] mx-auto h-full flex flex-col justify-end">
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: item.score != null ? `${Math.max(hPct, 6)}%` : "4px",
                  backgroundColor: item.score != null ? BRAND : "#e5e7eb",
                }}
              />
            </div>
            <span className="text-[10px] text-gray-500 text-center truncate w-full">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
