"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { Job, Settings } from "@vibefield/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

/** Refresh status only. This never repeats a generation or recovery action. */
export function useLiveRefresh(
  active: boolean,
  refetch: () => Promise<unknown>,
) {
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refetch();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [active, refetch]);
}

export function Timestamp({ value }: { value: string | null }) {
  if (!value)
    return <span className="text-muted-foreground">Not recorded</span>;
  // UTC is deterministic during server rendering and client hydration.
  const date = new Date(value);
  return (
    <time dateTime={value}>
      {Number.isNaN(date.getTime())
        ? value
        : date
            .toISOString()
            .replace("T", " ")
            .replace(/\.\d{3}Z$/, " UTC")}
    </time>
  );
}

export function JobContext({ job }: { job: Job }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      {job.characterId && (
        <Link
          className="underline underline-offset-4"
          href={`/characters/${job.characterId}`}
        >
          Character
        </Link>
      )}
      {job.campaignId && (
        <Link
          className="underline underline-offset-4"
          href={`/campaigns/${job.campaignId}`}
        >
          Campaign
        </Link>
      )}
      {job.campaignId && job.shotId && (
        <Link
          className="underline underline-offset-4"
          href={`/campaigns/${job.campaignId}/shots/${job.shotId}`}
        >
          Shot
        </Link>
      )}
      {!job.characterId && !job.campaignId && (
        <span className="text-muted-foreground">No linked workspace</span>
      )}
    </div>
  );
}

export function VideoBudget({ budget }: { budget: Settings["videoBudget"] }) {
  return (
    <Alert role="note">
      <AlertTitle className="flex flex-wrap items-center gap-2">
        Video submissions{" "}
        <Badge variant="secondary">
          {budget.used} / {budget.cap} used
        </Badge>
        <Badge variant="outline">
          {budget.enabled
            ? "External video enabled"
            : "External video disabled"}
        </Badge>
      </AlertTitle>
      <AlertDescription>
        {budget.remaining} remaining. Rejected and uncertain submission attempts
        still count. Cancelling or marking a job failed does not refund this
        budget.
      </AlertDescription>
    </Alert>
  );
}

export function JsonDetails({
  title,
  value,
  open = false,
}: {
  title: string;
  value: unknown;
  open?: boolean;
}) {
  return (
    <details className="min-w-0 rounded-lg border p-3" open={open}>
      <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
        {title}
      </summary>
      <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
