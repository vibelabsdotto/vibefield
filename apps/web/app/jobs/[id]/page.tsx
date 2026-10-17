import { JobDetailView } from "@/components/operations/job-detail";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <JobDetailView key={id} id={id} />;
}
