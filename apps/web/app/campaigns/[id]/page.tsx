import { Suspense } from "react";
import { CampaignWorkspace } from "@/components/campaigns/campaign-workspace";
import { Loading } from "@/components/studio";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <CampaignWorkspace campaignId={id} />
    </Suspense>
  );
}
