"use client";

import Link from "next/link";
import type { JobDetail } from "@vibefield/contracts";
import { RefreshCw } from "lucide-react";
import { assetUrl, isActiveJob, useApi } from "@/lib/api";
import {
  AssetMedia,
  EmptyState,
  Loading,
  ModelFacts,
  PageHeader,
  QueryError,
  RequestPreview,
  StatusBadge,
} from "@/components/studio";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { JobRecovery } from "./job-recovery";
import { JobContext, JsonDetails, Timestamp, useLiveRefresh } from "./shared";

type JobWithSnapshot = JobDetail & { identitySnapshot?: unknown };

export function JobDetailView({ id }: { id: string }) {
  const query = useApi<JobWithSnapshot>(`/jobs/${encodeURIComponent(id)}`);
  useLiveRefresh(
    Boolean(query.data && isActiveJob(query.data)) && !query.isFetching,
    query.refetch,
  );
  const job = query.data;
  if (query.isPending) return <Loading />;
  if (!job)
    return (
      <div className="page-stack">
        <PageHeader title="Job" back={{ href: "/jobs", label: "Jobs" }} />
        <QueryError
          error={query.error || new Error("Job not found")}
          retry={() => void query.refetch()}
        />
      </div>
    );
  const assets = job.assets ?? [];
  const history = [...(job.history ?? [])].sort(
    (a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id),
  );

  return (
    <div className="page-stack">
      <PageHeader
        title={`${job.purpose.charAt(0).toUpperCase()}${job.purpose.slice(1)} job`}
        description={job.id}
        back={{ href: "/jobs", label: "Jobs" }}
        actions={
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw data-icon="inline-start" />
            Refresh job
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={job.status} />
        <JobContext job={job} />
        {isActiveJob(job) && (
          <p className="text-sm text-muted-foreground" role="status">
            Checking status every 3 seconds
          </p>
        )}
      </div>
      {query.error && (
        <QueryError error={query.error} retry={() => void query.refetch()} />
      )}
      {job.error && (
        <Alert variant="destructive">
          <AlertTitle>{job.error.code}</AlertTitle>
          <AlertDescription>{job.error.message}</AlertDescription>
        </Alert>
      )}
      <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Execution facts</CardTitle>
            <CardDescription>
              Requested parameters and provider-reported facts are recorded
              separately.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ModelFacts job={job} />
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Provider job</dt>
              <dd className="break-all font-mono text-xs">
                {job.providerJobId ?? "Not acknowledged"}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>
                <Timestamp value={job.createdAt} />
              </dd>
              <dt className="text-muted-foreground">Updated</dt>
              <dd>
                <Timestamp value={job.updatedAt} />
              </dd>
              <dt className="text-muted-foreground">Submitted</dt>
              <dd>
                <Timestamp value={job.submittedAt} />
              </dd>
              <dt className="text-muted-foreground">Finished</dt>
              <dd>
                <Timestamp value={job.finishedAt} />
              </dd>
            </dl>
            {job.modelReported === null && (
              <p className="text-sm text-muted-foreground">
                Model execution is unverified. The requested model identifier is
                not evidence of which model actually ran.
              </p>
            )}
          </CardContent>
        </Card>
        <JobRecovery job={job} />
      </div>
      <section
        className="flex min-w-0 flex-col gap-4"
        aria-labelledby="job-outputs"
      >
        <h2 id="job-outputs" className="text-lg font-medium">
          Outputs
        </h2>
        {job.resultText !== null && (
          <Card>
            <CardHeader>
              <CardTitle>Generated text</CardTitle>
              <CardDescription>
                Provider output, not instructions for the app to execute.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {job.resultText}
              </div>
            </CardContent>
          </Card>
        )}
        {assets.length > 0 && (
          <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {assets.map((asset) => (
              <Card key={asset.id} className="min-w-0">
                <CardHeader>
                  <CardTitle className="break-all">
                    {asset.originalName || asset.id}
                  </CardTitle>
                  <CardDescription>
                    {asset.kind} · {asset.mime}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex min-w-0 flex-col gap-3">
                  <AssetMedia
                    asset={asset}
                    controls
                    className="aspect-square w-full rounded-lg object-contain"
                  />
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Dimensions</dt>
                    <dd>
                      {asset.width !== null && asset.height !== null
                        ? `${asset.width} × ${asset.height}`
                        : "Not reported"}
                    </dd>
                    <dt className="text-muted-foreground">Duration</dt>
                    <dd>
                      {asset.durationMs === null
                        ? "Not reported"
                        : `${asset.durationMs / 1000} seconds`}
                    </dd>
                    <dt className="text-muted-foreground">Bytes</dt>
                    <dd>{asset.bytes}</dd>
                    <dt className="text-muted-foreground">SHA-256</dt>
                    <dd className="break-all font-mono">{asset.sha256}</dd>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={assetUrl(asset.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      Open original
                    </a>
                    <Link
                      href={`/library?asset=${asset.id}`}
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                      })}
                    >
                      Open in library
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {!assets.length && job.resultText === null && (
          <EmptyState
            title="No local outputs yet"
            description={
              isActiveJob(job)
                ? "Results appear here after the provider finishes and files are saved locally."
                : "This job has no saved media or generated text. Check its status and history before starting another generation."
            }
          />
        )}
        {job.outputAssetIds.some(
          (assetId) => !assets.some((asset) => asset.id === assetId),
        ) && (
          <JsonDetails title="Recorded output IDs" value={job.outputAssetIds} />
        )}
      </section>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Immutable request</CardTitle>
          <CardDescription>
            The snapshot at job creation. Editing a character, shot or default
            model does not change it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <RequestPreview request={job.request} />
          <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-muted-foreground">Request hash</dt>
            <dd className="break-all font-mono">{job.requestHash}</dd>
            <dt className="text-muted-foreground">Idempotency key</dt>
            <dd className="break-all font-mono">{job.idempotencyKey}</dd>
          </dl>
          <JsonDetails title="Exact request JSON" value={job.request} />
          {Boolean(job.identitySnapshot ?? job.request.identitySnapshot) && (
            <JsonDetails
              title="Identity snapshot and canonical provenance"
              value={job.identitySnapshot ?? job.request.identitySnapshot}
            />
          )}
          {job.result !== null && (
            <JsonDetails
              title="Saved output handles and usage"
              value={job.result}
            />
          )}
        </CardContent>
      </Card>
      <section
        className="flex min-w-0 flex-col gap-4"
        aria-labelledby="job-history"
      >
        <h2 id="job-history" className="text-lg font-medium">
          History
        </h2>
        {!history.length ? (
          <EmptyState
            title="No history recorded"
            description="Job transitions and explicit recovery actions appear here."
          />
        ) : (
          <ol className="flex flex-col gap-3">
            {history.map((entry) => (
              <li key={entry.id} className="min-w-0 rounded-lg border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium">
                    {entry.action.replaceAll("_", " ")}
                  </h3>
                  <div className="text-xs text-muted-foreground">
                    <Timestamp value={entry.at} />
                  </div>
                </div>
                <p className="mb-3 mt-1 text-xs text-muted-foreground">
                  Actor: {entry.actor}
                </p>
                <JsonDetails title="Event details" value={entry.payload} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
