"use client";

import { Check, X } from "lucide-react";
import { getPasswordRequirements } from "@/lib/validation";

/** Live checklist shown under a new-password field — ticks off each rule as the user types. */
export default function PasswordRequirements({ password }: { password: string }) {
  const requirements = getPasswordRequirements(password);

  return (
    <ul className="mt-2 space-y-1">
      {requirements.map((r) => (
        <li
          key={r.key}
          className={`flex items-center gap-1.5 text-xs ${
            r.met ? "text-green-600" : "text-gray-400"
          }`}
        >
          {r.met ? (
            <Check className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <X className="w-3.5 h-3.5 shrink-0" />
          )}
          {r.label}
        </li>
      ))}
    </ul>
  );
}
