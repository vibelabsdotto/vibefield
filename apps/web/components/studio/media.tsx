"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { Download, ImageOff, Upload, X } from "lucide-react";
import type {
  Asset,
  AssetDetail,
  AssetUploaded,
  Job,
} from "@vibefield/contracts";
import { assetUrl, thumbUrl, useAction, useApi, useList } from "@/lib/api";
import {
  EmptyState,
  Loading,
  ModelFacts,
  QueryError,
  StatusBadge,
  TextField,
} from "./index";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function AssetMedia({
  asset,
  className,
  controls = true,
}: {
  asset: Asset;
  className?: string;
  controls?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div
        className={cn(
          "flex min-h-32 items-center justify-center gap-2 bg-muted text-xs text-muted-foreground",
          className,
        )}
      >
        <ImageOff className="size-4" />
        Media could not be loaded
      </div>
    );
  if (asset.kind === "video")
    return (
      <video
        src={assetUrl(asset.id)}
        controls={controls}
        preload="metadata"
        playsInline
        aria-label={asset.originalName || "Generated video"}
        className={cn("bg-muted object-contain", className)}
        onError={() => setFailed(true)}
      />
    );
  // The same-origin API supplies bounded, cached thumbnails and strips source metadata.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbUrl(asset.id)}
      alt={asset.originalName || "Studio image"}
      loading="lazy"
      className={cn("bg-muted object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}
export function UploadDialog({
  onUploaded,
  triggerLabel = "Upload media",
}: {
  onUploaded?: (asset: Asset) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [validation, setValidation] = useState<Error | null>(null);
  const id = useId();
  const action = useAction<AssetUploaded>("Media uploaded");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !consent || action.isPending) return;
    const limit =
      file.type === "video/mp4" ? 200 * 1024 * 1024 : 25 * 1024 * 1024;
    if (
      !["image/png", "image/jpeg", "image/webp", "video/mp4"].includes(
        file.type,
      ) ||
      file.size > limit
    ) {
      setValidation(
        new Error("Use PNG, JPEG or WebP up to 25 MB, or MP4 up to 200 MB."),
      );
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("consent", "true");
    try {
      const result = await action.mutateAsync({ path: "/assets", body: form });
      onUploaded?.(result.asset);
      setOpen(false);
      setFile(null);
      setConsent(false);
    } catch {
      /* Preserve the file and consent for an explicit retry. */
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
        if (next) {
          setFile(null);
          setConsent(false);
          setValidation(null);
          action.reset();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Upload data-icon="inline-start" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent
        showCloseButton={!action.isPending}
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Upload source media</DialogTitle>
          <DialogDescription>
            Images stay in your local library. They are sent externally only
            when you generate with them.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${id}-file`}>Source file</FieldLabel>
              <Input
                key={open ? "open" : "closed"}
                id={`${id}-file`}
                type="file"
                accept="image/png,image/jpeg,image/webp,video/mp4"
                disabled={action.isPending}
                required
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setValidation(null);
                }}
              />
              <FieldDescription>
                PNG, JPEG or WebP up to 25 MB. MP4 up to 200 MB. Image metadata
                is removed.
              </FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-consent`}
                checked={consent}
                disabled={action.isPending}
                onCheckedChange={setConsent}
              />
              <FieldLabel htmlFor={`${id}-consent`}>
                I own or am authorized to use this material, and have the
                consent needed for any identifiable person.
              </FieldLabel>
            </Field>
          </FieldGroup>
          <QueryError error={validation || action.error} />
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
              disabled={!file || !consent || action.isPending}
            >
              {action.isPending ? "Uploading…" : "Upload to library"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function AssetPicker({
  label,
  value,
  onChange,
  kind = "image",
  multiple = true,
  disabled = false,
}: {
  label: string;
  value: string[];
  onChange: (ids: string[]) => void;
  kind?: "image" | "video";
  multiple?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const assets = useList<Asset>(
    open ? `/assets?kind=${kind}&q=${encodeURIComponent(q)}&limit=40` : null,
  );
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      {value.length > 0 && (
        <ol className="flex flex-wrap gap-2">
          {value.map((id, index) => (
            <li
              key={id}
              className="flex min-w-0 items-center gap-2 rounded-lg border p-1"
            >
              <Badge variant="secondary">{index + 1}</Badge>
              {kind === "image" && <MiniImage id={id} />}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove reference ${index + 1}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((v) => v !== id))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className="w-fit max-w-full"
            />
          }
        >
          {value.length
            ? `Edit selection · ${value.length}`
            : `Choose ${kind === "image" ? "images" : "videos"}`}
        </DialogTrigger>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              Selected images are kept in the order you choose them.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <TextField
              label="Search library"
              value={q}
              onChange={setQ}
              placeholder="File name"
            />
          </FieldGroup>
          {assets.isPending && <Loading />}
          <QueryError
            error={assets.error}
            retry={() => void assets.refetch()}
          />
          {!assets.isPending && !assets.error && !assets.items.length && (
            <EmptyState
              title="No media found"
              description="Upload a source file or adjust your search."
            />
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {assets.items.map((asset) => (
              <button
                type="button"
                key={asset.id}
                aria-pressed={value.includes(asset.id)}
                className={cn(
                  "min-w-0 overflow-hidden rounded-lg border text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  value.includes(asset.id) &&
                    "border-primary ring-2 ring-primary",
                )}
                onClick={() =>
                  onChange(
                    value.includes(asset.id)
                      ? value.filter((id) => id !== asset.id)
                      : multiple
                        ? [...value, asset.id]
                        : [asset.id],
                  )
                }
              >
                <AssetMedia
                  asset={asset}
                  controls={false}
                  className="aspect-square w-full"
                />
                <div className="flex items-center gap-2 p-2">
                  <span className="truncate text-xs">
                    {asset.originalName || asset.id}
                  </span>
                  {value.includes(asset.id) && (
                    <Badge>{value.indexOf(asset.id) + 1}</Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
          {assets.hasNextPage && (
            <Button
              variant="outline"
              disabled={assets.isFetchingNextPage}
              onClick={() => void assets.fetchNextPage()}
            >
              Load more
            </Button>
          )}
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Field>
  );
}
function MiniImage({ id }: { id: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbUrl(id, 256)}
      alt="Selected reference"
      className="size-9 rounded object-cover"
    />
  );
}
export function AssetDetailDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useApi<AssetDetail>(open && id ? `/assets/${id}` : null);
  const asset = query.data;
  const source = useApi<Job>(
    open && asset?.sourceJobId ? `/jobs/${asset.sourceJobId}` : null,
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{asset?.originalName || "Media detail"}</DialogTitle>
          <DialogDescription>
            Original media, review history and generation provenance.
          </DialogDescription>
        </DialogHeader>
        {query.isPending && <Loading />}
        <QueryError error={query.error} retry={() => void query.refetch()} />
        {asset && (
          <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <AssetMedia
              asset={asset}
              className="max-h-[65dvh] w-full rounded-lg object-contain"
            />
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{asset.kind}</Badge>
                <Badge variant="outline">{asset.mime}</Badge>
              </div>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
                <dt className="text-muted-foreground">Dimensions</dt>
                <dd>
                  {asset.width && asset.height
                    ? `${asset.width} × ${asset.height}`
                    : "Not reported"}
                </dd>
                <dt className="text-muted-foreground">Size</dt>
                <dd>{(asset.bytes / 1024 / 1024).toFixed(2)} MB</dd>
                {asset.durationMs !== null && (
                  <>
                    <dt className="text-muted-foreground">Duration</dt>
                    <dd>{(asset.durationMs / 1000).toFixed(2)} seconds</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Asset</dt>
                <dd className="break-all">{asset.id}</dd>
                <dt className="text-muted-foreground">SHA-256</dt>
                <dd className="break-all">{asset.sha256}</dd>
              </dl>
              {source.data && (
                <>
                  <ModelFacts job={source.data} />
                  <Link
                    href={`/jobs/${source.data.id}`}
                    className="text-sm underline"
                  >
                    Open source job
                  </Link>
                </>
              )}
              <QueryError
                error={source.error}
                retry={() => void source.refetch()}
              />
              {!asset.sourceJobId && (
                <p className="text-xs text-muted-foreground">
                  Uploaded source.{" "}
                  {asset.consentConfirmed
                    ? "Rights and consent confirmed at upload."
                    : "Consent not confirmed."}
                </p>
              )}
              <a
                href={assetUrl(asset.id)}
                download={asset.originalName || asset.id}
                className={buttonVariants({ variant: "outline" })}
              >
                <Download data-icon="inline-start" />
                Download original
              </a>
              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-medium">Review history</h3>
                {!asset.reviews?.length && (
                  <p className="text-xs text-muted-foreground">
                    No reviews yet. Review in the character or shot workspace.
                  </p>
                )}
                {asset.reviews?.map((review) => (
                  <div
                    key={review.id}
                    className="flex flex-col gap-1 rounded-lg border p-3"
                  >
                    <StatusBadge status={review.decision} />
                    <p className="text-xs">{review.notes || "No notes"}</p>
                    <p className="text-xs text-muted-foreground">
                      {review.contextType} review by {review.actor}
                    </p>
                  </div>
                ))}
              </section>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
