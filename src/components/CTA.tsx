import { Button } from "./Button";

export function CTA({
  title,
  body,
  primary,
  secondary,
}: {
  title: string;
  body: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <div className="rounded-3xl bg-brand-dark p-8 text-white shadow-soft">
      <h3 className="text-2xl font-extrabold tracking-tight">{title}</h3>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/80">{body}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button href={primary.href}>{primary.label}</Button>
        {secondary && (
          <Button href={secondary.href} variant="secondary">
            {secondary.label}
          </Button>
        )}
      </div>
    </div>
  );
}
