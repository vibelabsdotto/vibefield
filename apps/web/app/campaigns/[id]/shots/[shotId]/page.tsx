import { ShotWorkspace } from "@/components/campaigns/shot-workspace";

export default async function ShotPage({
  params,
}: {
  params: Promise<{ id: string; shotId: string }>;
}) {
  const { id, shotId } = await params;
  return <ShotWorkspace campaignId={id} shotId={shotId} />;
}
