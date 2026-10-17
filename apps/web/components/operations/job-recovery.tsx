"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Job,
  JobStarted,
  ResolveJobInput,
  Settings,
} from "@vibefield/contracts";
import { api, isActiveJob, useSettings } from "@/lib/api";
import { Loading, QueryError, TextField } from "@/components/studio";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { VideoBudget } from "./shared";

type RecoveryAction = ResolveJobInput["action"] | "cancel";
const actionLabels: Record<RecoveryAction, string> = {
  cancel: "Stop local work",
  mark_failed: "Mark failed",
  attach_provider_job: "Attach provider job",
  resume: "Resume polling / downloads",
  resubmit: "Submit new paid job",
};

function videoCapabilityIssue(job: Job, settings: Settings | undefined) {
  if (job.kind !== "video") return null;
  const model = settings?.providers
    .find((provider) => provider.id === job.provider)
    ?.models.find(
      (model) => model.id === job.modelRequested && model.kind === "video",
    );
  if (
    !job.request.startFrameAssetId ||
    model?.supportsStartFrame !== true ||
    !model.durations?.includes(job.request.params.durationSeconds ?? 0) ||
    !model.resolutions?.includes(job.request.params.resolution ?? "") ||
    !model.aspectRatios?.includes(job.request.aspectRatio)
  )
    return "This saved request lacks currently verified start-frame, duration, resolution or aspect-ratio support. Create a compatible request from its workspace instead.";
  if (job.request.params.generateAudio && model.supportsAudio !== true)
    return "This saved request asks for audio, but the model does not have verified audio support.";
  return null;
}

export function JobRecovery({ job }: { job: Job }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const settings = useSettings();
  const [action, setAction] = useState<RecoveryAction | null>(null);
  const [providerJobId, setProviderJobId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const paidKey = useRef<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const cancelButton = useRef<HTMLButtonElement | null>(null);
  const fallback = useRef<HTMLDivElement | null>(null);
  const confirmationId = useId();
  const resolvable = ["needs_attention", "failed", "cancelled"].includes(
    job.status,
  );
  const resumable = resolvable && Boolean(job.providerJobId || job.result);
  const provider = settings.data?.providers.find(
    (item) => item.id === job.provider,
  );
  const modelAvailable = provider?.models.some(
    (model) => model.id === job.modelRequested && model.kind === job.kind,
  );
  const budget = settings.data?.videoBudget;
  const canAttach =
    resolvable &&
    job.provider === "openrouter" &&
    job.kind === "video" &&
    Boolean(
      budget?.submissions.some((submission) => submission.jobId === job.id),
    );
  const paidBlocked = !resolvable
    ? "This job is no longer eligible for recovery. Refresh its status."
    : !settings.data || settings.error
      ? "Load current provider and budget information before submitting."
      : !provider?.available
        ? provider?.reason ||
          "This provider is unavailable. Configure it in the API process."
        : !modelAvailable
          ? "The requested model is not in the current provider catalog. Create a new request from its workspace instead."
          : videoCapabilityIssue(job, settings.data)
            ? videoCapabilityIssue(job, settings.data)
            : job.kind === "video" && !budget?.enabled
              ? "External video generation is disabled in the API configuration."
              : job.kind === "video" && !budget?.remaining
                ? "The persisted video submission budget is exhausted."
                : null;

  const mutation = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: async (selected: RecoveryAction) => {
      if (
        selected === "resubmit" &&
        (paidBlocked || !confirmed || !paidKey.current)
      )
        throw new Error(
          paidBlocked || "Confirm the new paid submission first.",
        );
      if (selected === "resubmit") {
        const fresh = await api<Settings>("/settings");
        const currentProvider = fresh.providers.find(
          (provider) => provider.id === job.provider,
        );
        if (!currentProvider?.available || !currentProvider.configured)
          throw new Error(
            currentProvider?.reason || "The provider is unavailable.",
          );
        const unsupported = videoCapabilityIssue(job, fresh);
        if (unsupported) throw new Error(unsupported);
        if (
          job.kind === "video" &&
          (!fresh.videoBudget.enabled || fresh.videoBudget.remaining < 1)
        )
          throw new Error(
            "Video is disabled or the current submission budget is exhausted.",
          );
      }
      const body: ResolveJobInput | Record<string, never> =
        selected === "cancel"
          ? {}
          : {
              action: selected,
              ...(selected === "attach_provider_job"
                ? { providerJobId: providerJobId.trim() }
                : {}),
              ...(selected === "resubmit" && job.kind === "video"
                ? { confirmExternal: true }
                : {}),
            };
      const result = await api<Job | JobStarted>(
        `/jobs/${job.id}/${selected === "cancel" ? "cancel" : "resolve"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Retained on failure, including a lost response, so a deliberate retry cannot pay twice.
            ...(selected === "resubmit"
              ? { "Idempotency-Key": paidKey.current! }
              : {}),
          },
          body: JSON.stringify(body),
        },
      );
      const target = "jobId" in result ? result.jobId : result.id;
      await api<Job>(`/jobs/${target}`);
      return { target, selected };
    },
    onSuccess: async ({ target, selected }) => {
      await queryClient.invalidateQueries();
      toast.add({
        type: "success",
        title: selected === "resubmit" ? "New job created" : "Job updated",
      });
      if (selected === "resubmit") paidKey.current = null;
      setAction(null);
      setConfirmed(false);
      if (target !== job.id) router.push(`/jobs/${target}`);
    },
  });

  function open(selected: RecoveryAction, button: HTMLButtonElement) {
    opener.current = button;
    mutation.reset();
    setConfirmed(false);
    setAction(selected);
    if (selected === "resubmit") {
      paidKey.current ??= crypto.randomUUID();
      void settings.refetch();
    }
  }

  const validAction =
    action === "cancel"
      ? isActiveJob(job)
      : action === "attach_provider_job"
        ? canAttach &&
          Boolean(providerJobId.trim()) &&
          providerJobId.trim().length <= 1000
        : action === "resume"
          ? resumable
          : action === "resubmit"
            ? !paidBlocked && confirmed && !settings.isFetching
            : resolvable;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div ref={fallback} tabIndex={-1}>
            Recovery and control
          </div>
        </CardTitle>
        <CardDescription>
          Recovery never starts another generation unless you explicitly choose
          a new paid job.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {job.status === "needs_attention" && (
          <Alert variant="destructive">
            <AlertTitle>Submission or completion is uncertain</AlertTitle>
            <AlertDescription>
              The provider may already have charged for this request. Check the
              existing provider job before making a new paid submission.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          {isActiveJob(job) && (
            <Button
              variant="outline"
              onClick={(event) => open("cancel", event.currentTarget)}
            >
              {job.status === "queued"
                ? "Cancel queued job"
                : "Stop local work"}
            </Button>
          )}
          {resolvable && (
            <>
              <Button
                variant="outline"
                disabled={!resumable}
                onClick={(event) => open("resume", event.currentTarget)}
              >
                Resume polling / downloads
              </Button>
              <Button
                variant="outline"
                disabled={!canAttach}
                onClick={(event) =>
                  open("attach_provider_job", event.currentTarget)
                }
              >
                Attach provider job
              </Button>
              <Button
                variant="outline"
                disabled={job.status === "failed"}
                onClick={(event) => open("mark_failed", event.currentTarget)}
              >
                Mark failed
              </Button>
              <Button
                onClick={(event) => open("resubmit", event.currentTarget)}
              >
                New paid resubmission…
              </Button>
            </>
          )}
        </div>
        {resolvable && (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            {!resumable && (
              <p>
                Resume requires an acknowledged provider job ID or saved output
                handles.
              </p>
            )}
            {!canAttach && (
              <p>
                Attaching an ID is supported only for OpenRouter video with a
                recorded submission attempt. No arbitrary output URLs are
                accepted.
              </p>
            )}
            <p>
              Marking failed preserves the original request and submission
              ledger. It does not cancel the upstream job.
            </p>
          </div>
        )}
        {!resolvable && !isActiveJob(job) && (
          <p className="text-sm text-muted-foreground">
            This job is complete. Start a new generation from its linked
            workspace if you need another result.
          </p>
        )}
        <Dialog
          open={action !== null}
          onOpenChange={(next, details) => {
            if (mutation.isPending) {
              details.cancel();
              return;
            }
            if (!next) setAction(null);
          }}
        >
          <DialogContent
            showCloseButton={!mutation.isPending}
            className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"
            initialFocus={cancelButton}
            finalFocus={() =>
              opener.current?.isConnected && !opener.current.disabled
                ? opener.current
                : fallback.current
            }
          >
            <DialogHeader>
              <DialogTitle>
                {action ? actionLabels[action] : "Job recovery"}
              </DialogTitle>
              <DialogDescription>
                {action === "resubmit"
                  ? "Creates a new job with the original immutable request and a new idempotency key. The old job and its submission remain unchanged."
                  : "This operation does not make a new paid generation request."}
              </DialogDescription>
            </DialogHeader>
            {action === "resubmit" && (
              <div className="flex flex-col gap-4">
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd className="break-all">{job.provider}</dd>
                  <dt className="text-muted-foreground">Requested model</dt>
                  <dd className="break-all">{job.modelRequested}</dd>
                  <dt className="text-muted-foreground">Outputs requested</dt>
                  <dd>{job.request.count}</dd>
                  <dt className="text-muted-foreground">References sent</dt>
                  <dd>{job.request.refAssetIds.length}</dd>
                  {job.request.startFrameAssetId && (
                    <>
                      <dt className="text-muted-foreground">Start frame</dt>
                      <dd className="break-all font-mono text-xs">
                        {job.request.startFrameAssetId}
                      </dd>
                    </>
                  )}
                </dl>
                <p className="text-sm text-muted-foreground">
                  Sends the saved prompt and attached reference images to{" "}
                  {job.provider === "codex"
                    ? "chatgpt.com under your account"
                    : job.provider === "openrouter"
                      ? "OpenRouter and its model provider"
                      : job.provider}
                  . This can spend money or account quota again, even if the
                  previous result already exists.
                </p>
                {settings.isFetching && <Loading />}
                {settings.error && (
                  <QueryError
                    error={settings.error}
                    retry={() => void settings.refetch()}
                  />
                )}
                {budget && <VideoBudget budget={budget} />}
                {job.kind === "video" && budget && (
                  <p className="text-sm">
                    This action uses one remaining video submission if admitted
                    by the worker. The server rechecks the budget before
                    submitting.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Changed identity or start-frame requirements can block reuse
                  of this snapshot. Nothing is silently replaced. No automatic
                  retry will occur.
                </p>
                {paidBlocked && (
                  <Alert variant="destructive">
                    <AlertTitle>Submission unavailable</AlertTitle>
                    <AlertDescription>{paidBlocked}</AlertDescription>
                  </Alert>
                )}
                <FieldGroup>
                  <Field
                    orientation="horizontal"
                    data-disabled={mutation.isPending}
                  >
                    <Checkbox
                      id={confirmationId}
                      checked={confirmed}
                      onCheckedChange={setConfirmed}
                      disabled={mutation.isPending || Boolean(paidBlocked)}
                    />
                    <FieldLabel htmlFor={confirmationId}>
                      I authorize a new paid generation and understand the
                      previous attempt may already have been charged.
                    </FieldLabel>
                  </Field>
                </FieldGroup>
              </div>
            )}
            {action === "attach_provider_job" && (
              <FieldGroup>
                <TextField
                  label="Verified provider job ID"
                  value={providerJobId}
                  onChange={setProviderJobId}
                  placeholder="ID from the existing OpenRouter video request"
                  required
                  disabled={mutation.isPending}
                />
                <p className="text-sm text-muted-foreground">
                  The API verifies this ID with the provider before accepting
                  it, then resumes saved outputs. Verification can take several
                  minutes. Do not paste an API key or a URL.
                </p>
              </FieldGroup>
            )}
            {action === "resume" && (
              <p className="text-sm">
                Only polling the acknowledged provider job or downloading saved
                outputs will resume. No new submission is made, and the budget
                is unchanged.
              </p>
            )}
            {action === "mark_failed" && (
              <p className="text-sm">
                The local job will be marked failed. The original request, audit
                history, outputs and submission count are preserved. Any
                upstream work may continue.
              </p>
            )}
            {action === "cancel" && (
              <p className="text-sm">
                {job.status === "queued"
                  ? "Cancels the job without a paid call if it is still queued when the API handles this action. If submission has already started, only local work stops."
                  : "Stops local polling or processing. The upstream generation may continue and may still be charged. This is not an upstream cancellation or a refund."}
              </p>
            )}
            {mutation.error && (
              <>
                <QueryError error={mutation.error} />
                <p className="text-xs text-muted-foreground">
                  The dialog and your inputs are preserved. A lost response does
                  not prove the action failed. Check Jobs before starting a
                  separate request; retrying here keeps the same paid
                  idempotency key.
                </p>
              </>
            )}
            <DialogFooter>
              <DialogClose
                render={
                  <Button
                    variant="outline"
                    ref={cancelButton}
                    disabled={mutation.isPending}
                  />
                }
              >
                Back
              </DialogClose>
              <Button
                variant={
                  action === "mark_failed" || action === "cancel"
                    ? "destructive"
                    : "default"
                }
                className="h-auto min-h-8 whitespace-normal"
                disabled={mutation.isPending || !validAction}
                onClick={() => {
                  if (action) mutation.mutate(action);
                }}
              >
                {mutation.isPending
                  ? "Working…"
                  : action
                    ? actionLabels[action]
                    : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
