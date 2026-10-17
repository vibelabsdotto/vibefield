"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Film } from "lucide-react";
import type {
  AssetDetail,
  CampaignDetail,
  JobStarted,
  Settings,
  ShotDetail,
} from "@vibefield/contracts";
import { api, thumbUrl, useAction, useApi, useSettings } from "@/lib/api";
import { Loading, QueryError, SelectField } from "@/components/studio";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

export function latestShotApproval(
  asset: AssetDetail | undefined,
  shotId: string,
) {
  return (
    asset?.reviews
      ?.filter(
        (review) =>
          review.contextType === "shot" && review.contextId === shotId,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.decision ===
    "approved"
  );
}

export function VideoDialog({
  shot: currentShot,
  disabled = false,
}: {
  shot: ShotDetail;
  disabled?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<ShotDetail | null>(null);
  const shot = snapshot ?? currentShot;
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [audio, setAudio] = useState(false);
  const [modelDraft, setModelDraft] = useState<string | null>(null);
  const [durationDraft, setDurationDraft] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<unknown>(null);
  const [checking, setChecking] = useState(false);
  const settings = useSettings();
  const campaign = useApi<CampaignDetail>(
    open ? `/campaigns/${shot.campaignId}` : null,
  );
  const frame = useApi<AssetDetail>(
    open && shot.selectedStillAssetId
      ? `/assets/${shot.selectedStillAssetId}`
      : null,
  );
  const action = useAction<JobStarted>("Video job queued");
  const busy = checking || action.isPending;
  const refetchSettings = settings.refetch;
  useEffect(() => {
    if (!open) return;
    void refetchSettings();
  }, [open, refetchSettings]);
  const model = modelDraft ?? settings.data?.defaults.videoModel ?? "";
  const providers =
    settings.data?.providers.filter((provider) =>
      provider.kinds.includes("video"),
    ) ?? [];
  const provider = providers.find((item) =>
    item.models.some((entry) => entry.kind === "video" && entry.id === model),
  );
  const capability = provider?.models.find(
    (item) => item.id === model && item.kind === "video",
  );
  const duration = durationDraft ?? shot.durationSeconds;
  const budget = settings.data?.videoBudget;
  const unavailable =
    !provider?.configured ||
    !provider?.available ||
    capability?.supportsStartFrame !== true;
  const unsupportedDuration = !capability?.durations?.includes(duration);
  const unsupportedResolution = !capability?.resolutions?.includes(
    shot.resolution,
  );
  const unsupportedAspect =
    !campaign.data || !capability?.aspectRatios?.includes(campaign.data.format);
  const approved = latestShotApproval(frame.data, shot.id);
  async function submit() {
    if (busy || !confirmed) return;
    setChecking(true);
    setValidationError(null);
    try {
      const [freshSettings, freshShot, freshFrame, freshCampaign] =
        await Promise.all([
          api<Settings>("/settings"),
          api<ShotDetail>(`/shots/${shot.id}`),
          api<AssetDetail>(`/assets/${shot.selectedStillAssetId}`),
          api<CampaignDetail>(`/campaigns/${shot.campaignId}`),
        ]);
      const freshProvider = freshSettings.providers.find((item) =>
        item.models.some(
          (entry) => entry.id === model && entry.kind === "video",
        ),
      );
      if (!freshSettings.videoBudget.enabled)
        throw new Error(
          "External video generation is disabled. Enable it in the API configuration first.",
        );
      if (freshSettings.videoBudget.remaining < 1)
        throw new Error(
          "The video submission budget is exhausted. No request was submitted.",
        );
      if (!freshProvider?.available || !freshProvider.configured)
        throw new Error(
          freshProvider?.reason ||
            "The selected video provider is unavailable.",
        );
      const freshCapability = freshProvider.models.find(
        (item) => item.id === model && item.kind === "video",
      );
      if (
        freshCapability?.supportsStartFrame !== true ||
        !freshCapability.durations?.includes(duration) ||
        !freshCapability.resolutions?.includes(shot.resolution) ||
        !freshCapability.aspectRatios?.includes(freshCampaign.format)
      )
        throw new Error(
          "Verified support for this start frame, duration, resolution and aspect ratio is required. No paid request was sent.",
        );
      if (audio && freshCapability.supportsAudio !== true)
        throw new Error(
          "The selected model does not have verified audio support. Turn audio off before submitting.",
        );
      if (
        freshShot.selectedStillAssetId !== shot.selectedStillAssetId ||
        freshShot.motion !== shot.motion ||
        freshShot.resolution !== shot.resolution ||
        freshShot.characterId !== shot.characterId ||
        freshCampaign.format !== campaign.data?.format
      )
        throw new Error(
          "The shot changed while this confirmation was open. Close it, review the updated shot, and confirm again.",
        );
      if (!latestShotApproval(freshFrame, shot.id))
        throw new Error(
          "The selected start frame no longer has an approved shot review. Review it again before generating video.",
        );
      await action.mutateAsync({
        path: `/shots/${shot.id}/video`,
        generation: true,
        body: {
          confirmExternal: true,
          model,
          durationSeconds: duration,
          resolution: shot.resolution,
          generateAudio: audio && freshCapability.supportsAudio === true,
        },
      });
      setOpen(false);
      setConfirmed(false);
    } catch (error) {
      setValidationError(error);
    } finally {
      setChecking(false);
      void settings.refetch();
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (busy) {
          details.cancel();
          return;
        }
        if (next) {
          setSnapshot(currentShot);
          setModelDraft(model);
          setDurationDraft(currentShot.durationSeconds);
          setAudio(false);
          setConfirmed(false);
          setValidationError(null);
          action.reset();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          <Button disabled={disabled || !currentShot.selectedStillAssetId} />
        }
      >
        <Film data-icon="inline-start" />
        Generate video
      </DialogTrigger>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>Confirm paid video generation</DialogTitle>
          <DialogDescription>
            One explicit request to the external video provider. No automatic
            retries.
          </DialogDescription>
        </DialogHeader>
        {settings.isPending && <Loading />}
        {settings.error && (
          <QueryError
            error={settings.error}
            retry={() => void settings.refetch()}
          />
        )}
        {budget && (
          <Alert role="note">
            <Film />
            <AlertTitle>
              {budget.used} of {budget.cap} video submissions used
            </AlertTitle>
            <AlertDescription>
              {budget.enabled
                ? `This request uses 1 of ${budget.remaining} remaining submissions.`
                : "External video is disabled in the API configuration."}{" "}
              Failed or ambiguous submission attempts still count. This limit is
              not a price quote.
            </AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <SelectField
            label="Video model"
            value={model}
            onChange={(value) => {
              setModelDraft(value);
              setAudio(false);
              setConfirmed(false);
            }}
            disabled={busy}
            options={providers.flatMap((item) =>
              item.models
                .filter((entry) => entry.kind === "video")
                .map((entry) => ({
                  value: entry.id,
                  label: `${item.label} · ${entry.label}`,
                })),
            )}
          />
          {capability?.durations?.length ? (
            <SelectField
              label="Requested duration"
              value={String(duration)}
              onChange={(value) => {
                setDurationDraft(Number(value));
                setConfirmed(false);
              }}
              disabled={busy}
              options={capability.durations.map((value) => ({
                value: String(value),
                label: `${value} seconds`,
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Requested duration: {duration} seconds. Requested resolution:{" "}
              {shot.resolution}.
            </p>
          )}
        </FieldGroup>
        {unavailable && (
          <p className="text-sm text-muted-foreground">
            {provider?.reason ||
              "Choose an available model with verified start-frame support."}{" "}
            <Link href="/settings" className="underline underline-offset-4">
              Provider settings
            </Link>
          </p>
        )}
        {(unsupportedDuration ||
          unsupportedResolution ||
          unsupportedAspect) && (
          <QueryError
            error={
              new Error(
                "Verified model support is required for the requested duration, resolution and campaign aspect ratio. Choose compatible shot settings or another model before submitting.",
              )
            }
          />
        )}
        <QueryError
          error={campaign.error}
          retry={() => void campaign.refetch()}
        />
        <Field orientation="horizontal">
          <Checkbox
            id={`audio-${shot.id}`}
            checked={audio && capability?.supportsAudio === true}
            disabled={busy || capability?.supportsAudio !== true}
            onCheckedChange={(value) => {
              setAudio(value);
              setConfirmed(false);
            }}
          />
          <FieldLabel htmlFor={`audio-${shot.id}`}>
            Generate audio
            {capability?.supportsAudio !== true
              ? ", not supported by this model"
              : ""}
          </FieldLabel>
        </Field>
        {shot.selectedStillAssetId && (
          <figure className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbUrl(shot.selectedStillAssetId)}
              alt="Selected approved start frame for this video"
              className="max-h-56 w-full rounded-lg bg-muted object-contain"
            />
            <figcaption className="text-xs break-all text-muted-foreground">
              Start frame: {shot.selectedStillAssetId}
            </figcaption>
          </figure>
        )}
        {frame.isPending && open && (
          <p role="status" className="text-sm text-muted-foreground">
            Checking the start-frame review…
          </p>
        )}
        {frame.error && (
          <QueryError error={frame.error} retry={() => void frame.refetch()} />
        )}
        {frame.data && !approved && (
          <QueryError
            error={
              new Error(
                "The selected still needs an approved review for this shot before it can be animated.",
              )
            }
          />
        )}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Saved motion direction</h3>
          <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground">
            {shot.motion || "No additional motion direction saved."}
          </p>
          <p className="text-xs text-muted-foreground">
            Provider: {provider?.label || "None selected"}. Requested model:{" "}
            {model || "None selected"}. Requested resolution: {shot.resolution}.
            Audio is{" "}
            {audio && capability?.supportsAudio === true ? "on" : "off"}. Actual
            model and output facts appear on the job when reported.
          </p>
        </section>
        <Field orientation="horizontal">
          <Checkbox
            id={`confirm-video-${shot.id}`}
            checked={confirmed}
            disabled={busy}
            onCheckedChange={setConfirmed}
          />
          <FieldLabel htmlFor={`confirm-video-${shot.id}`}>
            I approve this start frame and authorize one paid external video
            request.
          </FieldLabel>
        </Field>
        {validationError != null && <QueryError error={validationError} />}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={
              busy ||
              !confirmed ||
              !approved ||
              unavailable ||
              unsupportedDuration ||
              unsupportedResolution ||
              unsupportedAspect ||
              !budget?.enabled ||
              budget.remaining < 1 ||
              !!settings.error
            }
            onClick={() => void submit()}
          >
            {busy ? "Submitting once…" : "Confirm paid video"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
