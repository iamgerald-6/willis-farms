import Link from "next/link";
import { Container } from "@/components/Container";

export default function NotFound() {
  return (
    <div className="bg-white">
      <Container className="py-20">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-gray">404</p>
        <h1 className="mt-2 text-3xl font-extrabold text-brand-dark">Page not found</h1>
        <p className="mt-4 text-sm text-brand-gray">
          The page you are looking for does not exist or may have moved.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-2xl bg-brand-red px-6 py-3 text-sm font-semibold text-white shadow-soft hover:opacity-90"
        >
          Back to home
        </Link>
      </Container>
    </div>
  );
}
