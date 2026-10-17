"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import type {
  Campaign,
  Character,
  CreateShotInput,
  Shot,
} from "@vibefield/contracts";
import { useAction, useList, useSettings } from "@/lib/api";
import {
  AssetPicker,
  Loading,
  QueryError,
  SelectField,
  TextField,
  UploadDialog,
} from "@/components/studio";
import { Button, buttonVariants } from "@/components/ui/button";
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

export type ShotValues = Required<CreateShotInput>;
export function shotValues(shot?: Shot, characterId = ""): ShotValues {
  return {
    title: shot?.title ?? "",
    characterId: shot?.characterId ?? characterId,
    scene: shot?.scene ?? "",
    action: shot?.action ?? "",
    camera: shot?.camera ?? "",
    lighting: shot?.lighting ?? "",
    wardrobe: shot?.wardrobe ?? "",
    dialogue: shot?.dialogue ?? "",
    motion: shot?.motion ?? "",
    refAssetIds: shot?.refAssetIds ?? [],
    durationSeconds: shot?.durationSeconds ?? 5,
    resolution: shot?.resolution ?? "720p",
  };
}

export function ShotFields({
  value,
  onChange,
  campaign,
  disabled = false,
}: {
  value: ShotValues;
  onChange: (value: ShotValues) => void;
  campaign: Campaign;
  disabled?: boolean;
}) {
  const characters = useList<Character>("/characters");
  const settings = useSettings();
  const videoModels =
    settings.data?.providers.flatMap((provider) =>
      provider.models.filter((model) => model.kind === "video"),
    ) ?? [];
  const durations = [
    ...new Set([
      value.durationSeconds,
      ...videoModels.flatMap((model) => model.durations ?? []),
    ]),
  ].sort((a, b) => a - b);
  const resolutions = [
    ...new Set([
      value.resolution,
      ...videoModels.flatMap((model) => model.resolutions ?? []),
    ]),
  ];
  const eligible = characters.items.filter(
    (character) =>
      campaign.characterIds.includes(character.id) ||
      character.id === value.characterId,
  );
  const set = <K extends keyof ShotValues>(key: K, next: ShotValues[K]) =>
    onChange({ ...value, [key]: next });
  const options = eligible.map((character) => ({
    value: character.id,
    label: `${character.name}${character.status === "active" ? "" : " · Identity not ready"}`,
  }));
  if (
    value.characterId &&
    !options.some((option) => option.value === value.characterId)
  )
    options.push({
      value: value.characterId,
      label: "Assigned character · Load more to see name",
    });
  return (
    <FieldGroup>
      <TextField
        label="Shot title"
        required
        value={value.title}
        onChange={(v) => set("title", v)}
        disabled={disabled}
        placeholder="What happens in this shot?"
      />
      <SelectField
        label="Character"
        value={value.characterId}
        onChange={(v) => set("characterId", v)}
        options={options}
        disabled={disabled || characters.isPending}
        description="Choose from this campaign's cast. Identity must be approved before generation."
      />
      {characters.isPending && <Loading />}
      {characters.error && (
        <QueryError
          error={characters.error}
          retry={() => void characters.refetch()}
        />
      )}
      {characters.hasNextPage && (
        <Button
          variant="outline"
          type="button"
          disabled={disabled || characters.isFetchingNextPage}
          onClick={() => void characters.fetchNextPage()}
        >
          Load more characters
        </Button>
      )}
      {campaign.characterIds.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Add a character in the{" "}
          <Link
            className={buttonVariants({
              variant: "link",
              className: "h-auto p-0",
            })}
            href={`/campaigns/${campaign.id}?tab=brief`}
          >
            campaign brief
          </Link>{" "}
          first.
        </p>
      )}
      <TextField
        label="Scene"
        multiline
        value={value.scene}
        onChange={(v) => set("scene", v)}
        disabled={disabled}
        placeholder="Location, background, and where the product sits."
      />
      <TextField
        label="Action"
        multiline
        value={value.action}
        onChange={(v) => set("action", v)}
        disabled={disabled}
        placeholder="What the character is doing in the still."
      />
      <TextField
        label="Camera and framing"
        value={value.camera}
        onChange={(v) => set("camera", v)}
        disabled={disabled}
        placeholder="Close-up at eye level, product in the foreground"
      />
      <TextField
        label="Lighting"
        value={value.lighting}
        onChange={(v) => set("lighting", v)}
        disabled={disabled}
      />
      <TextField
        label="Wardrobe"
        value={value.wardrobe}
        onChange={(v) => set("wardrobe", v)}
        disabled={disabled}
      />
      <TextField
        label="Dialogue"
        multiline
        value={value.dialogue}
        onChange={(v) => set("dialogue", v)}
        disabled={disabled}
        placeholder="Optional spoken line or copy direction"
      />
      <TextField
        label="Motion direction"
        multiline
        value={value.motion}
        onChange={(v) => set("motion", v)}
        disabled={disabled}
        placeholder="How the selected still should move. Video is a separate paid action."
      />
      <SelectField
        label="Requested video duration"
        value={String(value.durationSeconds)}
        onChange={(v) => set("durationSeconds", Number(v))}
        options={durations.map((duration) => ({
          value: String(duration),
          label: `${duration} seconds`,
        }))}
        disabled={disabled}
      />
      <SelectField
        label="Requested video resolution"
        value={value.resolution}
        onChange={(v) => set("resolution", v)}
        options={resolutions.map((resolution) => ({
          value: resolution,
          label: resolution,
        }))}
        disabled={disabled}
        description="Video only. Options come from the provider catalog plus the saved value. The selected model must explicitly support them before submission."
      />
      {settings.error && (
        <QueryError
          error={settings.error}
          retry={() => void settings.refetch()}
        />
      )}
      <AssetPicker
        disabled={disabled}
        label="Additional image references"
        value={value.refAssetIds}
        onChange={(v) => {
          if (!disabled) set("refAssetIds", v);
        }}
        kind="image"
        multiple
      />
      {!disabled && (
        <div>
          <UploadDialog
            triggerLabel="Upload a shot reference"
            onUploaded={(asset) => {
              if (asset.kind === "image")
                set("refAssetIds", [
                  ...new Set([...value.refAssetIds, asset.id]),
                ]);
            }}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Character identity and product images are attached automatically.
        Additional references do not replace the identity anchor.
      </p>
    </FieldGroup>
  );
}

export function CreateShotDialog({ campaign }: { campaign: Campaign }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() =>
    shotValues(undefined, campaign.characterIds[0] ?? ""),
  );
  const action = useAction<Shot>("Shot created");
  const router = useRouter();
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
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        Add shot
      </DialogTrigger>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        showCloseButton={!action.isPending}
      >
        <DialogHeader>
          <DialogTitle>Add a shot</DialogTitle>
          <DialogDescription>
            Write the direction first. Creating a shot does not generate media.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-w-0 flex-col gap-6"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const shot = await action.mutateAsync({
                path: `/campaigns/${campaign.id}/shots`,
                body: { ...draft, title: draft.title.trim() },
              });
              setOpen(false);
              setDraft(shotValues(undefined, campaign.characterIds[0] ?? ""));
              router.push(`/campaigns/${campaign.id}/shots/${shot.id}`);
            } catch {
              /* Keep the draft and mutation error. */
            }
          }}
        >
          <ShotFields
            value={draft}
            onChange={setDraft}
            campaign={campaign}
            disabled={action.isPending}
          />
          {action.error && <QueryError error={action.error} />}
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
              disabled={
                action.isPending || !draft.title.trim() || !draft.characterId
              }
            >
              {action.isPending ? "Creating…" : "Create shot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
