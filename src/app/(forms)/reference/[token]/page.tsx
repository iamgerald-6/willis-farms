import RefereeReferenceForm from "./RefereeReferenceForm";

type PageProps = { params: Promise<{ token: string }> };

export default async function RefereeReferencePage({ params }: PageProps) {
  const { token } = await params;
  return <RefereeReferenceForm token={token} />;
}
