import { ReactNode } from "react";
import { classNames } from "@/lib/utils";

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full bg-brand-light px-3 py-1 text-xs font-semibold text-brand-gray ring-1 ring-black/5",
        className
      )}
    >
      {children}
    </span>
  );
}
