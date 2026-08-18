"use client";

import { Fragment } from "react";
import type {
  PagePermissionActions,
  PermissionAction,
} from "@/lib/moduleRegistry/types";
import {
  ACTION_LABELS,
  actionHelpFor,
  getPermissionMatrixByGroup,
} from "@/lib/permissionActions";
import type { PagePermissionKey } from "@/lib/pagePermissions";

type Props = {
  actions: PagePermissionActions;
  onChange: (actions: PagePermissionActions) => void;
  readOnly?: boolean;
};

const ALL_ACTIONS: PermissionAction[] = [
  "view",
  "add",
  "edit",
  "review",
  "approve",
];

export default function PermissionMatrix({
  actions,
  onChange,
  readOnly = false,
}: Props) {
  const groups = getPermissionMatrixByGroup();
  const usedActions = new Set<PermissionAction>();
  for (const group of groups) {
    for (const mod of group.modules) {
      for (const action of mod.supportedActions) usedActions.add(action);
    }
  }
  const headerActions = ALL_ACTIONS.filter((a) => usedActions.has(a));

  const toggleAction = (
    key: PagePermissionKey,
    action: PermissionAction,
    checked: boolean,
  ) => {
    if (readOnly) return;
    const current = actions[key] ?? {};
    const nextMod = { ...current };
    if (checked) {
      nextMod[action] = true;
    } else {
      delete nextMod[action];
    }
    const next = { ...actions };
    if (Object.keys(nextMod).length === 0) {
      delete next[key];
    } else {
      next[key] = nextMod;
    }
    onChange(next);
  };

  const clearModule = (key: PagePermissionKey) => {
    if (readOnly) return;
    const next = { ...actions };
    delete next[key];
    onChange(next);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm min-w-[720px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-3 font-semibold text-gray-600">Module</th>
            {headerActions.map((action) => (
              <th
                key={action}
                className="px-3 py-3 font-semibold text-gray-600 text-center w-20"
              >
                {ACTION_LABELS[action]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map(({ group, groupId, modules }) => (
            <Fragment key={groupId}>
              <tr className="bg-gray-100/80">
                <td
                  colSpan={headerActions.length + 1}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500"
                >
                  {group}
                </td>
              </tr>
              {modules.map((mod, i) => {
                const current = actions[mod.key] ?? {};
                const hasAny = Object.values(current).some(Boolean);

                return (
                  <tr
                    key={mod.key}
                    className={`border-b border-gray-100 ${
                      i % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-800">
                      <span className="font-medium">{mod.label}</span>
                      {hasAny && !readOnly && (
                        <button
                          type="button"
                          onClick={() => clearModule(mod.key)}
                          className="block text-xs text-gray-400 hover:text-red-600 mt-1"
                        >
                          Remove all
                        </button>
                      )}
                    </td>
                    {headerActions.map((action) => {
                      if (!mod.supportedActions.includes(action)) {
                        return (
                          <td
                            key={action}
                            className="px-3 py-3 text-center text-gray-300"
                          >
                            —
                          </td>
                        );
                      }

                      return (
                        <td key={action} className="px-3 py-3 text-center">
                          <label
                            className="inline-flex items-center justify-center cursor-pointer"
                            title={actionHelpFor(mod.key, action)}
                          >
                            <input
                              type="checkbox"
                              checked={current[action] === true}
                              disabled={readOnly}
                              onChange={(e) =>
                                toggleAction(
                                  mod.key,
                                  action,
                                  e.target.checked,
                                )
                              }
                              className="accent-red-600 w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                              aria-label={`${mod.label} — ${ACTION_LABELS[action]}`}
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
