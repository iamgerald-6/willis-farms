import { classNames } from "@/lib/utils";
import { motion } from "framer-motion";
import React from "react";

type PillarItem = {
  title: string;
  body: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

export function FeatureGrid({
  items,
  columns = 3,
}: {
  items: readonly PillarItem[];
  columns?: 2 | 3;
}) {
  return (
    <div
      className={classNames(
        "grid gap-3",
        columns === 2 ? "md:grid-cols-2" : "md:grid-cols-3"
      )}
    >
      {items.map((it) => {
        const Icon = it.icon;

        return (
          <div
            // initial={{ opacity: 0, y: 50 }}
            // animate={{ opacity: 1, y: 0 }}
            // transition={{ duration: 0.8, ease: "easeOut" }}
            key={it.title}
            className="rounded-3xl border border-black/5 bg-white p-6 shadow-soft"
          >
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-red-600">
              <Icon className="h-9 w-9 text-white" />
            </div>

            <p className="text-base font-bold text-brand-dark">{it.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-brand-gray">
              {it.body}
            </p>
          </div>
        );
      })}
    </div>
  );
}
