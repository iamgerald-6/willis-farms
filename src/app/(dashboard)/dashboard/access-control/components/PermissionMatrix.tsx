"use client";

import { Info } from "lucide-react";
import {
  moduleSupportsAdd,
  type PagePermissionLevels,
  type PermissionLevel,
} from "@/lib/permissionLevels";
import {
  PAGE_PERMISSION_KEYS,
  PAGE_PERMISSION_LABELS,
  type PagePermissionKey,
} from "@/lib/pagePermissions";

type Props = {
  levels: PagePermissionLevels;
  onChange: (levels: PagePermissionLevels) => void;
  readOnly?: boolean;
};

const LEVEL_OPTIONS: {
  value: PermissionLevel;
  label: string;
  help: string;
}[] = [
  {
    value: "view",
    label: "View",
    help: "Open the page and read content only. Cannot create or change anything.",
  },
  {
    value: "add",
    label: "Add",
    help: "Everything in View, plus create new items. Cannot edit or delete existing content.",
  },
  {
    value: "edit",
    label: "Edit",
    help: "Full access: create, update, and delete/manage where applicable.",
  },
];

function HeaderTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group ml-1 align-middle">
      <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" aria-hidden />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-48 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal normal-case text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

export default function PermissionMatrix({
  levels,
  onChange,
  readOnly = false,
}: Props) {
  const setLevel = (key: PagePermissionKey, level: PermissionLevel | null) => {
    if (readOnly) return;
    const next = { ...levels };
    if (level === null) {
      delete next[key];
    } else {
      next[key] = level;
    }
    onChange(next);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm min-w-[640px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 font-semibold text-gray-600">Page</th>
            {LEVEL_OPTIONS.map((opt) => (
              <th
                key={opt.value}
                className="px-4 py-3 font-semibold text-gray-600 text-center w-24"
              >
                <span className="inline-flex items-center justify-center">
                  {opt.label}
                  <HeaderTip text={opt.help} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PAGE_PERMISSION_KEYS.map((key, i) => {
            const current = levels[key] ?? null;
            const supportsAdd = moduleSupportsAdd(key);

            return (
              <tr
                key={key}
                className={`border-b border-gray-100 ${
                  i % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                }`}
              >
                <td className="px-4 py-3 text-gray-800">
                  <span className="font-medium">
                    {PAGE_PERMISSION_LABELS[key].label}
                  </span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    {PAGE_PERMISSION_LABELS[key].group}
                  </span>
                  {current && !readOnly && (
                    <button
                      type="button"
                      onClick={() => setLevel(key, null)}
                      className="text-xs text-gray-400 hover:text-red-600 mt-1"
                    >
                      Remove access
                    </button>
                  )}
                </td>
                {LEVEL_OPTIONS.map((opt) => {
                  if (opt.value === "add" && !supportsAdd) {
                    return (
                      <td
                        key={opt.value}
                        className="px-4 py-3 text-center text-gray-300"
                      >
                        —
                      </td>
                    );
                  }

                  return (
                    <td key={opt.value} className="px-4 py-3 text-center">
                      <label className="inline-flex items-center justify-center cursor-pointer">
                        <input
                          type="radio"
                          name={`perm-${key}`}
                          checked={current === opt.value}
                          disabled={readOnly}
                          onChange={() => setLevel(key, opt.value)}
                          className="accent-red-600 w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                          aria-label={`${PAGE_PERMISSION_LABELS[key].label} — ${opt.label}`}
                        />
                      </label>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
