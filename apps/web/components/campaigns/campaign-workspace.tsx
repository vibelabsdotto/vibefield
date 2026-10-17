"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  Film,
  ImageIcon,
} from "lucide-react";
import type {
  Campaign,
  CampaignDetail,
  Character,
  Shot,
} from "@vibefield/contracts";
import { api, assetUrl, thumbUrl, useAction, useApi } from "@/lib/api";
import {
  EmptyState,
  Loading,
  PageHeader,
  QueryError,
  StatusBadge,
} from "@/components/studio";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CampaignFields,
  campaignValues,
  type CampaignValues,
} from "./campaign-form";
import { CreateShotDialog } from "./shot-editor";
import { CopyPanel } from "./copy-panel";

function Brief({ campaign }: { campaign: Campaign }) {
  const [draft, setDraft] = useState<CampaignValues | null>(null);
  const action = useAction<Campaign>("Campaign brief saved");
  const value = draft ?? campaignValues(campaign);
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <form
        className="flex min-w-0 flex-col gap-6"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await action.mutateAsync({
              path: `/campaigns/${campaign.id}`,
              method: "PATCH",
              body: { ...value, name: value.name.trim() },
            });
            setDraft(null);
          } catch {
            /* Preserve edits. */
          }
        }}
      >
        <CampaignFields
          value={value}
          onChange={setDraft}
          disabled={action.isPending}
        />
        {action.error && <QueryError error={action.error} />}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={action.isPending || draft === null || !value.name.trim()}
          >
            {action.isPending ? "Saving…" : "Save brief"}
          </Button>
          {draft !== null && (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDraft(null)}
                disabled={action.isPending}
              >
                Discard changes
              </Button>
              <span className="text-xs text-muted-foreground">
                Unsaved changes
              </span>
            </>
          )}
        </div>
      </form>
      <CopyPanel campaignId={campaign.id} />
    </div>
  );
}

function ShotCard({
  shot,
  index,
  count,
  busy,
  move,
}: {
  shot: Shot;
  index: number;
  count: number;
  busy: boolean;
  move: (offset: number) => void;
}) {
  const character = useApi<Character>(`/characters/${shot.characterId}`);
  const stale =
    shot.stillIdentityVersion !== null &&
    character.data &&
    character.data.identityVersion !== shot.stillIdentityVersion;
  return (
    <article className="grid min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl border bg-card sm:grid-cols-[160px_minmax(0,1fr)_auto]">
      <Link
        href={`/campaigns/${shot.campaignId}/shots/${shot.id}`}
        className="relative flex aspect-video items-center justify-center bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:aspect-auto sm:min-h-36"
        aria-label={`Open shot ${index + 1}: ${shot.title}`}
      >
        {shot.selectedStillAssetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl(shot.selectedStillAssetId)}
            alt={`Selected still for ${shot.title}`}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
            <ImageIcon className="size-6" aria-hidden />
            <span className="text-xs">No selected still</span>
          </div>
        )}
      </Link>
      <div className="flex min-w-0 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm tabular-nums text-muted-foreground">
            Shot {index + 1}
          </span>
          <StatusBadge status={shot.status} />
          {stale && <Badge variant="outline">Identity changed</Badge>}
        </div>
        <Link
          href={`/campaigns/${shot.campaignId}/shots/${shot.id}`}
          className="w-fit font-medium break-words underline-offset-4 hover:underline"
        >
          {shot.title}
        </Link>
        <p className="line-clamp-2 text-sm break-words text-muted-foreground">
          {shot.scene || "Add the scene and action in the shot workspace."}
        </p>
        <p className="text-xs text-muted-foreground">
          {character.data?.name ?? "Character"}{" "}
          {shot.selectedVideoAssetId ? "· Video selected" : ""}
        </p>
        {character.error && (
          <QueryError
            error={character.error}
            retry={() => void character.refetch()}
          />
        )}
      </div>
      <div className="flex items-center justify-end gap-1 border-t p-3 sm:flex-col sm:justify-center sm:border-t-0 sm:border-l">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Move ${shot.title} up`}
          title="Move shot up"
          disabled={busy || index === 0}
          onClick={() => move(-1)}
        >
          <ArrowUp />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Move ${shot.title} down`}
          title="Move shot down"
          disabled={busy || index === count - 1}
          onClick={() => move(1)}
        >
          <ArrowDown />
        </Button>
      </div>
    </article>
  );
}

function ShotBoard({ campaign }: { campaign: CampaignDetail }) {
  const reorder = useAction("Shot order saved");
  const shots = [...campaign.shots].sort((a, b) => a.position - b.position);
  async function move(id: string, offset: number) {
    const ids = shots.map((shot) => shot.id);
    const position = ids.indexOf(id);
    if (
      position < 0 ||
      position + offset < 0 ||
      position + offset >= ids.length
    )
      return;
    const current = ids[position];
    const neighbor = ids[position + offset];
    if (!current || !neighbor) return;
    ids[position] = neighbor;
    ids[position + offset] = current;
    try {
      await reorder.mutateAsync({
        path: `/campaigns/${campaign.id}/shots/reorder`,
        body: { ids },
      });
    } catch {
      /* Server rejects stale membership; preserve existing order. */
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Shot sequence</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {shots.length} {shots.length === 1 ? "shot" : "shots"}. Move shots
            up or down to change the export order.
          </p>
        </div>
        <CreateShotDialog campaign={campaign} />
      </div>
      {reorder.error && <QueryError error={reorder.error} />}
      {shots.length === 0 && (
        <EmptyState
          title="Build the first frame"
          description="Give each shot a character, a scene, and an action. Review the still before you animate it."
        />
      )}
      <div className="flex min-w-0 flex-col gap-4">
        {shots.map((shot, index) => (
          <ShotCard
            key={shot.id}
            shot={shot}
            index={index}
            count={shots.length}
            busy={reorder.isPending}
            move={(offset) => void move(shot.id, offset)}
          />
        ))}
      </div>
    </div>
  );
}

function ExportPanel({ campaign }: { campaign: CampaignDetail }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const shots = [...campaign.shots].sort((a, b) => a.position - b.position);
  const selected = shots.filter(
    (shot) => shot.selectedStillAssetId || shot.selectedVideoAssetId,
  );
  const incomplete = shots.filter((shot) => !shot.selectedVideoAssetId);
  async function download() {
    setPending(true);
    setError(null);
    try {
      // Recheck the exact campaign before downloading; the server revalidates approvals.
      await api<CampaignDetail>(`/campaigns/${campaign.id}`);
      const response = await fetch(
        `/api/v1/campaigns/${encodeURIComponent(campaign.id)}/export`,
        { headers: { "X-Vibefield-Actor": "web" } },
      );
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          result?.error?.message || `Export failed (${response.status})`,
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${campaign.name.replace(/[^a-z0-9_-]/gi, "-") || "campaign"}.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex max-w-3xl min-w-0 flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Campaign package</CardTitle>
          <CardDescription>
            Selected approved stills and videos, plus the manifest with
            requests, reviews, and model provenance. This is a media package,
            not a stitched film.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {incomplete.length > 0 && (
            <Alert role="note">
              <Film />
              <AlertTitle>
                {incomplete.length}{" "}
                {incomplete.length === 1 ? "shot has" : "shots have"} no
                selected video
              </AlertTitle>
              <AlertDescription>
                You can export selected stills now. Incomplete shots are listed
                in the manifest, never silently omitted.
              </AlertDescription>
            </Alert>
          )}
          {shots.length === 0 && (
            <EmptyState
              title="Nothing to export yet"
              description="Add a shot, then review and select at least one still or video."
            />
          )}
          <ol className="flex flex-col divide-y">
            {shots.map((shot, index) => (
              <li
                key={shot.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/campaigns/${campaign.id}/shots/${shot.id}`}
                    className="text-sm font-medium break-words hover:underline"
                  >
                    {index + 1}. {shot.title}
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      shot.selectedStillAssetId ? "secondary" : "outline"
                    }
                  >
                    {shot.selectedStillAssetId && <Check />}{" "}
                    {shot.selectedStillAssetId
                      ? "Still selected"
                      : "Still missing"}
                  </Badge>
                  <Badge
                    variant={
                      shot.selectedVideoAssetId ? "secondary" : "outline"
                    }
                  >
                    {shot.selectedVideoAssetId && <Check />}{" "}
                    {shot.selectedVideoAssetId
                      ? "Video selected"
                      : "Video missing"}
                  </Badge>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Approvals are checked again at export time. A newer rejection may
            require reviewing or selecting an output again.
          </p>
          {error != null && (
            <QueryError error={error} retry={() => void download()} />
          )}
          <div>
            <Button
              disabled={pending || selected.length === 0}
              onClick={() => void download()}
            >
              <Download data-icon="inline-start" />
              {pending ? "Preparing package…" : "Download campaign ZIP"}
            </Button>
          </div>
        </CardContent>
      </Card>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {selected
            .filter((shot) => shot.selectedVideoAssetId)
            .map((shot) => (
              <a
                key={shot.id}
                href={assetUrl(shot.selectedVideoAssetId!)}
                download
                className={buttonVariants({
                  variant: "outline",
                  className: "min-h-8 h-auto whitespace-normal text-left",
                })}
              >
                Download {shot.title} video
              </a>
            ))}
        </div>
      )}
    </div>
  );
}

export function CampaignWorkspace({ campaignId }: { campaignId: string }) {
  const query = useApi<CampaignDetail>(`/campaigns/${campaignId}`);
  const search = useSearchParams();
  const router = useRouter();
  const requestedTab = search.get("tab");
  const tab = ["brief", "shots", "export"].includes(requestedTab ?? "")
    ? requestedTab!
    : "shots";
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <QueryError error={query.error} retry={() => void query.refetch()} />
    );
  if (!query.data)
    return (
      <EmptyState
        title="Campaign unavailable"
        description="Return to Campaigns and choose another campaign."
      />
    );
  const campaign = query.data;
  return (
    <div className="page-stack">
      <PageHeader
        title={campaign.name}
        description={
          campaign.productName || "A story told one approved frame at a time."
        }
        back={{ href: "/campaigns", label: "Campaigns" }}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">{campaign.format}</Badge>
            <StatusBadge status={campaign.status} />
          </div>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) =>
          router.replace(`/campaigns/${campaignId}?tab=${String(value)}`, {
            scroll: false,
          })
        }
        className="flex min-w-0 flex-col gap-6"
      >
        <TabsList className="h-9">
          <TabsTrigger value="brief">Brief</TabsTrigger>
          <TabsTrigger value="shots">Shots</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>
        <TabsContent value="brief" keepMounted>
          <Brief campaign={campaign} />
        </TabsContent>
        <TabsContent value="shots">
          <ShotBoard campaign={campaign} />
        </TabsContent>
        <TabsContent value="export">
          <ExportPanel campaign={campaign} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
