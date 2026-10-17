"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Asset, Campaign, Character } from "@vibefield/contracts";
import { useList } from "@/lib/api";
import {
  AssetDetailDialog,
  AssetMedia,
  EmptyState,
  Loading,
  PageHeader,
  QueryError,
  SelectField,
  TextField,
  UploadDialog,
} from "@/components/studio";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldGroup } from "@/components/ui/field";
export function LibraryView() {
  const router = useRouter();
  const search = useSearchParams();
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [characterId, setCharacterId] = useState("all");
  const [campaignId, setCampaignId] = useState("all");
  const selected = search.get("asset");
  const characters = useList<Character>("/characters");
  const campaigns = useList<Campaign>("/campaigns");
  const params = new URLSearchParams({ limit: "40" });
  if (kind !== "all") params.set("kind", kind);
  if (q) params.set("q", q);
  if (characterId !== "all") params.set("characterId", characterId);
  if (campaignId !== "all") params.set("campaignId", campaignId);
  const assets = useList<Asset>(`/assets?${params}`);
  function open(id: string | null) {
    router.replace(
      id ? `/library?asset=${encodeURIComponent(id)}` : "/library",
      { scroll: false },
    );
  }
  return (
    <div className="page-stack">
      <PageHeader
        title="Library"
        description="Source material and generated media, with their original history."
        actions={<UploadDialog onUploaded={(asset) => open(asset.id)} />}
      />
      <FieldGroup className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TextField
          label="Search files"
          value={q}
          onChange={setQ}
          placeholder="File name"
        />
        <SelectField
          label="Media type"
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "All media" },
            { value: "image", label: "Images" },
            { value: "video", label: "Videos" },
          ]}
        />
        <SelectField
          label="Character"
          value={characterId}
          onChange={setCharacterId}
          options={[
            { value: "all", label: "All characters" },
            ...characters.items.map((character) => ({
              value: character.id,
              label: character.name,
            })),
          ]}
        />
        <SelectField
          label="Campaign"
          value={campaignId}
          onChange={setCampaignId}
          options={[
            { value: "all", label: "All campaigns" },
            ...campaigns.items.map((campaign) => ({
              value: campaign.id,
              label: campaign.name,
            })),
          ]}
        />
      </FieldGroup>
      <QueryError
        error={characters.error}
        retry={() => void characters.refetch()}
      />
      <QueryError
        error={campaigns.error}
        retry={() => void campaigns.refetch()}
      />
      {(characters.hasNextPage || campaigns.hasNextPage) && (
        <div className="flex flex-wrap gap-2">
          {characters.hasNextPage && (
            <Button
              variant="outline"
              onClick={() => void characters.fetchNextPage()}
              disabled={characters.isFetchingNextPage}
            >
              More character filters
            </Button>
          )}
          {campaigns.hasNextPage && (
            <Button
              variant="outline"
              onClick={() => void campaigns.fetchNextPage()}
              disabled={campaigns.isFetchingNextPage}
            >
              More campaign filters
            </Button>
          )}
        </div>
      )}
      {assets.isPending && <Loading />}
      <QueryError error={assets.error} retry={() => void assets.refetch()} />
      {!assets.isPending && !assets.error && !assets.items.length && (
        <EmptyState
          title="No media here yet"
          description="Upload an authorized photo or product image, or generate from a character or shot workspace."
        />
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {assets.items.map((asset) => (
          <button
            key={asset.id}
            className="flex min-w-0 flex-col overflow-hidden rounded-xl border text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => open(asset.id)}
          >
            <AssetMedia
              asset={asset}
              controls={false}
              className="aspect-[4/5] w-full"
            />
            <div className="flex w-full min-w-0 flex-col gap-2 p-3">
              <span className="truncate text-sm">
                {asset.originalName || asset.id}
              </span>
              <div className="flex flex-wrap justify-between gap-1">
                <Badge variant="secondary">{asset.kind}</Badge>
                <span className="text-xs text-muted-foreground">
                  {asset.width && asset.height
                    ? `${asset.width} × ${asset.height}`
                    : asset.mime}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
      {assets.hasNextPage && (
        <div>
          <Button
            variant="outline"
            disabled={assets.isFetchingNextPage}
            onClick={() => void assets.fetchNextPage()}
          >
            Load more media
          </Button>
        </div>
      )}
      <AssetDetailDialog
        id={selected}
        open={!!selected}
        onOpenChange={(next) => {
          if (!next) open(null);
        }}
      />
    </div>
  );
}
