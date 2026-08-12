export type AccountStatusLabel = "Inactive" | "Pending" | "Active";

/** Older rows may still hold the flag as text, hence the string handling. */
export function isEmailVerified(user: {
  email_verified?: boolean | string | null;
}): boolean {
  const v = user.email_verified;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
}

export function getAccountStatus(user: {
  email_verified?: boolean | string | null;
  is_disabled?: boolean | null;
}): {
  label: AccountStatusLabel;
  className: string;
  canResend: boolean;
} {
  if (user.is_disabled) {
    return {
      label: "Inactive",
      className: "bg-gray-100 text-gray-600 border-gray-300",
      canResend: false,
    };
  }
  if (!isEmailVerified(user)) {
    return {
      label: "Pending",
      className: "bg-amber-50 text-amber-700 border-amber-200",
      canResend: true,
    };
  }
  return {
    label: "Active",
    className: "bg-green-50 text-green-700 border-green-200",
    canResend: false,
  };
}
