"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { classNames } from "@/lib/utils";

type LeadType = "gilts" | "pork";
type Props = { defaultType: LeadType };
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

/* ---------------- ZOD SCHEMA ---------------- */

const LeadSchema = z.object({
  company_website: z.string().optional(),

  fullName: z.string().min(1, "Full name is required"),
  company: z.string().min(1, "Company is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Invalid email"),
  location: z.string().min(1, "Location is required"),

  giltQuantity: z.string().optional(),
  giltType: z.string().optional(),
  deliveryWindow: z.string().optional(),
  biosecurityReadiness: z.string().optional(),

  buyerType: z.string().optional(),
  productFormat: z.string().optional(),
  estimatedVolume: z.string().optional(),
  supplyFrequency: z.string().optional(),
  startDate: z.string().optional(),
  deliveryLocation: z.string().optional(),
  coldChain: z.string().optional(),

  notes: z.string().optional(),
  leadType: z.enum(["gilts", "pork"]),
});

type LeadFormValues = z.infer<typeof LeadSchema>;

export function LeadForm({ defaultType }: Props) {
  const [type, setType] = useState<LeadType>(defaultType);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const isPork = type === "pork";

  const title = useMemo(
    () => (isPork ? "Request a pork supply quote" : "Request parent gilts"),
    [isPork]
  );

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(LeadSchema),
    defaultValues: { leadType: type },
  });

  const giltTypes = ["Adenia", "C3GB"] as const;

  async function onSubmit(values: LeadFormValues) {
    setStatus("submitting");
    setMessage("");

    // Honeypot
    if (values.company_website && values.company_website.trim().length > 0) {
      setStatus("success");
      setMessage("Thank you. Your request has been received.");
      form.reset();
      return;
    }

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, leadType: type }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Submission failed");
      }

      setStatus("success");
      setMessage(
        "Thank you. Your request has been received. We will respond within one business day."
      );
      form.reset();
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Something went wrong.");
    }
  }

  return (
    <div className="rounded-3xl border border-black/5 bg-white p-7 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
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
            Pork
          </button>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 grid gap-4">
        {/* Honeypot */}
        <div className="hidden">
          <input {...form.register("company_website")} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Full name" {...form.register("fullName")} required />
          <Field
            label="Company / Farm"
            {...form.register("company")}
            required
          />
          <Field label="Phone" {...form.register("phone")} required />
          <Field
            label="Email"
            type="email"
            {...form.register("email")}
            required
          />
        </div>

        <Field
          label="Location / Delivery area"
          {...form.register("location")}
          required
        />

        {!isPork && (
          <div className="grid gap-4 md:grid-cols-4">
            <Field
              label="Requested quantity"
              {...form.register("giltQuantity")}
            />
            <Select
              label="Type of Gilt"
              {...form.register("giltType")}
              options={giltTypes.map((v) => ({ value: v, label: v }))}
            />
            <Field
              label="Preferred delivery window"
              {...form.register("deliveryWindow")}
            />
            <Field
              label="Receiving farm readiness"
              {...form.register("biosecurityReadiness")}
            />
          </div>
        )}

        {isPork && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Buyer type"
                {...form.register("buyerType")}
                options={buyerTypes.map((v) => ({
                  value: v,
                  label: toTitle(v),
                }))}
              />
              <Select
                label="Preferred product format"
                {...form.register("productFormat")}
                options={porkFormats.map((v) => ({
                  value: v,
                  label: toTitle(v.replace("_", " ")),
                }))}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Estimated volume"
                {...form.register("estimatedVolume")}
              />
              <Field
                label="Supply frequency"
                {...form.register("supplyFrequency")}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Start date" {...form.register("startDate")} />
              <Field
                label="Delivery location"
                {...form.register("deliveryLocation")}
              />
              <Select
                label="Cold-chain requirement"
                {...form.register("coldChain")}
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
          {...form.register("notes")}
          textarea
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="submit"
            disabled={status === "submitting"}
            className={classNames(
              "inline-flex items-center justify-center rounded-2xl bg-brand-red px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:opacity-90",
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
          >
            {message || "We typically respond within one business day."}
          </p>
        </div>
      </form>
    </div>
  );
}

function Field({ label, textarea, ...props }: any) {
  return (
    <label className="grid gap-1 text-sm font-medium text-brand-dark">
      {label}
      {textarea ? (
        <textarea
          {...props}
          rows={4}
          className="w-full rounded-2xl border px-4 py-3"
        />
      ) : (
        <input {...props} className="w-full rounded-2xl border px-4 py-3" />
      )}
    </label>
  );
}

function Select({ label, options, ...props }: any) {
  return (
    <label className="grid gap-1 text-sm font-medium text-brand-dark">
      {label}
      <select {...props} className="w-full rounded-2xl border px-4 py-3">
        <option value="">Select...</option>
        {options.map((o: any) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function toTitle(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
