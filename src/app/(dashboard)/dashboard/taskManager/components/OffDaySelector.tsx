"use client";

import { useState } from "react";
import { Clock } from "lucide-react";

export interface OffDayRow {
  id: string;
  user_id: string;
  day_of_week: number;
  effective_from: string;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const BRAND = "#C62828";

function fmtOffDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function subtractOneDay(d: string): string {
  const dt = new Date(d + "T00:00:00");
  dt.setDate(dt.getDate() - 1);
  return dt.toISOString().split("T")[0];
}

export default function OffDaySelector({
  selectedDays,
  onToggle,
  saving,
  currentActiveRows,
  allHistory,
}: {
  selectedDays: number[];
  onToggle: (day: number) => void;
  saving: boolean;
  currentActiveRows: OffDayRow[];
  allHistory: OffDayRow[];
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  const sortedActive = [...currentActiveRows].sort((a, b) =>
    b.effective_from.localeCompare(a.effective_from),
  );
  const activeNames = sortedActive.map((r) => DAY_NAMES_FULL[r.day_of_week]);
  const latestSetDate = sortedActive[0]?.effective_from;

  const historyDisplay = allHistory.map((row, i) => ({
    dayName: DAY_NAMES_FULL[row.day_of_week],
    from: row.effective_from,
    to: i > 0 ? subtractOneDay(allHistory[i - 1].effective_from) : null,
  }));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-800">
            My Recurring Off Days
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Select days you are regularly off each week
          </p>
        </div>
        {saving && (
          <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0">
            <Clock className="w-3 h-3" /> Saving…
          </span>
        )}
      </div>

      <div className="flex gap-1.5 sm:gap-2 flex-wrap">
        {DAY_NAMES_FULL.map((name, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onToggle(i)}
            className="px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold border-2 transition-all"
            style={
              selectedDays.includes(i)
                ? {
                    background: BRAND,
                    color: "#fff",
                    borderColor: BRAND,
                    boxShadow: "0 1px 4px rgba(198,40,40,0.25)",
                  }
                : {
                    background: "#fff",
                    color: "#6b7280",
                    borderColor: "#e5e7eb",
                  }
            }
          >
            <span className="hidden sm:inline">{name}</span>
            <span className="inline sm:hidden">{DAY_NAMES[i]}</span>
          </button>
        ))}
      </div>

      {activeNames.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-600">
            Your current off {activeNames.length === 1 ? "day" : "days"}:{" "}
            <strong className="text-gray-800">{activeNames.join(", ")}</strong>
            {latestSetDate && (
              <span className="text-gray-400 ml-1">
                (set {fmtOffDate(latestSetDate)})
              </span>
            )}
          </p>

          {allHistory.length > 1 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setHistoryOpen((p) => !p)}
                className="text-xs font-medium"
                style={{ color: BRAND }}
              >
                {historyOpen ? "Hide history ▲" : "View history ▼"}
              </button>

              {historyOpen && (
                <div className="mt-2 space-y-1.5 pl-1">
                  {historyDisplay.map((h, i) => (
                    <div
                      key={i}
                      className="text-xs text-gray-500 flex items-baseline gap-1.5 flex-wrap"
                    >
                      <span className="font-semibold text-gray-700 w-20 shrink-0">
                        {h.dayName}
                      </span>
                      <span>— from {fmtOffDate(h.from)}</span>
                      {h.to === null ? (
                        <span className="text-emerald-600 font-medium">
                          (current)
                        </span>
                      ) : (
                        <span className="text-gray-400">
                          to {fmtOffDate(h.to)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
