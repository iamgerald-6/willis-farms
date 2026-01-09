"use client";

import { useState } from "react";

export function FAQ({ items }: { items: readonly { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-black/5 rounded-3xl border border-black/5 bg-white shadow-soft">
      {items.map((it, idx) => (
        <FAQItem key={idx} q={it.q} a={it.a} />
      ))}
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-6 py-5">
      <button
        className="flex w-full items-start justify-between gap-4 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-brand-dark">{q}</span>
        <span className="mt-0.5 text-xs font-bold text-brand-gray">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <p className="mt-3 text-sm leading-relaxed text-brand-gray">{a}</p>
      )}
    </div>
  );
}
