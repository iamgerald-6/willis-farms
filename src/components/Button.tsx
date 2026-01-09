import Link from "next/link";
import { classNames } from "@/lib/utils";
import { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2";
const variants: Record<Variant, string> = {
  primary:
    "bg-brand-red text-white hover:opacity-90 focus:ring-brand-red shadow-soft",
  secondary:
    "bg-white text-brand-dark ring-1 ring-black/10 hover:bg-brand-light focus:ring-brand-red shadow-soft",
  ghost:
    "bg-transparent text-brand-dark hover:bg-brand-light focus:ring-brand-red",
};

export function Button({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link href={href} className={classNames(base, variants[variant], className)}>
      {children}
    </Link>
  );
}
