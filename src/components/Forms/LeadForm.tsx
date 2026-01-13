"use client";

import { useMemo, useState } from "react";
import { classNames } from "@/lib/utils";

type LeadType = "gilts" | "pork";

type Props = {
  defaultType: LeadType;
};

type Status = "idle" | "submitting" | "success" | "error";

const buyerTypes = [
  "slaughterhouse",
  "processor",
  "wholesaler",
  "supermarket",
  "hotel",
  "restaurant",
  "institution",
  "other",
] as const;

const porkFormats = ["live", "carcass", "primal", "bulk_cuts"] as const;

export function LeadForm({ defaultType }: Props) {
  const [type, setType] = useState<LeadType>(defaultType);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  const isPork = type === "pork";

  const title = useMemo(
    () => (isPork ? "Request a pork supply quote" : "Request parent gilts"),
    [isPork]
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("");

    const form = new FormData(e.currentTarget);

    // Honeypot: if filled, silently accept.
    if (String(form.get("company_website") ?? "").trim().length > 0) {
      setStatus("success");
      setMessage("Thank you. Your request has been received.");
      e.currentTarget.reset();
      return;
    }

    const payload = Object.fromEntries(form.entries());
    payload["leadType"] = type;

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Submission failed");
      }

      setStatus("success");
      setMessage(
        "Thank you. Your request has been received. We will respond within one business day."
      );
      e.currentTarget.reset();
    } catch (err: any) {
      setStatus("error");
      setMessage(err?.message || "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {/* <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray">Lead capture</p> */}
          <h3 className="mt-1 text-xl font-extrabold text-brand-dark">
            {title}
          </h3>
          <p className="mt-2 text-sm text-brand-gray">
            Your inquiry is routed to the correct team. Provide enough detail
            for a fast response.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-2xl bg-brand-light p-2 ring-1 ring-black/5">
          <button
            type="button"
            onClick={() => setType("gilts")}
            className={classNames(
              "rounded-xl px-4 py-2 text-sm font-semibold",
              type === "gilts"
                ? "bg-white shadow-soft text-brand-dark"
                : "text-brand-gray hover:bg-white/60"
            )}
          >
            Gilts
          </button>
          <button
            type="button"
            onClick={() => setType("pork")}
            className={classNames(
              "rounded-xl px-4 py-2 text-sm font-semibold",
              type === "pork"
                ? "bg-white shadow-soft text-brand-dark"
                : "text-brand-gray hover:bg-white/60"
            )}
          >
            Pork (B2B)
          </button>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        {/* Honeypot */}
        <div className="hidden">
          <label className="text-sm font-medium text-brand-dark">
            Company Website
            <input
              name="company_website"
              className="mt-1 w-full rounded-xl border border-black/10 px-4 py-3"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Full name" name="fullName" required />
          <Field label="Company / Farm" name="company" required />
          <Field label="Phone" name="phone" required />
          <Field label="Email" name="email" type="email" required />
        </div>

        <Field label="Location / Delivery area" name="location" required />

        {!isPork && (
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="Requested quantity"
              name="giltQuantity"
              placeholder="e.g., 10"
              required
            />
            <Field
              label="Preferred delivery window"
              name="deliveryWindow"
              placeholder="e.g., next 4–6 weeks"
              required
            />
            <Field
              label="Receiving farm readiness"
              name="biosecurityReadiness"
              placeholder="e.g., receiving pen ready"
            />
          </div>
        )}

        {isPork && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Buyer type"
                name="buyerType"
                required
                options={buyerTypes.map((v) => ({
                  value: v,
                  label: toTitle(v),
                }))}
              />
              <Select
                label="Preferred product format"
                name="productFormat"
                required
                options={porkFormats.map((v) => ({
                  value: v,
                  label: toTitle(v.replace("_", " ")),
                }))}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Estimated volume (weekly/monthly)"
                name="estimatedVolume"
                placeholder="e.g., 30 pigs/week or 120 pigs/month"
                required
              />
              <Field
                label="Supply frequency"
                name="supplyFrequency"
                placeholder="e.g., weekly / bi-weekly / monthly"
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Field
                label="Start date"
                name="startDate"
                placeholder="e.g., 15 Feb 2026"
                required
              />
              <Field
                label="Delivery location"
                name="deliveryLocation"
                required
              />
              <Select
                label="Cold-chain requirement"
                name="coldChain"
                required
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
              />
            </div>
          </>
        )}

        <Field
          label="Notes / requirements"
          name="notes"
          textarea
          placeholder={
            isPork
              ? "Any specifications, delivery constraints, or compliance requirements."
              : "Any farm context or questions we should address."
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="submit"
            disabled={status === "submitting"}
            className={classNames(
              "inline-flex items-center justify-center rounded-2xl bg-brand-red px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-red focus:ring-offset-2",
              status === "submitting" && "opacity-70"
            )}
          >
            {status === "submitting" ? "Submitting..." : "Submit request"}
          </button>

          <p
            className={classNames(
              "text-sm",
              status === "success"
                ? "text-green-700"
                : status === "error"
                ? "text-red-700"
                : "text-brand-gray"
            )}
            role="status"
            aria-live="polite"
          >
            {message || "We typically respond within one business day."}
          </p>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  textarea,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-brand-dark">
      {label}
      {required ? " *" : ""}
      {textarea ? (
        <textarea
          name={name}
          required={required}
          placeholder={placeholder}
          rows={4}
          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-brand-dark placeholder:text-brand-gray/70 focus:outline-none focus:ring-2 focus:ring-brand-red"
        />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-brand-dark placeholder:text-brand-gray/70 focus:outline-none focus:ring-2 focus:ring-brand-red"
        />
      )}
    </label>
  );
}

function Select({
  label,
  name,
  required,
  options,
}: {
  label: string;
  name: string;
  required?: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-brand-dark">
      {label}
      {required ? " *" : ""}
      <select
        name={name}
        required={required}
        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-red"
        defaultValue=""
      >
        <option value="" disabled>
          Select...
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function toTitle(s: string) {
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
