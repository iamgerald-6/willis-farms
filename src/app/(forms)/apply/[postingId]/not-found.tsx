import Link from "next/link";
import { FormShell } from "@/components/Forms/FormShell";

export default function ApplyNotFound() {
  return (
    <FormShell eyebrow="Wills Farms Ltd." title="Application unavailable">
      <p className="text-sm text-gray-600 text-center py-10">
        This job posting is no longer available or the link is invalid.{" "}
        <Link href="/careers" className="text-red-700 font-medium hover:underline">
          View current openings
        </Link>
      </p>
    </FormShell>
  );
}
