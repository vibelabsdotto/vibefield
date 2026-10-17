"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type {
  Asset,
  AssetDetail,
  CharacterDetail,
  CharacterReference,
  Job,
  ReferenceRole,
} from "@vibefield/contracts";
import { thumbUrl, useAction, useApi, useList } from "@/lib/api";
import {
  AssetMedia,
  AssetPicker,
  EmptyState,
  Loading,
  ModelFacts,
  QueryError,
  ReviewDialog,
  SelectField,
  StatusBadge,
} from "@/components/studio";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
const roles = [
  { value: "sheet", label: "Reference sheet" },
  { value: "angle", label: "Face angle" },
  { value: "expression", label: "Expression" },
  { value: "scene", label: "Empty scene plate" },
  { value: "upload", label: "Uploaded identity reference" },
];
export function CharacterCandidate({
  asset,
  character,
  onCompare,
}: {
  asset: Asset;
  character: CharacterDetail;
  onCompare: () => void;
}) {
  const detail = useApi<AssetDetail>(`/assets/${asset.id}`);
  const job = useApi<Job>(
    asset.sourceJobId ? `/jobs/${asset.sourceJobId}` : null,
  );
  const approved =
    detail.data?.reviews
      ?.filter(
        (review) =>
          review.contextType === "character" &&
          review.contextId === character.id,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.decision ===
    "approved";
  const [open, setOpen] = useState(false);
  const canonical = useAction("Canonical identity updated");
  const selected = character.canonicalAssetId === asset.id;
  return (
    <Card className="min-w-0 gap-0 overflow-hidden py-0">
      <AssetMedia asset={asset} className="aspect-[3/4] w-full" />
      <CardContent className="flex min-w-0 flex-col gap-3 p-3">
        <div className="flex flex-wrap gap-2">
          {selected && <Badge>Canonical</Badge>}
          {approved && <Badge variant="secondary">Approved</Badge>}
          {job.data?.request.params.derivationRole && (
            <Badge variant="outline">
              {job.data.request.params.derivationRole}
            </Badge>
          )}
          {!selected && job.data &&
            job.data.request.identityVersion !== null &&
            job.data.request.identityVersion !== character.identityVersion && (
              <Badge variant="outline">
                Historical identity v{job.data.request.identityVersion}
              </Badge>
            )}
        </div>
        {job.data ? (
          <ModelFacts job={job.data} />
        ) : (
          !asset.sourceJobId && (
            <p className="text-xs text-muted-foreground">
              Uploaded source photo
            </p>
          )
        )}
        <QueryError error={detail.error} retry={() => void detail.refetch()} />
        <QueryError error={job.error} retry={() => void job.refetch()} />
        <QueryError error={canonical.error} />
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t p-3">
        <ReviewDialog
          asset={asset}
          contextType="character"
          contextId={character.id}
          canonicalAssetId={character.canonicalAssetId}
          onReviewed={() => void detail.refetch()}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={onCompare}
          disabled={!character.canonicalAssetId}
        >
          Compare
        </Button>
        <AlertDialog
          open={open}
          onOpenChange={(next, details) => {
            if (canonical.isPending) {
              details.cancel();
              return;
            }
            setOpen(next);
          }}
        >
          <AlertDialogTrigger
            render={
              <Button
                size="sm"
                variant={selected ? "secondary" : "outline"}
                disabled={selected || !approved || canonical.isPending}
              />
            }
          >
            {selected ? "Canonical" : "Make canonical"}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Use this as the identity anchor?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This explicitly replaces the canonical image and increments the
                identity version. Existing shots keep their media and are
                flagged as historical. Earlier references will not be reused
                automatically.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <QueryError error={canonical.error} />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={canonical.isPending}>
                Keep current
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={canonical.isPending}
                onClick={async () => {
                  try {
                    await canonical.mutateAsync({
                      path: `/characters/${character.id}/canonical`,
                      body: { assetId: asset.id },
                    });
                    setOpen(false);
                  } catch {
                    /* Keep confirmation visible. */
                  }
                }}
              >
                {canonical.isPending ? "Updating…" : "Make canonical"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {!selected && (
          <AddReference character={character} fixedAssetId={asset.id} />
        )}
        <Link
          href={`/library?asset=${asset.id}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Details
        </Link>
      </CardFooter>
      {!approved && !selected && (
        <p className="px-3 pb-3 text-xs text-muted-foreground">
          Approve a character review before promotion.
        </p>
      )}
    </Card>
  );
}
export function CharacterReferences({
  character,
}: {
  character: CharacterDetail;
}) {
  const refs = useList<CharacterReference>(
    `/characters/${character.id}/references`,
  );
  const action = useAction("Reference updated");
  const [moving, setMoving] = useState(false);
  async function move(reference: CharacterReference, direction: number) {
    if (moving || action.isPending) return;
    const ordered = [...refs.items].sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((item) => item.id === reference.id);
    const target = ordered[index + direction];
    if (!target) return;
    setMoving(true);
    try {
      await action.mutateAsync({
        path: `/characters/${character.id}/references/${reference.id}`,
        method: "PATCH",
        body: { position: target.position },
      });
      await action.mutateAsync({
        path: `/characters/${character.id}/references/${target.id}`,
        method: "PATCH",
        body: { position: reference.position },
      });
    } catch {
      /* Refetch exposes the actual partial order on failure. */
    } finally {
      setMoving(false);
    }
  }
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Approved references</h2>
        <AddReference character={character} />
      </div>
      <p className="text-xs text-muted-foreground">
        Only approved references from identity v{character.identityVersion} are
        eligible. A sheet or face angle follows the canonical image; scene
        plates go last.
      </p>
      {refs.isPending && <Loading />}
      <QueryError error={refs.error} retry={() => void refs.refetch()} />
      <QueryError error={action.error} />
      {!refs.isPending && !refs.error && !refs.items.length && (
        <EmptyState
          title="No supporting references"
          description="Derive a sheet or angle, or attach an authorized image from the library. Approve each reference explicitly."
        />
      )}
      <div className="flex flex-col gap-3">
        {[...refs.items]
          .sort((a, b) => a.position - b.position)
          .map((reference, index) => (
            <div
              key={reference.id}
              className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbUrl(reference.assetId, 256)}
                alt={`${reference.role} reference`}
                className="size-16 rounded-md object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="text-sm font-medium">
                  {roles.find((role) => role.value === reference.role)?.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge
                    status={reference.approved ? "approved" : "needs_changes"}
                  />
                  {reference.identityVersion !== character.identityVersion && (
                    <Badge variant="outline">
                      Stale v{reference.identityVersion}, excluded
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Field orientation="horizontal">
                  <Switch
                    id={`approve-${reference.id}`}
                    checked={reference.approved}
                    disabled={
                      action.isPending ||
                      reference.identityVersion !== character.identityVersion
                    }
                    onCheckedChange={async (approved) => {
                      try {
                        await action.mutateAsync({
                          path: `/characters/${character.id}/references/${reference.id}`,
                          method: "PATCH",
                          body: { approved },
                        });
                      } catch {
                        /* No optimistic approval. */
                      }
                    }}
                  />
                  <FieldLabel htmlFor={`approve-${reference.id}`}>
                    Use
                  </FieldLabel>
                </Field>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move reference earlier"
                  disabled={index === 0 || action.isPending || moving}
                  onClick={() => void move(reference, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move reference later"
                  disabled={
                    index === refs.items.length - 1 ||
                    action.isPending ||
                    moving
                  }
                  onClick={() => void move(reference, 1)}
                >
                  <ArrowDown />
                </Button>
                <RemoveReference
                  characterId={character.id}
                  reference={reference}
                />
              </div>
            </div>
          ))}
      </div>
      {refs.hasNextPage && (
        <Button
          variant="outline"
          onClick={() => void refs.fetchNextPage()}
          disabled={refs.isFetchingNextPage}
        >
          Load more references
        </Button>
      )}
    </section>
  );
}
function AddReference({
  character,
  fixedAssetId,
}: {
  character: CharacterDetail;
  fixedAssetId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<string[]>(fixedAssetId ? [fixedAssetId] : []);
  const [role, setRole] = useState<ReferenceRole>("upload");
  const action = useAction("Reference added for review");
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
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Add reference
      </DialogTrigger>
      <DialogContent showCloseButton={!action.isPending}>
        <DialogHeader>
          <DialogTitle>Add supporting reference</DialogTitle>
          <DialogDescription>
            The image is not approved automatically and never replaces the
            canonical identity.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {!fixedAssetId && (
            <AssetPicker
              label="Reference image"
              value={ids}
              onChange={setIds}
              multiple={false}
              disabled={action.isPending}
            />
          )}
          <SelectField
            label="Reference role"
            value={role}
            onChange={(value) => setRole(value as ReferenceRole)}
            options={roles}
            disabled={action.isPending}
          />
        </FieldGroup>
        <QueryError error={action.error} />
        <DialogFooter>
          <Button
            variant="outline"
            disabled={action.isPending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={
              ids.length !== 1 ||
              action.isPending ||
              ids[0] === character.canonicalAssetId
            }
            onClick={async () => {
              try {
                await action.mutateAsync({
                  path: `/characters/${character.id}/references`,
                  body: { assetId: ids[0], role, approved: false },
                });
                setOpen(false);
              } catch {
                /* Selection stays. */
              }
            }}
          >
            {action.isPending ? "Adding…" : "Add reference"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function RemoveReference({
  characterId,
  reference,
}: {
  characterId: string;
  reference: CharacterReference;
}) {
  const [open, setOpen] = useState(false);
  const action = useAction("Reference removed");
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next, details) => {
        if (action.isPending) {
          details.cancel();
          return;
        }
        setOpen(next);
      }}
    >
      <AlertDialogTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Remove reference"
          />
        }
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this reference?</AlertDialogTitle>
          <AlertDialogDescription>
            Only the character association is removed. The source media and
            history stay in the library.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <QueryError error={action.error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={action.isPending}>
            Keep reference
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={action.isPending}
            onClick={async () => {
              try {
                await action.mutateAsync({
                  path: `/characters/${characterId}/references/${reference.id}`,
                  method: "DELETE",
                });
                setOpen(false);
              } catch {
                /* Keep dialog. */
              }
            }}
          >
            {action.isPending ? "Removing…" : "Remove reference"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
