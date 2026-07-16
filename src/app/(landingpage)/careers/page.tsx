import CareersPageClient from "./CareersPageClient";

export default async function CareersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const params = await searchParams;
  return <CareersPageClient defaultRoleSlug={params.role} />;
}
