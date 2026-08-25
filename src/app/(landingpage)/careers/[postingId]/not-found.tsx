import Link from "next/link";

export default function JobPostingNotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-xl font-bold text-brand-dark">Posting unavailable</h1>
      <p className="mt-3 text-sm text-brand-gray">
        This job posting is no longer available or the link is invalid.{" "}
        <Link href="/careers" className="font-semibold text-brand-red hover:underline">
          View current job openings
        </Link>
      </p>
    </div>
  );
}
