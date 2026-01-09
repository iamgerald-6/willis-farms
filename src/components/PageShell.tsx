import { Container } from "./Container";

export function PageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white">
      <Container className="py-14">
        <h1 className="text-3xl font-extrabold tracking-tight text-brand-dark sm:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-brand-gray">
            {subtitle}
          </p>
        )}
        <div className="mt-10 space-y-12">{children}</div>
      </Container>
    </div>
  );
}
