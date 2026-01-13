import { ReactNode } from "react";
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  right,
  textColor = "text-brand-gray",
  textColor2 = "text-brand-dark",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  textColor?: string;
  textColor2?: string;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p
            className={`text-2xl font-extrabold uppercase tracking-wide ${textColor2}`}
          >
            {eyebrow}
          </p>
        )}
        <h2
          className={`"mt-1 text-lg font-semibold tracking-tight ${textColor} sm:text-lg  `}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={`mt-3 max-w-3xl text-sm leading-relaxed ${textColor2} sm:text-base`}
          >
            {subtitle}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}
