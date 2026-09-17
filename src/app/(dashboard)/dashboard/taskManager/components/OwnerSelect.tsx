"use client";

import { User } from "@/types";

export default function OwnerSelect({
  users,
  value,
  onChange,
}: {
  users: User[];
  value: string | null;
  onChange: (userId: string) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full border-2 border-red-600 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none"
    >
      <option value="" disabled>
        Select owner…
      </option>
      {users.map((u) => {
        // A name-only label silently renders as a blank (easy to mistake
        // for "not in the list") whenever first_name/last_name are empty —
        // e.g. an account created directly rather than through the normal
        // invite flow. Falling back to the email means every option is
        // always visibly labeled, including the viewer's own account.
        const label = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email;
        return (
          <option key={u.user_id} value={u.user_id}>
            {label}
          </option>
        );
      })}
    </select>
  );
}
