import PanelInterviewWizard from "./PanelInterviewWizard";

type Props = { params: Promise<{ token: string }> };

export default async function PanelInterviewPage({ params }: Props) {
  const { token } = await params;
  return <PanelInterviewWizard token={token} />;
}
