"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  PatchSettingsInput,
  ProviderModel,
  ProviderStatus,
  Settings,
} from "@vibefield/contracts";
import { RefreshCw } from "lucide-react";
import { useAction, useSettings } from "@/lib/api";
import {
  EmptyState,
  Loading,
  PageHeader,
  QueryError,
  SelectField,
  TextField,
} from "@/components/studio";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Timestamp, VideoBudget } from "./shared";

type Defaults = Settings["defaults"];
const defaultKeys = {
  imageProvider: "defaultImageProvider",
  imageModel: "defaultImageModel",
  videoModel: "defaultVideoModel",
  textModel: "defaultTextModel",
} as const;

function modelOptions(models: ProviderModel[], current: string) {
  const choices = [
    ...new Map(
      models.map((model) => [
        model.id,
        { value: model.id, label: `${model.label} · ${model.id}` },
      ]),
    ).values(),
  ];
  if (!current)
    choices.unshift({ value: "", label: "Choose a discovered model" });
  else if (!choices.some((choice) => choice.value === current))
    choices.unshift({
      value: current,
      label: `${current} · stored, not in current catalog`,
    });
  return choices;
}

function DefaultsForm({ settings }: { settings: Settings }) {
  const save = useAction<Settings>("Generation defaults saved");
  const [draft, setDraft] = useState<Partial<Defaults>>({});
  const shown = { ...settings.defaults, ...draft };
  const imageProviders = settings.providers.filter((provider) =>
    provider.kinds.includes("image"),
  );
  const imageModels =
    imageProviders
      .find((provider) => provider.id === shown.imageProvider)
      ?.models.filter((model) => model.kind === "image") ?? [];
  const videoModels = settings.providers.flatMap((provider) =>
    provider.models.filter((model) => model.kind === "video"),
  );
  const textModels = settings.providers.flatMap((provider) =>
    provider.models.filter((model) => model.kind === "text"),
  );
  const changes = Object.entries(draft).filter(
    ([key, value]) => value !== settings.defaults[key as keyof Defaults],
  );
  const body = Object.fromEntries(
    changes.map(([key, value]) => [defaultKeys[key as keyof Defaults], value]),
  ) as PatchSettingsInput;
  const changed = changes.length > 0;
  const invalid = changes.some(
    ([key, value]) =>
      !value ||
      (key === "imageProvider"
        ? !imageProviders.some((provider) => provider.id === value)
        : !(
            key === "imageModel"
              ? imageModels
              : key === "videoModel"
                ? videoModels
                : textModels
          ).some((model) => model.id === value)),
  );
  const providerChoices = imageProviders.map((provider) => ({
    value: provider.id,
    label: provider.label,
  }));
  if (!providerChoices.some((choice) => choice.value === shown.imageProvider))
    providerChoices.unshift({
      value: shown.imageProvider,
      label: `${shown.imageProvider || "Choose a provider"} · stored`,
    });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed || invalid || save.isPending) return;
    try {
      await save.mutateAsync({ path: "/settings", method: "PATCH", body });
      setDraft({});
    } catch {
      /* useAction keeps the failure visible; preserve the draft. */
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generation defaults</CardTitle>
        <CardDescription>
          Used by future requests only. Existing job snapshots never change.
          Saving does not generate anything.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField
              label="Image provider"
              value={shown.imageProvider}
              options={providerChoices}
              disabled={save.isPending || !imageProviders.length}
              onChange={(imageProvider) =>
                setDraft((previous) => ({
                  ...previous,
                  imageProvider,
                  imageModel: "",
                }))
              }
            />
            <SelectField
              label="Image model"
              value={shown.imageModel}
              options={modelOptions(imageModels, shown.imageModel)}
              disabled={save.isPending || !imageModels.length}
              onChange={(imageModel) =>
                setDraft((previous) => ({ ...previous, imageModel }))
              }
            />
            <SelectField
              label="Video model"
              value={shown.videoModel}
              options={modelOptions(videoModels, shown.videoModel)}
              disabled={save.isPending || !videoModels.length}
              onChange={(videoModel) =>
                setDraft((previous) => ({ ...previous, videoModel }))
              }
              description={
                !videoModels.length
                  ? "No video models were discovered. Check provider status below."
                  : "Uses the current provider capability catalog."
              }
            />
            <SelectField
              label="Text model"
              value={shown.textModel}
              options={modelOptions(textModels, shown.textModel)}
              disabled={save.isPending || !textModels.length}
              onChange={(textModel) =>
                setDraft((previous) => ({ ...previous, textModel }))
              }
            />
          </FieldGroup>
          {invalid && (
            <p role="alert" className="text-sm text-destructive">
              Choose a discovered model for every changed default before saving.
            </p>
          )}
          {save.error && <QueryError error={save.error} />}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={!changed || invalid || save.isPending}
            >
              {save.isPending ? "Saving defaults…" : "Save generation defaults"}
            </Button>
            {changed && (
              <Button
                variant="ghost"
                disabled={save.isPending}
                onClick={() => setDraft({})}
              >
                Discard changes
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ProviderCard({ provider }: { provider: ProviderStatus }) {
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(30);
  const [kind, setKind] = useState("");
  const models = provider.models.filter(
    (model) =>
      (!kind || model.kind === kind) &&
      `${model.id} ${model.label}`.toLowerCase().includes(search.toLowerCase()),
  );
  const safeDocs = /^https:\/\//.test(provider.docsUrl);
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{provider.label}</CardTitle>
        <CardDescription>{provider.kinds.join(" · ")}</CardDescription>
        <CardAction>
          <Badge variant={provider.available ? "secondary" : "outline"}>
            {provider.available
              ? "Available"
              : provider.configured
                ? "Unavailable"
                : "Not configured"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Credentials{" "}
          {provider.configured
            ? "configured in the API process"
            : "not configured"}
          . Availability is reported by the API, not inferred from a model name.
        </p>
        {provider.reason && (
          <Alert role="note">
            <AlertTitle>Provider status</AlertTitle>
            <AlertDescription>{provider.reason}</AlertDescription>
          </Alert>
        )}
        {provider.warnings.length > 0 && (
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
            {provider.warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        )}
        <details className="min-w-0 rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
            Discovered models · {provider.models.length}
          </summary>
          <div className="mt-4 flex min-w-0 flex-col gap-4">
            <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                label={`Search ${provider.label} models`}
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setVisible(30);
                }}
                placeholder="Model name or ID"
              />
              <SelectField
                label="Model kind"
                value={kind}
                onChange={(value) => {
                  setKind(value);
                  setVisible(30);
                }}
                options={[
                  { value: "", label: "All kinds" },
                  ...provider.kinds.map((value) => ({ value, label: value })),
                ]}
              />
            </FieldGroup>
            {models.length ? (
              <ul className="flex min-w-0 flex-col gap-3">
                {models.slice(0, visible).map((model) => (
                  <li
                    key={`${model.kind}-${model.id}`}
                    className="flex min-w-0 flex-col gap-1 rounded-lg border p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-words font-medium">
                        {model.label}
                      </span>
                      <Badge variant="outline">{model.kind}</Badge>
                    </div>
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      {model.id}
                    </p>
                    <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
                      {model.kind !== "text" && (
                        <>
                          <dt className="text-muted-foreground">
                            Reference limit
                          </dt>
                          <dd>{model.maxReferences ?? "Not reported"}</dd>
                        </>
                      )}
                      {model.kind === "video" && (
                        <>
                          <dt className="text-muted-foreground">Start frame</dt>
                          <dd>
                            {model.supportsStartFrame === undefined
                              ? "Not reported"
                              : model.supportsStartFrame
                                ? "Supported"
                                : "Not supported"}
                          </dd>
                          <dt className="text-muted-foreground">Durations</dt>
                          <dd>
                            {model.durations?.length
                              ? `${model.durations.join(", ")} seconds`
                              : "Not reported"}
                          </dd>
                          <dt className="text-muted-foreground">Resolutions</dt>
                          <dd className="break-words">
                            {model.resolutions?.join(", ") || "Not reported"}
                          </dd>
                        </>
                      )}
                      {model.kind !== "text" && (
                        <>
                          <dt className="text-muted-foreground">
                            Aspect ratios
                          </dt>
                          <dd className="break-words">
                            {model.aspectRatios?.join(", ") || "Not reported"}
                          </dd>
                        </>
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {provider.models.length
                  ? "No models match these filters."
                  : "No models are available in the current catalog."}
              </p>
            )}
            {models.length > visible && (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => setVisible((value) => value + 30)}
              >
                Show more models
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Capabilities describe accepted requests, not guaranteed output
              quality, dimensions or identity consistency. Unknown support is
              shown as not reported.
            </p>
          </div>
        </details>
        {safeDocs && (
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              className: "self-start",
            })}
          >
            Provider documentation
          </a>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsView() {
  const query = useSettings();
  const settings = query.data;
  return (
    <div className="page-stack">
      <PageHeader
        title="Settings"
        description="Provider availability, model defaults and the persisted video budget."
        actions={
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw data-icon="inline-start" />
            Refresh status
          </Button>
        }
      />
      {query.isPending && <Loading />}
      {query.error && (
        <QueryError error={query.error} retry={() => void query.refetch()} />
      )}
      {settings && (
        <>
          <VideoBudget budget={settings.videoBudget} />
          <DefaultsForm settings={settings} />
          <section
            className="flex min-w-0 flex-col gap-4"
            aria-labelledby="providers-title"
          >
            <h2 id="providers-title" className="text-lg font-medium">
              Providers
            </h2>
            {settings.providers.length ? (
              <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-2">
                {settings.providers.map((provider) => (
                  <ProviderCard key={provider.id} provider={provider} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No providers reported"
                description="Manual character, campaign and library work remains available offline."
              />
            )}
          </section>
          <Card>
            <CardHeader>
              <CardTitle>Configure the API process</CardTitle>
              <CardDescription>
                Never enter credentials in this browser. VibeField does not log
                in, refresh credentials or search for auth files.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <p>
                For Codex images, run{" "}
                <code className="font-mono">codex login</code> outside
                VibeField, then explicitly select its existing auth file with{" "}
                <code className="break-all font-mono">
                  VIBEFIELD_CODEX_AUTH_FILE
                </code>{" "}
                in the API environment. Opt in with{" "}
                <code className="break-all font-mono">
                  VIBEFIELD_EXPERIMENTAL_CODEX_IMAGES=1
                </code>
                .
              </p>
              <p className="text-muted-foreground">
                The Codex image adapter is unofficial, may break, uses your
                ChatGPT account quota, and may be disallowed by OpenAI&apos;s
                terms. Its requested model is not proof of the executed model.
              </p>
              <p>
                For OpenRouter, supply{" "}
                <code className="break-all font-mono">OPENROUTER_API_KEY</code>{" "}
                only to the API process. Explicitly allow video with{" "}
                <code className="break-all font-mono">
                  VIBEFIELD_ALLOW_VIDEO=1
                </code>
                . Set{" "}
                <code className="break-all font-mono">
                  VIBEFIELD_VIDEO_SUBMISSION_CAP
                </code>{" "}
                there to configure the cap. Restart the API after environment
                changes, then refresh this page.
              </p>
              <p className="text-muted-foreground">
                Do not pass provider credentials to Next.js, the CLI, a
                NEXT_PUBLIC variable, or a browser request. Model defaults are
                the only settings edited here. No public upload fallback is
                used.
              </p>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">
                  Local data directory
                </span>
                <code className="break-all font-mono">
                  {settings.storage.dataDir}
                </code>
              </div>
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Video submission ledger</CardTitle>
              <CardDescription>
                Persisted attempts, including rejected and unknown outcomes.
                Recovery does not remove entries.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {settings.videoBudget.submissions.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...settings.videoBudget.submissions]
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .map((submission) => (
                        <TableRow key={submission.id}>
                          <TableCell>
                            <Link
                              href={`/jobs/${submission.jobId}`}
                              className="font-mono text-xs underline underline-offset-4"
                            >
                              {submission.jobId}
                            </Link>
                          </TableCell>
                          <TableCell>{submission.provider}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {submission.outcome}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            <Timestamp value={submission.createdAt} />
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No video submissions have been recorded.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
