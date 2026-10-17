"use client";

import Link from "next/link";
import type { Asset, AssetDetail, Job } from "@vibefield/contracts";
import { useAction, useApi } from "@/lib/api";
import {
  AssetMedia,
  Loading,
  ModelFacts,
  QueryError,
  ReviewDialog,
  StatusBadge,
} from "@/components/studio";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { latestShotApproval } from "./video-dialog";

export function MediaVariant({
  id,
  asset,
  job,
  shotId,
  canonicalAssetId,
  selectedStillAssetId,
  selected,
  kind,
  disabled = false,
}: {
  id: string;
  asset?: Asset;
  job?: Job;
  shotId: string;
  canonicalAssetId?: string | null;
  selectedStillAssetId?: string | null;
  selected: boolean;
  kind: "image" | "video";
  disabled?: boolean;
}) {
  const query = useApi<AssetDetail>(`/assets/${id}`);
  const select = useAction(
    kind === "image" ? "Still selected" : "Video selected",
  );
  const media = query.data ?? asset;
  const approved = latestShotApproval(query.data, shotId);
  const wrongStartFrame =
    kind === "video" &&
    (!selectedStillAssetId ||
      (!!job && job.request.startFrameAssetId !== selectedStillAssetId));
  const review = query.data?.reviews
    ?.filter((item) => item.contextType === "shot" && item.contextId === shotId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return (
    <Card className="min-w-0 gap-0 overflow-hidden py-0">
      <div className="relative bg-muted">
        {media ? (
          <AssetMedia
            asset={media}
            controls={kind === "video"}
            className="aspect-[4/3] w-full object-contain"
          />
        ) : query.isPending ? (
          <div className="p-6">
            <Loading />
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">
            Media unavailable
          </div>
        )}
        {selected && (
          <div className="pointer-events-none absolute top-3 left-3">
            <Badge>Selected {kind === "image" ? "still" : "video"}</Badge>
          </div>
        )}
      </div>
      <CardContent className="flex min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge status={review?.decision ?? "unreviewed"} />
          {media?.width && media.height && (
            <span className="text-xs text-muted-foreground">
              {media.width} × {media.height}
              {media.durationMs != null
                ? ` · ${(media.durationMs / 1000).toFixed(1)}s`
                : ""}
            </span>
          )}
        </div>
        {job && <ModelFacts job={job} />}
        {review?.notes && (
          <p className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
            {review.notes}
          </p>
        )}
        {query.error && (
          <QueryError error={query.error} retry={() => void query.refetch()} />
        )}
        {select.error && <QueryError error={select.error} />}
        {!approved && (
          <p className="text-xs text-muted-foreground">
            Review and approve this {kind === "image" ? "still" : "video"}{" "}
            before selecting it.
          </p>
        )}
        {wrongStartFrame && (
          <p className="text-xs text-muted-foreground">
            This video does not match the selected still. Select its original
            start frame before choosing this video.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t p-3">
        {media && (
          <ReviewDialog
            asset={media}
            contextType="shot"
            contextId={shotId}
            canonicalAssetId={canonicalAssetId}
            onReviewed={() => void query.refetch()}
          />
        )}
        <Button
          variant={selected ? "secondary" : "outline"}
          size="sm"
          disabled={
            disabled ||
            selected ||
            !approved ||
            wrongStartFrame ||
            select.isPending ||
            !!query.error
          }
          onClick={async () => {
            try {
              await select.mutateAsync({
                path: `/shots/${shotId}/${kind === "image" ? "select-still" : "select-video"}`,
                body: { assetId: id },
              });
            } catch {
              /* Keep the candidate and inline error. */
            }
          }}
        >
          {select.isPending
            ? "Selecting…"
            : selected
              ? "Selected"
              : kind === "image"
                ? "Select still"
                : "Select video"}
        </Button>
        {job && (
          <Link
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            href={`/jobs/${job.id}`}
          >
            Job
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
