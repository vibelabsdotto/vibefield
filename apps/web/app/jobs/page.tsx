import { JobsList, type JobFilters } from "@/components/operations/jobs-list";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (key: string) =>
    typeof params[key] === "string" ? params[key] : "";
  const filters: JobFilters = {
    status: value("status"),
    characterId: value("characterId"),
    campaignId: value("campaignId"),
    shotId: value("shotId"),
  };
  return <JobsList key={JSON.stringify(filters)} initialFilters={filters} />;
}
