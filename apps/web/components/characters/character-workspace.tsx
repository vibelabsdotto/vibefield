"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import type {
  Appearance,
  Asset,
  Character,
  CharacterDetail,
  DerivationRole,
  Job,
  JobStarted,
  Persona,
} from "@vibefield/contracts";
import {
  isActiveJob,
  useAction,
  useApi,
  useJobs,
  useList,
  useSettings,
  assetUrl,
} from "@/lib/api";
import {
  AssetMedia,
  EmptyState,
  ImageGenerationControls,
  Loading,
  ModelFacts,
  PageHeader,
  QueryError,
  SelectField,
  StatusBadge,
  TextField,
  UploadDialog,
  type ImageGenerationValue,
} from "@/components/studio";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldGroup } from "@/components/ui/field";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CharacterCandidate, CharacterReferences } from "./references";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const appearanceFields: Array<[keyof Appearance, string]> = [
  ["age", "Adult age description"],
  ["gender", "Gender presentation"],
  ["skinTone", "Skin tone"],
  ["face", "Face"],
  ["eyes", "Eyes"],
  ["hair", "Hair"],
  ["build", "Build"],
  ["distinguishingMarks", "Distinguishing marks"],
  ["wardrobe", "Identity wardrobe"],
];
const personaFields: Array<[keyof Persona, string]> = [
  ["bio", "Biography"],
  ["tone", "Voice and tone"],
  ["audience", "Audience"],
  ["dos", "Do"],
  ["donts", "Avoid"],
];
export function CharacterWorkspace({ id }: { id: string }) {
  const query = useApi<CharacterDetail>(`/characters/${id}`);
  if (query.isPending) return <Loading />;
  if (!query.data)
    return (
      <QueryError error={query.error} retry={() => void query.refetch()} />
    );
  return <CharacterEditor key={id} character={query.data} />;
}
function CharacterEditor({ character }: { character: CharacterDetail }) {
  const current = {
    name: character.name,
    description: character.description,
    appearance: character.appearance,
    persona: character.persona,
    status: character.status,
  };
  const [edited, setDraft] = useState<typeof current | null>(null);
  const draft = edited ?? current;
  const [generationDraft, setGenerationDraft] =
    useState<ImageGenerationValue | null>(null);
  const [notes, setNotes] = useState("");
  const [role, setRole] = useState<DerivationRole>("sheet");
  const [spec, setSpec] = useState("");
  const [compare, setCompare] = useState<Asset | null>(null);
  const settings = useSettings();
  const jobs = useJobs(`characterId=${character.id}&limit=200`);
  const assets = useList<Asset>(
    `/assets?characterId=${character.id}&kind=image&limit=40`,
  );
  const save = useAction<Character>("Character saved");
  const generate = useAction<JobStarted>("Generation queued");
  const attach = useAction("Uploaded reference added");
  const requestedGeneration = generationDraft ?? {
    provider: settings.data?.defaults.imageProvider ?? "",
    model: settings.data?.defaults.imageModel ?? "",
    count: 1,
  };
  const provider = settings.data?.providers.find(
    (p) => p.id === requestedGeneration.provider,
  );
  const maxOutputs =
    provider?.models.find((model) => model.id === requestedGeneration.model)
      ?.maxOutputs ?? 1;
  const generation = {
    ...requestedGeneration,
    count: maxOutputs === 1 ? 1 : requestedGeneration.count,
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(current);
  const ready =
    !!provider?.available &&
    provider.models.some(
      (model) => model.kind === "image" && model.id === generation.model,
    );
  const blocked = !ready || dirty || save.isPending || generate.isPending;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim() || save.isPending) return;
    try {
      await save.mutateAsync({
        path: `/characters/${character.id}`,
        method: "PATCH",
        body: draft,
      });
      setDraft(null);
    } catch {
      /* Preserve draft. */
    }
  }
  async function run(derive: boolean) {
    if (blocked || (derive && !character.canonicalAssetId)) return;
    try {
      await generate.mutateAsync({
        path: `/characters/${character.id}/${derive ? "derivations" : "portraits"}`,
        generation: true,
        body: { ...generation, ...(derive ? { role, spec } : { notes }) },
      });
    } catch {
      /* Retry is explicit and retains the idempotency key. */
    }
  }
  async function uploaded(asset: Asset) {
    if (asset.kind !== "image") return;
    try {
      await attach.mutateAsync({
        path: `/characters/${character.id}/references`,
        body: {
          assetId: asset.id,
          role: "upload",
          approved: false,
          consentConfirmed: true,
        },
      });
    } catch {
      /* Source remains in the library if attachment fails. */
    }
  }
  return (
    <div className="page-stack">
      <PageHeader
        title={character.name}
        description="Identity, candidates and the visual anchor for every future shot."
        back={{ href: "/characters", label: "Characters" }}
        actions={
          <>
            <StatusBadge status={character.status} />
            <Badge variant="outline">
              Identity v{character.identityVersion}
            </Badge>
            <UploadDialog
              triggerLabel="Upload source photo"
              onUploaded={(asset) => void uploaded(asset)}
            />
          </>
        }
      />
      <QueryError error={attach.error} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="order-2 flex min-w-0 flex-col gap-5 lg:order-1">
          <section className="studio-panel">
            <h2 className="text-sm font-semibold">Character identity</h2>
            <form onSubmit={submit} className="flex flex-col gap-5">
              <FieldGroup>
                <TextField
                  label="Name"
                  required
                  value={draft.name}
                  onChange={(name) => setDraft({ ...draft, name })}
                  disabled={save.isPending}
                />
                <TextField
                  label="Visual direction"
                  value={draft.description}
                  multiline
                  onChange={(description) =>
                    setDraft({ ...draft, description })
                  }
                  disabled={save.isPending}
                />
              </FieldGroup>
              <Collapsible>
                <CollapsibleTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="w-full justify-between"
                    />
                  }
                >
                  Appearance
                  <Plus data-icon="inline-end" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <FieldGroup>
                    {appearanceFields.map(([key, label]) => (
                      <TextField
                        key={key}
                        label={label}
                        value={draft.appearance[key] ?? ""}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            appearance: { ...draft.appearance, [key]: value },
                          })
                        }
                        disabled={save.isPending}
                      />
                    ))}
                  </FieldGroup>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Changing appearance increments the identity version. The
                    canonical image remains the visual source of truth.
                  </p>
                </CollapsibleContent>
              </Collapsible>
              <Collapsible>
                <CollapsibleTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="w-full justify-between"
                    />
                  }
                >
                  Persona and copy
                  <Plus data-icon="inline-end" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <FieldGroup>
                    {personaFields.map(([key, label]) => (
                      <TextField
                        key={key}
                        label={label}
                        multiline
                        value={draft.persona[key] ?? ""}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            persona: { ...draft.persona, [key]: value },
                          })
                        }
                        disabled={save.isPending}
                      />
                    ))}
                  </FieldGroup>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Persona guides copy, not the face. Changes do not alter the
                    identity version.
                  </p>
                </CollapsibleContent>
              </Collapsible>
              <SelectField
                label="Status"
                value={draft.status}
                onChange={(status) =>
                  setDraft({ ...draft, status: status as Character["status"] })
                }
                options={[
                  { value: "draft", label: "Draft" },
                  ...(character.canonicalAssetId
                    ? [{ value: "active", label: "Active" }]
                    : []),
                  { value: "archived", label: "Archived" },
                ]}
                disabled={save.isPending}
              />
              <QueryError error={save.error} />
              <Button
                type="submit"
                disabled={save.isPending || !dirty || !draft.name.trim()}
              >
                {save.isPending ? "Saving…" : "Save character"}
              </Button>
            </form>
          </section>
          <section className="studio-panel">
            <h2 className="text-sm font-semibold">Generate candidates</h2>
            <ImageGenerationControls
              value={generation}
              onChange={setGenerationDraft}
              disabled={generate.isPending}
            />
            <FieldGroup>
              <TextField
                label="Portrait direction"
                multiline
                value={notes}
                onChange={setNotes}
                disabled={generate.isPending}
                placeholder="Pose, expression and framing for these candidates."
              />
            </FieldGroup>
            {dirty && (
              <Alert role="note">
                <AlertDescription>
                  Save your identity edits before generating.
                </AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">
              Sends your prompt, without reference images, to{" "}
              {generation.provider === "codex"
                ? "chatgpt.com under your account"
                : provider?.label || "the selected provider"}
              . Uses account quota or provider credits.
            </p>
            <Button disabled={blocked} onClick={() => void run(false)}>
              <Sparkles data-icon="inline-start" />
              {generate.isPending
                ? "Submitting…"
                : maxOutputs === 1
                  ? "New candidate"
                  : "Generate portraits"}
            </Button>
            <Collapsible>
              <CollapsibleTrigger
                render={<Button variant="outline" className="w-full" />}
              >
                Derive from canonical
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-4 pt-4">
                <FieldGroup>
                  <SelectField
                    label="Reference type"
                    value={role}
                    onChange={(value) => setRole(value as DerivationRole)}
                    options={[
                      { value: "sheet", label: "Reference sheet" },
                      { value: "angle", label: "Face angle" },
                      { value: "expression", label: "Expression" },
                    ]}
                    disabled={generate.isPending}
                  />
                  <TextField
                    label="Derivation direction"
                    value={spec}
                    onChange={setSpec}
                    multiline
                    disabled={generate.isPending}
                    placeholder="Specify the angles, expressions or sheet layout."
                  />
                </FieldGroup>
                <p className="text-xs text-muted-foreground">
                  Sends your prompt and the clean canonical image to the selected
                  provider. New results need explicit approval before use as references.
                </p>
                <Button
                  disabled={blocked || !character.canonicalAssetId}
                  onClick={() => void run(true)}
                >
                  {generate.isPending
                    ? "Submitting…"
                    : maxOutputs === 1
                      ? "New candidate"
                      : `Generate ${role}`}
                </Button>
                {!character.canonicalAssetId && (
                  <p className="text-xs text-muted-foreground">
                    Choose a canonical image first.
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
            <QueryError error={generate.error} />
          </section>
        </aside>
        <section className="order-1 flex min-w-0 flex-col gap-5 lg:order-2">
          <div className="2xl:hidden">
            <Anchor character={character} compare={compare} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">
              Portraits and references
            </h2>
            <Badge variant="secondary">
              {assets.items.length}
              {assets.hasNextPage ? "+" : ""}
            </Badge>
          </div>
          <QueryError error={jobs.error} retry={() => void jobs.refetch()} />
          {jobs.data?.items
            .filter(
              (job) =>
                isActiveJob(job) ||
                ["failed", "needs_attention"].includes(job.status),
            )
            .slice(0, 4)
            .map((job) => (
              <JobNotice key={job.id} job={job} />
            ))}
          {assets.isPending && <Loading />}
          <QueryError
            error={assets.error}
            retry={() => void assets.refetch()}
          />
          {!assets.isPending && !assets.error && !assets.items.length && (
            <EmptyState
              title="No candidates yet"
              description="Upload an authorized source photo, or generate a portrait. Review a candidate before making it canonical."
            />
          )}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
            {assets.items.map((asset) => (
              <CharacterCandidate
                key={asset.id}
                asset={asset}
                character={character}
                onCompare={() => setCompare(asset)}
              />
            ))}
          </div>
          {assets.hasNextPage && (
            <Button
              variant="outline"
              disabled={assets.isFetchingNextPage}
              onClick={() => void assets.fetchNextPage()}
            >
              Load more candidates
            </Button>
          )}
          <CharacterReferences character={character} />
        </section>
        <aside className="order-3 hidden min-w-0 2xl:block">
          <Anchor character={character} compare={compare} />
        </aside>
      </div>
      <Dialog
        open={!!compare}
        onOpenChange={(open) => {
          if (!open) setCompare(null);
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Compare with the canonical identity</DialogTitle>
            <DialogDescription>
              Current identity v{character.identityVersion}. Comparing never
              approves or promotes a candidate.
            </DialogDescription>
          </DialogHeader>
          {compare && character.canonicalAssetId && (
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <figure className="min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={assetUrl(character.canonicalAssetId)}
                  alt="Canonical identity"
                  className="aspect-[3/4] max-h-[70dvh] w-full rounded-lg bg-muted object-contain"
                />
                <figcaption className="mt-2 text-sm">
                  Canonical identity
                </figcaption>
              </figure>
              <figure className="min-w-0">
                <AssetMedia
                  asset={compare}
                  className="aspect-[3/4] max-h-[70dvh] w-full rounded-lg object-contain"
                />
                <figcaption className="mt-2 text-sm">
                  Selected candidate
                </figcaption>
              </figure>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function JobNotice({ job }: { job: Job }) {
  const purposeLabels: Record<Job["purpose"], string> = {
    portrait: "Portrait generation",
    derivation: "Reference generation",
    still: "Still generation",
    video: "Video generation",
    copy: "Copy generation",
  };
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/jobs/${job.id}`} className="text-sm underline">
          {purposeLabels[job.purpose]}
        </Link>
        <StatusBadge status={job.status} />
      </div>
      {job.error && (
        <p className="text-xs text-destructive">{job.error.message}</p>
      )}
      <ModelFacts job={job} />
    </div>
  );
}
function Anchor({
  character,
  compare,
}: {
  character: Character;
  compare: Asset | null;
}) {
  return (
    <section className="studio-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Canonical identity</h2>
        <Badge variant="outline">v{character.identityVersion}</Badge>
      </div>
      {character.canonicalAssetId ? (
        <>
          <div className={compare ? "grid grid-cols-2 gap-2" : "min-w-0"}>
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl(character.canonicalAssetId)}
                alt={`${character.name}, canonical identity anchor`}
                className="max-h-[480px] w-full rounded-lg bg-muted object-contain"
              />
              <figcaption className="mt-2 text-xs text-muted-foreground">
                Canonical
              </figcaption>
            </figure>
            {compare && (
              <figure>
                <AssetMedia
                  asset={compare}
                  className="max-h-[480px] w-full rounded-lg object-contain"
                />
                <figcaption className="mt-2 text-xs text-muted-foreground">
                  Selected candidate
                </figcaption>
              </figure>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            This image leads every identity-based generation. Replacing it does
            not rewrite earlier jobs or shots.
          </p>
          <Link
            href={`/library?asset=${character.canonicalAssetId}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Open original in library
          </Link>
        </>
      ) : (
        <EmptyState
          title="No anchor selected"
          description="Review a candidate, then choose Make canonical. Uploading or generating never changes identity automatically."
        />
      )}
    </section>
  );
}
