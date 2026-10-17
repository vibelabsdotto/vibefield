"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  CampaignDetail,
  Character,
  CompiledRequest,
  Job,
  JobStarted,
  ShotDetail,
} from "@vibefield/contracts";
import { ChevronDown, ImagePlus } from "lucide-react";
import {
  isActiveJob,
  thumbUrl,
  useAction,
  useApi,
  useJobs,
  useList,
  useSettings,
} from "@/lib/api";
import {
  EmptyState,
  ImageGenerationControls,
  Loading,
  PageHeader,
  QueryError,
  RequestPreview,
  StatusBadge,
} from "@/components/studio";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ShotFields, shotValues, type ShotValues } from "./shot-editor";
import { MediaVariant } from "./media-variants";
import { VideoDialog } from "./video-dialog";

function ShotStudio({
  shot,
  campaign,
  jobs,
}: {
  shot: ShotDetail;
  campaign: CampaignDetail;
  jobs: Job[];
}) {
  const [draft, setDraft] = useState<ShotValues | null>(null);
  const [generationDraft, setGenerationDraft] = useState<{
    provider: string;
    model: string;
    count: number;
  } | null>(null);
  const [variantTab, setVariantTab] = useState("stills");
  const save = useAction<ShotDetail>("Shot direction saved");
  const generate = useAction<JobStarted>("Still generation queued");
  const settings = useSettings();
  const characterQuery = useApi<Character>(`/characters/${shot.characterId}`);
  const character = characterQuery.data ?? shot.character;
  const ready = character?.status === "active" && !!character.canonicalAssetId;
  const preview = useApi<CompiledRequest>(
    ready ? `/shots/${shot.id}/preview` : null,
  );
  const videoPreview = useApi<CompiledRequest>(
    shot.selectedStillAssetId ? `/shots/${shot.id}/preview?kind=video` : null,
  );
  const values = draft ?? shotValues(shot);
  const dirty = draft !== null;
  const requestedGeneration = generationDraft ?? {
    provider: settings.data?.defaults.imageProvider ?? "",
    model: settings.data?.defaults.imageModel ?? "",
    count: 1,
  };
  const provider = settings.data?.providers.find(
    (entry) => entry.id === requestedGeneration.provider,
  );
  const imageModel = provider?.models.find(
    (entry) => entry.kind === "image" && entry.id === requestedGeneration.model,
  );
  const maxOutputs = imageModel?.maxOutputs ?? 1;
  const generation = {
    ...requestedGeneration,
    count: maxOutputs === 1 ? 1 : requestedGeneration.count,
  };
  const submitting = save.isPending || generate.isPending;
  const active = jobs.some(isActiveJob);
  const unresolved = jobs.some((job) => job.status === "needs_attention");
  const frozen = save.isPending || generate.isPending || active || unresolved;
  const stillJobs = jobs.filter((job) => job.purpose === "still");
  const videoJobs = jobs.filter((job) => job.purpose === "video");
  const stillIds = [
    ...new Set([
      ...(shot.assets ?? [])
        .filter((asset) => asset.kind === "image")
        .map((asset) => asset.id),
      ...stillJobs.flatMap((job) => job.outputAssetIds),
      ...(shot.selectedStillAssetId ? [shot.selectedStillAssetId] : []),
    ]),
  ];
  const videoIds = [
    ...new Set([
      ...(shot.assets ?? [])
        .filter((asset) => asset.kind === "video")
        .map((asset) => asset.id),
      ...videoJobs.flatMap((job) => job.outputAssetIds),
      ...(shot.selectedVideoAssetId ? [shot.selectedVideoAssetId] : []),
    ]),
  ];
  const stale =
    shot.stale ||
    (shot.stillIdentityVersion !== null &&
      character &&
      shot.stillIdentityVersion !== character.identityVersion);
  const defaultPreview =
    generation.provider === settings.data?.defaults.imageProvider &&
    generation.model === settings.data?.defaults.imageModel;
  return (
    <div className="page-stack">
      <PageHeader
        title={shot.title}
        description={campaign.name}
        back={{
          href: `/campaigns/${campaign.id}?tab=shots`,
          label: "Shot sequence",
        }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{campaign.format}</Badge>
            <StatusBadge status={shot.status} />
          </div>
        }
      />
      {stale && (
        <Alert role="note">
          <AlertTitle>Character identity has changed</AlertTitle>
          <AlertDescription>
            This selected still uses an earlier identity version. It remains
            selected. Compare it with the current canonical image before
            generating video, or generate a fresh still.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid min-w-0 grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
        <section
          className="flex min-w-0 flex-col gap-5"
          aria-label="Shot direction"
        >
          <div>
            <h2 className="text-lg font-medium">Direction</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Saved direction feeds the next request. Existing outputs never
              change.
            </p>
          </div>
          <form
            className="flex min-w-0 flex-col gap-5"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await save.mutateAsync({
                  path: `/shots/${shot.id}`,
                  method: "PATCH",
                  body: { ...values, title: values.title.trim() },
                });
                setDraft(null);
              } catch {
                /* Preserve edits and show the error. */
              }
            }}
          >
            <ShotFields
              value={values}
              onChange={setDraft}
              campaign={campaign}
              disabled={frozen}
            />
            {save.error && <QueryError error={save.error} />}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                disabled={
                  frozen ||
                  !dirty ||
                  !values.title.trim() ||
                  !values.characterId
                }
              >
                {save.isPending ? "Saving…" : "Save direction"}
              </Button>
              {dirty && (
                <Button
                  variant="ghost"
                  type="button"
                  disabled={frozen}
                  onClick={() => setDraft(null)}
                >
                  Discard changes
                </Button>
              )}
            </div>
          </form>
        </section>
        <div className="flex min-w-0 flex-col gap-6">
          {dirty && (
            <Alert role="note">
              <AlertTitle>Save your direction before generating</AlertTitle>
              <AlertDescription>
                Your edits are kept here. The request preview still shows the
                saved shot.
              </AlertDescription>
            </Alert>
          )}
          {(active || unresolved) && (
            <Alert role="note">
              <AlertTitle>
                {unresolved
                  ? "A previous submission needs attention"
                  : "Generation is in progress"}
              </AlertTitle>
              <AlertDescription>
                {unresolved
                  ? "The provider may already have charged for an earlier request. Check its job details before intentionally queuing another still."
                  : "Direction stays fixed while jobs run. Each New still click intentionally queues another request; nothing is submitted automatically."}
              </AlertDescription>
            </Alert>
          )}
          {!ready && (
            <Alert role="note">
              <AlertTitle>Approve the character identity first</AlertTitle>
              <AlertDescription>
                Stills need an active character with a canonical image. You can
                still edit this shot.{" "}
                <Link
                  href={`/characters/${shot.characterId}`}
                  className="underline underline-offset-4"
                >
                  Open character
                </Link>
              </AlertDescription>
            </Alert>
          )}
          {characterQuery.error && (
            <QueryError
              error={characterQuery.error}
              retry={() => void characterQuery.refetch()}
            />
          )}
          <Tabs
            value={variantTab}
            onValueChange={(value) => setVariantTab(String(value))}
            className="flex min-w-0 flex-col gap-5"
          >
            <TabsList className="h-9">
              <TabsTrigger value="stills">
                Stills {stillIds.length > 0 ? `(${stillIds.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="videos">
                Videos {videoIds.length > 0 ? `(${videoIds.length})` : ""}
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="stills"
              keepMounted
              className="flex min-w-0 flex-col gap-5 [&[hidden]]:hidden"
            >
              <div className="flex min-w-0 flex-col gap-4 rounded-xl border p-4">
                <ImageGenerationControls
                  value={generation}
                  onChange={setGenerationDraft}
                  disabled={submitting}
                />
                {settings.isPending && <Loading />}
                {settings.error && (
                  <QueryError
                    error={settings.error}
                    retry={() => void settings.refetch()}
                  />
                )}
                {provider && (!provider.available || !provider.configured) && (
                  <p className="text-sm text-muted-foreground">
                    {provider.reason || "Image generation is unavailable."}{" "}
                    <Link
                      className="underline underline-offset-4"
                      href="/settings"
                    >
                      Provider settings
                    </Link>
                  </p>
                )}
                {!settings.isPending && !imageModel && (
                  <p className="text-sm text-muted-foreground">
                    Choose a configured image model before generating.
                  </p>
                )}
                <div>
                  <Button
                    disabled={
                      submitting ||
                      dirty ||
                      !ready ||
                      !provider?.available ||
                      !provider.configured ||
                      !imageModel ||
                      !!settings.error
                    }
                    onClick={async () => {
                      try {
                        await generate.mutateAsync({
                          path: `/shots/${shot.id}/stills`,
                          generation: true,
                          body: generation,
                        });
                      } catch {
                        /* Explicit generation is never retried automatically. */
                      }
                    }}
                  >
                    <ImagePlus data-icon="inline-start" />
                    {generate.isPending
                      ? "Submitting…"
                      : maxOutputs === 1
                        ? "New still"
                        : `Generate ${generation.count} stills`}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Generates from the canonical identity, never from the last
                  candidate. Provider charges may apply.
                </p>
                {generate.error && <QueryError error={generate.error} />}
              </div>
              {stillIds.length === 0 && (
                <EmptyState
                  title="Find the frame before the motion"
                  description="Generate a still, compare it with the character, and approve your choice. Video comes after selection."
                />
              )}
              <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {stillIds.map((id) => (
                  <MediaVariant
                    key={id}
                    id={id}
                    asset={shot.assets?.find((asset) => asset.id === id)}
                    job={stillJobs.find((job) =>
                      job.outputAssetIds.includes(id),
                    )}
                    shotId={shot.id}
                    kind="image"
                    canonicalAssetId={character?.canonicalAssetId}
                    selected={shot.selectedStillAssetId === id}
                    disabled={frozen || active}
                  />
                ))}
              </div>
            </TabsContent>
            <TabsContent
              value="videos"
              className="flex min-w-0 flex-col gap-5 [&[hidden]]:hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
                <div className="min-w-0">
                  <h2 className="font-medium">Animate the selected still</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {shot.selectedStillAssetId
                      ? "Review the model, start frame, motion, and live budget before confirming."
                      : "Approve and select a still first."}
                  </p>
                </div>
                <VideoDialog shot={shot} disabled={dirty || frozen || active} />
              </div>
              {videoIds.length === 0 && (
                <EmptyState
                  title="No video generated yet"
                  description="Video is a separate paid request. Opening the confirmation does not submit anything."
                />
              )}
              <div className="grid min-w-0 grid-cols-1 gap-5">
                {videoIds.map((id) => (
                  <MediaVariant
                    key={id}
                    id={id}
                    asset={shot.assets?.find((asset) => asset.id === id)}
                    job={videoJobs.find((job) =>
                      job.outputAssetIds.includes(id),
                    )}
                    shotId={shot.id}
                    kind="video"
                    canonicalAssetId={character?.canonicalAssetId}
                    selectedStillAssetId={shot.selectedStillAssetId}
                    selected={shot.selectedVideoAssetId === id}
                    disabled={frozen || active}
                  />
                ))}
              </div>
              {shot.selectedStillAssetId && (
                <Collapsible>
                  <CollapsibleTrigger render={<Button variant="outline" />}>
                    <ChevronDown data-icon="inline-start" />
                    Video request preview
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4">
                    {videoPreview.isPending && <Loading />}
                    {videoPreview.error && (
                      <QueryError
                        error={videoPreview.error}
                        retry={() => void videoPreview.refetch()}
                      />
                    )}
                    {videoPreview.data && (
                      <RequestPreview request={videoPreview.data} />
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </TabsContent>
          </Tabs>
          {character?.canonicalAssetId && (
            <section
              className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-4 rounded-xl border p-4"
              aria-label="Identity anchor"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbUrl(character.canonicalAssetId)}
                alt={`${character.name} canonical identity`}
                className="aspect-square w-full rounded-lg bg-muted object-cover"
              />
              <div className="flex min-w-0 flex-col items-start gap-2">
                <h2 className="text-sm font-medium">Canonical identity</h2>
                <p className="text-sm break-words text-muted-foreground">
                  {character.name}
                </p>
                <Badge variant="outline">
                  Version {character.identityVersion}
                </Badge>
                <Link
                  href={`/characters/${character.id}`}
                  className="text-sm underline underline-offset-4"
                >
                  Open character
                </Link>
              </div>
            </section>
          )}
          {ready && (
            <section
              className="flex min-w-0 flex-col gap-4"
              aria-label="Compiled still references"
            >
              <div>
                <h2 className="text-base font-medium">
                  References in request order
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Read-only preview from the saved shot and configured default
                  image model.
                  {!defaultPreview
                    ? " You selected a different model. Its final request may use different reference limits; inspect the resulting job for the exact snapshot."
                    : ""}
                </p>
              </div>
              {preview.isPending && <Loading />}
              {preview.error && (
                <QueryError
                  error={preview.error}
                  retry={() => void preview.refetch()}
                />
              )}
              {preview.data && (
                <>
                  <ol className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
                    {preview.data.referenceRoles.map((ref, index) => (
                      <li
                        key={`${ref.assetId}-${index}`}
                        className="flex min-w-0 flex-col gap-2"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbUrl(ref.assetId)}
                          alt={ref.description}
                          className="aspect-square w-full rounded-lg border bg-muted object-contain"
                        />
                        <p className="text-xs font-medium break-words">
                          {index + 1}. {ref.role}
                        </p>
                        <p className="text-xs break-words text-muted-foreground">
                          {ref.description}
                        </p>
                      </li>
                    ))}
                  </ol>
                  {preview.data.warnings.map((warning, index) => (
                    <Alert key={index} role="note">
                      <AlertDescription>{warning}</AlertDescription>
                    </Alert>
                  ))}
                  {preview.data.droppedRefAssetIds.length > 0 && (
                    <Alert role="note">
                      <AlertTitle>
                        {preview.data.droppedRefAssetIds.length} references
                        excluded by the compiler
                      </AlertTitle>
                      <AlertDescription className="break-all">
                        {preview.data.droppedRefAssetIds.join(", ")}
                      </AlertDescription>
                    </Alert>
                  )}
                  <Collapsible>
                    <CollapsibleTrigger render={<Button variant="outline" />}>
                      <ChevronDown data-icon="inline-start" />
                      Full compiled request
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-4 min-w-0">
                      <RequestPreview request={preview.data} />
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export function ShotWorkspace({
  campaignId,
  shotId,
}: {
  campaignId: string;
  shotId: string;
}) {
  const query = useApi<ShotDetail>(`/shots/${shotId}`);
  const campaignQuery = useApi<CampaignDetail>(`/campaigns/${campaignId}`);
  const live = useJobs(`shotId=${encodeURIComponent(shotId)}`);
  const history = useList<Job>(`/jobs?shotId=${encodeURIComponent(shotId)}`);
  const jobs = [
    ...new Map(
      [
        ...(query.data?.jobs ?? []),
        ...history.items,
        ...(live.data?.items ?? []),
      ].map((job) => [job.id, job]),
    ).values(),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const jobChanges = (live.data?.items ?? [])
    .map((job) => `${job.id}:${job.status}:${job.updatedAt}`)
    .join("|");
  const refetchShot = query.refetch;
  useEffect(() => {
    if (jobChanges) void refetchShot();
  }, [jobChanges, refetchShot]);
  if (query.isPending || campaignQuery.isPending) return <Loading />;
  if (query.error)
    return (
      <QueryError error={query.error} retry={() => void query.refetch()} />
    );
  if (campaignQuery.error)
    return (
      <QueryError
        error={campaignQuery.error}
        retry={() => void campaignQuery.refetch()}
      />
    );
  if (
    !query.data ||
    !campaignQuery.data ||
    query.data.campaignId !== campaignId
  )
    return (
      <EmptyState
        title="Shot not found in this campaign"
        description="Return to the campaign and choose a shot from its sequence."
      />
    );
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ShotStudio
        key={shotId}
        shot={query.data}
        campaign={campaignQuery.data}
        jobs={jobs}
      />
      <section
        className="flex min-w-0 flex-col gap-4 border-t pt-6"
        aria-label="Shot generation jobs"
      >
        <h2 className="text-base font-medium">Generation history</h2>
        {live.error && (
          <QueryError error={live.error} retry={() => void live.refetch()} />
        )}
        {history.error && (
          <QueryError
            error={history.error}
            retry={() => void history.refetch()}
          />
        )}
        {jobs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No generation jobs for this shot.
          </p>
        )}
        {jobs.map((job) => (
          <div
            key={job.id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <StatusBadge status={job.status} />
              <span className="text-sm">
                {job.kind === "video" ? "Video" : "Still"}
              </span>
              <span className="text-xs break-all text-muted-foreground">
                {job.modelRequested}
              </span>
            </div>
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={`/jobs/${job.id}`}
            >
              Job details
            </Link>
            {job.error && (
              <div className="w-full">
                <QueryError error={new Error(job.error.message)} />
              </div>
            )}
            {isActiveJob(job) && (
              <p role="status" className="w-full text-xs text-muted-foreground">
                {job.status === "queued"
                  ? "Waiting for the generation worker."
                  : "The provider request is in progress. No new request will be sent automatically."}
              </p>
            )}
          </div>
        ))}
        {history.hasNextPage && (
          <div>
            <Button
              variant="outline"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              Load older jobs
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
