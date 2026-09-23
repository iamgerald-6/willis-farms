"use client";

import { useCompanyContactEmail } from "@/hooks/useCompanyContactEmail";

type Props = {
  className?: string;
  showLabel?: boolean;
};

/** mailto link using the Company branding contact email (System Definitions). */
export default function CompanyContactEmailLink({
  className = "font-semibold text-brand-red hover:underline",
  showLabel = true,
}: Props) {
  const { contactEmail } = useCompanyContactEmail();
  return (
    <a href={`mailto:${contactEmail}`} className={className}>
      {showLabel ? contactEmail : null}
    </a>
  );
}
