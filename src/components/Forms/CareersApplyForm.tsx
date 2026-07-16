"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { classNames } from "@/lib/utils";
import { ALL_CAREER_OPENINGS } from "@/lib/careers/openings";
import { uploadCvToCloudinary } from "@/lib/careers/uploadCv";
import { CheckCircle2, Loader2, Upload } from "lucide-react";

type Status = "idle" | "uploading" | "submitting" | "success" | "error";

const ApplySchema = z.object({
  website: z.string().optional(),
  full_name: z.string().min(1, "Full name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(1, "Phone is required"),
  location: z.string().optional(),
  role_slug: z.string().min(1, "Select a role"),
  cover_note: z.string().min(20, "Add a short cover note (at least 20 characters)"),
});

type ApplyFormValues = z.infer<typeof ApplySchema>;

type Props = {
  defaultRoleSlug?: string;
};

export function CareersApplyForm({ defaultRoleSlug }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvName, setCvName] = useState("");

  const form = useForm<ApplyFormValues>({
    resolver: zodResolver(ApplySchema),
    defaultValues: {
      role_slug: defaultRoleSlug ?? "",
      full_name: "",
      email: "",
      phone: "",
      location: "",
      cover_note: "",
    },
  });

  useEffect(() => {
    if (defaultRoleSlug) {
      form.setValue("role_slug", defaultRoleSlug);
    }
  }, [defaultRoleSlug, form]);

  const roleOptions = useMemo(
    () =>
      ALL_CAREER_OPENINGS.map((o) => ({
        value: o.slug,
        label: o.title,
      })),
    [],
  );

  async function onSubmit(values: ApplyFormValues) {
    setMessage("");
    setReferenceNumber("");

    if (values.website?.trim()) {
      setStatus("success");
      setMessage("Thank you. Your application has been received.");
      form.reset();
      return;
    }

    try {
      let cv_url: string | undefined;
      let cv_public_id: string | undefined;

      if (cvFile) {
        setStatus("uploading");
        const uploaded = await uploadCvToCloudinary(cvFile);
        cv_url = uploaded.secure_url;
        cv_public_id = uploaded.public_id;
      }

      setStatus("submitting");

      const res = await fetch("/api/careers/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, cv_url, cv_public_id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Submission failed");
      }

      setStatus("success");
      setReferenceNumber(data.data.reference_number);
      setMessage(
        `Application received for ${data.data.role_title}. A confirmation email has been sent to your inbox with your reference number.`,
      );
      form.reset({ role_slug: defaultRoleSlug ?? "" });
      setCvFile(null);
      setCvName("");
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success" && referenceNumber) {
    return (
      <div className="rounded-3xl border border-green-200 bg-green-50 p-8 text-center shadow-soft">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <h3 className="mt-4 text-xl font-bold text-brand-dark">
          Application submitted
        </h3>
        <p className="mt-2 text-sm text-brand-gray">{message}</p>
        <p className="mt-6 text-2xl font-extrabold tracking-wide text-brand-dark">
          {referenceNumber}
        </p>
        <p className="mt-2 text-xs text-brand-gray">
          Quote this reference in any follow-up with HR. A confirmation email
          has also been sent to your inbox.
        </p>
      </div>
    );
  }

  return (
    <div
      id="apply"
      className="scroll-mt-24 rounded-3xl border border-black/5 bg-white p-7 shadow-soft"
    >
      <h3 className="text-xl font-extrabold text-brand-dark">Apply online</h3>
      <p className="mt-2 text-sm text-brand-gray">
        Submit your details and CV. You will receive a reference number on
        confirmation. Interview materials are internal — you will be contacted
        if shortlisted.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 grid gap-4">
        <div className="hidden">
          <input {...form.register("website")} tabIndex={-1} autoComplete="off" />
        </div>

        <Field label="Role applying for" required error={form.formState.errors.role_slug?.message}>
          <select
            {...form.register("role_slug")}
            className="w-full rounded-2xl border px-4 py-3 text-sm"
          >
            <option value="">Select a role…</option>
            {roleOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Full name" required error={form.formState.errors.full_name?.message}>
            <input
              {...form.register("full_name")}
              className="w-full rounded-2xl border px-4 py-3 text-sm"
            />
          </Field>
          <Field label="Phone" required error={form.formState.errors.phone?.message}>
            <input
              {...form.register("phone")}
              className="w-full rounded-2xl border px-4 py-3 text-sm"
            />
          </Field>
          <Field label="Email" required error={form.formState.errors.email?.message}>
            <input
              type="email"
              {...form.register("email")}
              className="w-full rounded-2xl border px-4 py-3 text-sm"
            />
          </Field>
          <Field label="Location" error={form.formState.errors.location?.message}>
            <input
              {...form.register("location")}
              placeholder="City / region"
              className="w-full rounded-2xl border px-4 py-3 text-sm"
            />
          </Field>
        </div>

        <Field label="Cover note" required error={form.formState.errors.cover_note?.message}>
          <textarea
            {...form.register("cover_note")}
            rows={4}
            placeholder="Brief note on your experience and why you are applying"
            className="w-full rounded-2xl border px-4 py-3 text-sm"
          />
        </Field>

        <div>
          <label className="grid gap-2 text-sm font-medium text-brand-dark">
            CV / résumé (PDF preferred)
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-gray-300 px-4 py-3 text-sm text-brand-gray hover:bg-brand-light">
                <Upload className="h-4 w-4" />
                {cvName || "Choose file"}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setCvFile(file);
                    setCvName(file?.name ?? "");
                  }}
                />
              </label>
              {cvFile && (
                <button
                  type="button"
                  onClick={() => {
                    setCvFile(null);
                    setCvName("");
                  }}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="submit"
            disabled={status === "submitting" || status === "uploading"}
            className={classNames(
              "inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-red px-6 py-3 text-sm font-semibold text-white shadow-soft transition hover:opacity-90",
              (status === "submitting" || status === "uploading") && "opacity-70",
            )}
          >
            {(status === "submitting" || status === "uploading") && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {status === "uploading"
              ? "Uploading CV…"
              : status === "submitting"
                ? "Submitting…"
                : "Submit application"}
          </button>
          <p
            className={classNames(
              "text-sm",
              status === "error" ? "text-red-700" : "text-brand-gray",
            )}
          >
            {message || "We review applications on a rolling basis."}
          </p>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-brand-dark">
      <span>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error && <span className="text-xs font-normal text-red-600">{error}</span>}
    </label>
  );
}
