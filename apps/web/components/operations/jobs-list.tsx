"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { JOB_STATUSES, type Job } from "@vibefield/contracts";
import { RefreshCw } from "lucide-react";
import { isActiveJob, useList } from "@/lib/api";
import {
  EmptyState,
  Loading,
  PageHeader,
  QueryError,
  SelectField,
  StatusBadge,
  PartialResultWarning,
  TextField,
} from "@/components/studio";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JobContext, Timestamp, useLiveRefresh } from "./shared";

export type JobFilters = {
  status: string;
  characterId: string;
  campaignId: string;
  shotId: string;
};

export function JobsList({ initialFilters }: { initialFilters: JobFilters }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialFilters);
  const query = new URLSearchParams({ limit: "50" });
  for (const [key, value] of Object.entries(initialFilters))
    if (value) query.set(key, value);
  const jobs = useList<Job>(`/jobs?${query.toString()}`);
  const active = jobs.items.some(isActiveJob);
  useLiveRefresh(active && !jobs.isFetching, jobs.refetch);
  const filtered = Object.values(initialFilters).some(Boolean);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(draft))
      if (value.trim()) params.set(key, value.trim());
    router.push(`/jobs${params.size ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Jobs"
        description="Generation history and recovery. Nothing is resubmitted automatically."
        actions={
          <Button
            variant="outline"
            disabled={jobs.isFetching}
            onClick={() => void jobs.refetch()}
          >
            <RefreshCw data-icon="inline-start" />
            Refresh jobs
          </Button>
        }
      />
      <form onSubmit={applyFilters} className="flex flex-col gap-4">
        <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SelectField
            label="Status"
            value={draft.status}
            onChange={(status) => setDraft({ ...draft, status })}
            options={[
              { value: "", label: "All statuses" },
              ...JOB_STATUSES.map((value) => ({
                value,
                label: value.replaceAll("_", " "),
              })),
            ]}
          />
          <TextField
            label="Character ID"
            placeholder="All characters"
            value={draft.characterId}
            onChange={(characterId) => setDraft({ ...draft, characterId })}
          />
          <TextField
            label="Campaign ID"
            placeholder="All campaigns"
            value={draft.campaignId}
            onChange={(campaignId) => setDraft({ ...draft, campaignId })}
          />
          <TextField
            label="Shot ID"
            placeholder="All shots"
            value={draft.shotId}
            onChange={(shotId) => setDraft({ ...draft, shotId })}
          />
        </FieldGroup>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
          {filtered && (
            <Link href="/jobs" className={buttonVariants({ variant: "ghost" })}>
              Clear filters
            </Link>
          )}
          {active && (
            <p role="status" className="text-sm text-muted-foreground">
              Active jobs refresh every 3 seconds.
            </p>
          )}
        </div>
      </form>
      {jobs.isPending && <Loading />}
      {jobs.error && (
        <QueryError error={jobs.error} retry={() => void jobs.refetch()} />
      )}
      {!jobs.isPending && !jobs.error && !jobs.items.length && (
        <EmptyState
          title={
            filtered ? "No jobs match these filters" : "No generations yet"
          }
          description={
            filtered
              ? "Clear a filter to see more jobs."
              : "Start with a character portrait or a campaign. Every generation will appear here."
          }
        >
          {!filtered && (
            <Link
              href="/characters"
              className={buttonVariants({ variant: "outline" })}
            >
              Open characters
            </Link>
          )}
        </EmptyState>
      )}
      {jobs.items.length > 0 && (
        <div className="min-w-0 rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Provider / model</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Outputs</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.items.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <Link
                      className="flex max-w-64 flex-col gap-1 rounded-sm py-1 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      href={`/jobs/${job.id}`}
                    >
                      <span className="font-medium capitalize">
                        {job.purpose}{" "}
                        <span className="text-muted-foreground">
                          · {job.kind}
                        </span>
                      </span>
                      <span
                        className="truncate font-mono text-xs"
                        title={job.id}
                      >
                        {job.id}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={job.status} />
                    <div className="mt-2">
                      <PartialResultWarning job={job} />
                    </div>
                  </TableCell>
                  <TableCell className="max-w-72 whitespace-normal">
                    <div className="flex flex-col gap-1 break-all">
                      <span>{job.provider}</span>
                      <span className="text-xs text-muted-foreground">
                        Requested {job.modelRequested}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {job.modelReported
                          ? `Reported ${job.modelReported}`
                          : "Model execution unverified"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <JobContext job={job} />
                  </TableCell>
                  <TableCell>
                    {job.kind === "text"
                      ? job.resultText
                        ? "Text available"
                        : "No text"
                      : job.outputAssetIds.length}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <Timestamp value={job.createdAt} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {jobs.hasNextPage && (
        <Button
          variant="outline"
          className="self-start"
          disabled={jobs.isFetchingNextPage}
          onClick={() => void jobs.fetchNextPage()}
        >
          {jobs.isFetchingNextPage ? "Loading more jobs…" : "Load more jobs"}
        </Button>
      )}
      {jobs.items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {jobs.items.length} loaded jobs
          {jobs.hasNextPage ? ". More are available." : "."}
        </p>
      )}
    </div>
  );
}
