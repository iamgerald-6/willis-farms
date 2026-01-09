"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { siteContent } from "@/content/siteContent";
import { classNames } from "@/lib/utils";
import { useMemo, useState } from "react";
import { Container } from "./Container";
import { Button } from "./Button";

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = useMemo(() => siteContent.nav, []);

  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-white/85 backdrop-blur">
      <Container className="flex justify-between py-3">
        <Link
          href="/"
          className="flex items-center gap-3"
          aria-label="Wills Farms Home"
        >
          <Image
            src={siteContent.brand.logo.src}
            alt={siteContent.brand.logo.alt}
            width={90}
            height={38}
            priority
          />
          {/* <span className="hidden text-sm font-semibold text-brand-gray md:inline">
            {siteContent.affiliation.headline}
          </span> */}
        </Link>

        <nav className="hidden items-center gap-6 md:flex justify-center">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={classNames(
                  "text-sm font-medium text-brand-gray hover:text-brand-dark",
                  active && "text-brand-dark"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div>
          <Button href="/contact?interest=gilts" className="ml-2 text-sm">
            Request Gilts
          </Button>
        </div>

        <button
          className="inline-flex items-center justify-center rounded-xl p-2 ring-1 ring-black/10 md:hidden"
          aria-label="Open menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="text-sm font-semibold">Menu</span>
        </button>
      </Container>

      {open && (
        <div className="border-t border-black/5 bg-white md:hidden">
          <Container className="py-4">
            <div className="grid gap-3">
              {nav.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={classNames(
                      "rounded-xl px-3 py-2 text-sm font-medium",
                      active
                        ? "bg-brand-light text-brand-dark"
                        : "text-brand-gray hover:bg-brand-light"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <div className="pt-2">
                <Button href="/contact?interest=gilts" className="w-full">
                  Request Gilts
                </Button>
              </div>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
