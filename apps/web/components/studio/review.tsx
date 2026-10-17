"use client";
import { useState, type FormEvent } from "react";
import type {
  Asset,
  Job,
  ReviewDecision,
  ReviewResult,
} from "@vibefield/contracts";
import { assetUrl, useAction, useApi } from "@/lib/api";
import { AssetMedia } from "./media";
import { ModelFacts, QueryError, SelectField, TextField } from "./index";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";

const imageChecks = [
  "Identity matches the canonical image",
  "Hair and distinguishing marks",
  "Hands and anatomy",
  "Framing and visible artifacts",
];
const shotChecks = ["Product is correct", "Scene and action match the brief"];
const videoChecks = [
  "Identity stays consistent through the clip",
  "Motion and temporal artifacts",
  "Audio matches the direction",
];
const resultOptions = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "unsure", label: "Unsure" },
  { value: "na", label: "Not applicable" },
];
export function ReviewDialog({
  asset,
  contextType,
  contextId,
  canonicalAssetId,
  onReviewed,
}: {
  asset: Asset;
  contextType: "character" | "shot";
  contextId: string;
  canonicalAssetId?: string | null;
  onReviewed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<ReviewDecision>("needs_changes");
  const [notes, setNotes] = useState("");
  const [checks, setChecks] = useState<Record<string, ReviewResult>>({});
  const action = useAction("Review saved");
  const job = useApi<Job>(
    open && asset.sourceJobId ? `/jobs/${asset.sourceJobId}` : null,
  );
  const items = [
    ...imageChecks,
    ...(contextType === "shot" ? shotChecks : []),
    ...(asset.kind === "video" ? videoChecks : []),
  ];
  async function save(event: FormEvent) {
    event.preventDefault();
    if (action.isPending || items.some((item) => !checks[item])) return;
    try {
      await action.mutateAsync({
        path: "/reviews",
        body: {
          assetId: asset.id,
          contextType,
          contextId,
          decision,
          checklist: items.map((item) => ({ item, result: checks[item] })),
          notes,
        },
      });
      onReviewed?.();
      setOpen(false);
    } catch {
      /* Keep all review input on failure. */
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (action.isPending) {
          details.cancel();
          return;
        }
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Review
      </DialogTrigger>
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl"
        showCloseButton={!action.isPending}
      >
        <DialogHeader>
          <DialogTitle>
            Review {asset.kind === "video" ? "video" : "image"}
          </DialogTitle>
          <DialogDescription>
            Record what you actually see. Approval is separate from choosing a
            canonical image or a final shot.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-5">
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
                <figure className="flex min-w-0 flex-col gap-2">
                  <AssetMedia
                    asset={asset}
                    className="aspect-[3/4] max-h-[55dvh] w-full rounded-lg object-contain"
                  />
                  <figcaption className="text-xs text-muted-foreground">
                    Candidate
                  </figcaption>
                </figure>
                {canonicalAssetId && canonicalAssetId !== asset.id ? (
                  <figure className="flex min-w-0 flex-col gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={assetUrl(canonicalAssetId)}
                      alt="Canonical identity anchor for side-by-side comparison"
                      className="aspect-[3/4] max-h-[55dvh] w-full rounded-lg bg-muted object-contain"
                    />
                    <figcaption className="text-xs text-muted-foreground">
                      Canonical identity
                    </figcaption>
                  </figure>
                ) : (
                  <p className="self-center text-sm text-muted-foreground">
                    {canonicalAssetId === asset.id
                      ? "This image is the current canonical anchor."
                      : "No canonical image yet. Assess this candidate as a new identity."}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {asset.width && asset.height
                    ? `${asset.width} × ${asset.height} actual pixels`
                    : "Dimensions not reported"}
                </Badge>
                {asset.durationMs !== null && (
                  <Badge variant="outline">
                    {(asset.durationMs / 1000).toFixed(2)} seconds actual
                  </Badge>
                )}
              </div>
              {job.data && (
                <>
                  <ModelFacts job={job.data} />
                  <p className="text-xs text-muted-foreground">
                    Requested aspect {job.data.request.aspectRatio}
                    {job.data.request.params.durationSeconds
                      ? `, duration ${job.data.request.params.durationSeconds}s`
                      : ""}
                    . No computed quality score.
                  </p>
                </>
              )}
              <QueryError error={job.error} retry={() => void job.refetch()} />
            </div>
            <FieldGroup>
              {items.map((item) => (
                <SelectField
                  key={item}
                  label={item}
                  value={checks[item] ?? ""}
                  onChange={(value) =>
                    setChecks({ ...checks, [item]: value as ReviewResult })
                  }
                  options={resultOptions}
                  disabled={action.isPending}
                />
              ))}
            </FieldGroup>
          </div>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Decision"
              value={decision}
              onChange={(v) => setDecision(v as ReviewDecision)}
              options={[
                { value: "approved", label: "Approved" },
                { value: "needs_changes", label: "Needs changes" },
                { value: "rejected", label: "Rejected" },
              ]}
              disabled={action.isPending}
            />
            <TextField
              label="Review notes"
              value={notes}
              onChange={setNotes}
              multiline
              disabled={action.isPending}
              placeholder={
                contextType === "shot"
                  ? "Needs-changes notes will guide the next generation for this shot."
                  : "What should be kept or changed?"
              }
            />
          </FieldGroup>
          <QueryError error={action.error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={action.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={action.isPending || items.some((item) => !checks[item])}
            >
              {action.isPending ? "Saving review…" : "Save review"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
