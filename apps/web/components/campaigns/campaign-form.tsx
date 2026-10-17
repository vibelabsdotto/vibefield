"use client";

import { useState } from "react";
import type {
  Campaign,
  Character,
  CreateCampaignInput,
} from "@vibefield/contracts";
import { useList } from "@/lib/api";
import {
  AssetPicker,
  EmptyState,
  Loading,
  QueryError,
  SelectField,
  StatusBadge,
  TextField,
  UploadDialog,
} from "@/components/studio";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";

export type CampaignValues = Required<CreateCampaignInput>;
export function campaignValues(campaign?: Campaign): CampaignValues {
  return {
    name: campaign?.name ?? "",
    brief: campaign?.brief ?? "",
    productName: campaign?.productName ?? "",
    format: campaign?.format ?? "9:16",
    status: campaign?.status ?? "draft",
    productAssetIds: campaign?.productAssetIds ?? [],
    characterIds: campaign?.characterIds ?? [],
  };
}

export function CampaignFields({
  value,
  onChange,
  disabled = false,
}: {
  value: CampaignValues;
  onChange: (value: CampaignValues) => void;
  disabled?: boolean;
}) {
  const characters = useList<Character>("/characters");
  const set = <K extends keyof CampaignValues>(
    key: K,
    next: CampaignValues[K],
  ) => onChange({ ...value, [key]: next });
  const [search, setSearch] = useState("");
  const visible = characters.items.filter((character) =>
    character.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <FieldGroup className="@container">
      <TextField
        label="Campaign name"
        required
        value={value.name}
        onChange={(v) => set("name", v)}
        disabled={disabled}
        placeholder="Name your campaign"
      />
      <FieldGroup className="grid grid-cols-1 gap-4 @sm:grid-cols-2">
        <SelectField
          label="Format"
          value={value.format}
          onChange={(v) => set("format", v as CampaignValues["format"])}
          disabled={disabled}
          options={[
            { value: "9:16", label: "9:16 · Vertical" },
            { value: "16:9", label: "16:9 · Landscape" },
            { value: "1:1", label: "1:1 · Square" },
            { value: "3:4", label: "3:4 · Portrait" },
            { value: "4:5", label: "4:5 · Portrait" },
          ]}
        />
        <SelectField
          label="Status"
          value={value.status}
          onChange={(v) => set("status", v as CampaignValues["status"])}
          disabled={disabled}
          options={[
            { value: "draft", label: "Draft" },
            { value: "active", label: "Active" },
            { value: "done", label: "Done" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </FieldGroup>
      <TextField
        label="Creative brief"
        multiline
        value={value.brief}
        onChange={(v) => set("brief", v)}
        disabled={disabled}
        placeholder="Audience, message, setting, and what the ad should make people do."
      />
      <FieldSet disabled={disabled}>
        <FieldLegend>Product</FieldLegend>
        <TextField
          label="Product name"
          value={value.productName}
          onChange={(v) => set("productName", v)}
          disabled={disabled}
        />
        <AssetPicker
          disabled={disabled}
          label="Product images"
          value={value.productAssetIds}
          onChange={(v) => {
            if (!disabled) set("productAssetIds", v);
          }}
          multiple
          kind="image"
        />
        {!disabled && (
          <div>
            <UploadDialog
              triggerLabel="Upload product image"
              onUploaded={(asset) => {
                if (asset.kind === "image")
                  set("productAssetIds", [
                    ...new Set([...value.productAssetIds, asset.id]),
                  ]);
              }}
            />
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Product images follow the character identity references in each still
          request.
        </p>
      </FieldSet>
      <FieldSet disabled={disabled}>
        <FieldLegend>Cast</FieldLegend>
        <p className="text-sm text-muted-foreground">
          Assign characters to this campaign. A character needs an approved
          identity before generating stills.
        </p>
        {characters.isPending && <Loading />}
        {characters.error && (
          <QueryError
            error={characters.error}
            retry={() => void characters.refetch()}
          />
        )}
        {characters.items.length > 0 && (
          <TextField
            label="Find a character"
            value={search}
            onChange={setSearch}
            placeholder="Search loaded characters"
            disabled={disabled}
          />
        )}
        <div className="flex max-h-64 flex-col gap-3 overflow-y-auto p-1">
          {visible.map((character) => (
            <Field key={character.id} orientation="horizontal">
              <Checkbox
                id={`cast-${character.id}`}
                checked={value.characterIds.includes(character.id)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  set(
                    "characterIds",
                    checked
                      ? [...new Set([...value.characterIds, character.id])]
                      : value.characterIds.filter((id) => id !== character.id),
                  )
                }
              />
              <FieldLabel
                htmlFor={`cast-${character.id}`}
                className="min-w-0 flex-1 flex-wrap"
              >
                <span className="break-words">{character.name}</span>
                <StatusBadge status={character.status} />
              </FieldLabel>
            </Field>
          ))}
        </div>
        {!characters.isPending &&
          !characters.error &&
          characters.items.length === 0 && (
            <EmptyState
              title="No characters yet"
              description="You can save the brief now and add your cast later."
            />
          )}
        {characters.hasNextPage && (
          <Button
            type="button"
            variant="outline"
            disabled={characters.isFetchingNextPage || disabled}
            onClick={() => void characters.fetchNextPage()}
          >
            Load more characters
          </Button>
        )}
        {value.characterIds.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {value.characterIds.length} assigned. Existing assignments stay
            selected when you search or load more.
          </p>
        )}
      </FieldSet>
    </FieldGroup>
  );
}
