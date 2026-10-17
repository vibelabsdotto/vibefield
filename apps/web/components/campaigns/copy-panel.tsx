"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, FileText } from "lucide-react";
import type { Job, JobStarted } from "@vibefield/contracts";
import {
  isActiveJob,
  useAction,
  useJobs,
  useList,
  useSettings,
} from "@/lib/api";
import {
  EmptyState,
  Loading,
  ModelFacts,
  QueryError,
  SelectField,
  StatusBadge,
  TextField,
} from "@/components/studio";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";

export function CopyPanel({ campaignId }: { campaignId: string }) {
  const settings = useSettings();
  const live = useJobs(`campaignId=${encodeURIComponent(campaignId)}`);
  const history = useList<Job>(
    `/jobs?campaignId=${encodeURIComponent(campaignId)}`,
  );
  const action = useAction<JobStarted>("Copy job queued");
  const [instruction, setInstruction] = useState("");
  const [modelDraft, setModelDraft] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState<unknown>(null);
  const model = modelDraft ?? settings.data?.defaults.textModel ?? "";
  const providers =
    settings.data?.providers.filter((provider) =>
      provider.kinds.includes("text"),
    ) ?? [];
  const options = providers.flatMap((provider) =>
    provider.models
      .filter((item) => item.kind === "text")
      .map((item) => ({ value: item.id, label: item.label })),
  );
  const provider = providers.find((item) =>
    item.models.some((entry) => entry.kind === "text" && entry.id === model),
  );
  const jobs = [
    ...new Map(
      [...history.items, ...(live.data?.items ?? [])].map((job) => [
        job.id,
        job,
      ]),
    ).values(),
  ]
    .filter((job) => job.purpose === "copy")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = jobs.some(isActiveJob);
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Campaign copy</CardTitle>
        <CardDescription>
          Draft text from the saved brief and character persona. Generated text
          never runs actions.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        <FieldGroup>
          <TextField
            label="Copy direction"
            multiline
            value={instruction}
            onChange={setInstruction}
            disabled={action.isPending}
            placeholder="For example, a short hook, three captions, and a call to action."
          />
          <SelectField
            label="Text model"
            value={model}
            onChange={setModelDraft}
            options={options}
            disabled={action.isPending || !options.length}
          />
        </FieldGroup>
        {settings.isPending && <Loading />}
        {settings.error && (
          <QueryError
            error={settings.error}
            retry={() => void settings.refetch()}
          />
        )}
        {provider && (!provider.available || !provider.configured) && (
          <p className="text-sm text-muted-foreground">
            {provider.reason || "The text provider is not configured."}{" "}
            <Link href="/settings" className="underline underline-offset-4">
              Open settings
            </Link>
          </p>
        )}
        {!settings.isPending && !provider && (
          <p className="text-sm text-muted-foreground">
            No available model selected. Configure a text provider in settings.
          </p>
        )}
        <div>
          <Button
            disabled={
              action.isPending ||
              active ||
              !provider?.available ||
              !provider?.configured ||
              !model
            }
            onClick={async () => {
              try {
                await action.mutateAsync({
                  path: `/campaigns/${campaignId}/copy`,
                  generation: true,
                  body: { instruction, model },
                });
              } catch {
                /* Visible below. */
              }
            }}
          >
            <FileText data-icon="inline-start" />
            {action.isPending || active
              ? "Copy job in progress…"
              : "Generate copy"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Uses the configured text provider and may incur a charge. Each click
          creates one job, with no automatic retries.
        </p>
        {action.error && <QueryError error={action.error} />}
        {live.error && (
          <QueryError error={live.error} retry={() => void live.refetch()} />
        )}
        {history.error && (
          <QueryError
            error={history.error}
            retry={() => void history.refetch()}
          />
        )}
        {clipboardError != null && <QueryError error={clipboardError} />}
        {jobs.map((job) => (
          <section
            key={job.id}
            className="flex min-w-0 flex-col gap-3 border-t pt-4"
            aria-label="Copy result"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={job.status} />
              <Link
                href={`/jobs/${job.id}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Job details
              </Link>
            </div>
            <ModelFacts job={job} />
            {job.error && <QueryError error={new Error(job.error.message)} />}
            {job.resultText && (
              <>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {job.resultText}
                </p>
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(job.resultText!);
                        setClipboardError(null);
                        toast.add({
                          title: "Copy saved to clipboard",
                          type: "success",
                        });
                      } catch (error) {
                        setClipboardError(error);
                      }
                    }}
                  >
                    <Copy data-icon="inline-start" />
                    Copy text
                  </Button>
                </div>
              </>
            )}
            {isActiveJob(job) && (
              <p role="status" className="text-sm text-muted-foreground">
                Waiting for the provider. You can leave this page and return
                later.
              </p>
            )}
          </section>
        ))}
        {!history.isPending && !live.isPending && jobs.length === 0 && (
          <EmptyState
            title="No copy generated"
            description="Save your brief, then ask for the text this campaign needs."
          />
        )}
        {history.hasNextPage && (
          <Button
            variant="outline"
            disabled={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            Load older jobs
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
