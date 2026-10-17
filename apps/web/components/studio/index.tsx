"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { CompiledRequest, Job } from "@vibefield/contracts";
import { ApiError, thumbUrl, useSettings } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
export {
  AssetMedia,
  AssetPicker,
  UploadDialog,
  AssetDetailDialog,
} from "./media";
export { ReviewDialog } from "./review";

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="flex min-w-0 flex-col gap-4">
      <div>
        {back && (
          <Link
            href={back.href}
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "-ml-2 mb-3",
            })}
          >
            <ArrowLeft data-icon="inline-start" />
            {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              tabIndex={-1}
              className="text-2xl font-semibold tracking-tight sm:text-[28px] break-words"
            >
              {title}
            </h1>
            {description && (
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex max-w-full flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Empty className="min-h-48 border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}
export function QueryError({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  const issues =
    error instanceof ApiError && Array.isArray(error.details)
      ? error.details.flatMap((item: unknown) => {
          if (
            item &&
            typeof item === "object" &&
            "message" in item &&
            typeof item.message === "string"
          ) {
            const path =
              "path" in item && Array.isArray(item.path)
                ? item.path.join(".")
                : "";
            return [`${path ? `${path}: ` : ""}${item.message}`];
          }
          return [];
        })
      : [];
  return (
    <Alert variant="destructive">
      <AlertTitle>
        {error instanceof ApiError
          ? error.code.replaceAll("_", " ").toLowerCase()
          : "Could not complete this action"}
      </AlertTitle>
      <AlertDescription>
        <p className="break-words">
          {error instanceof Error
            ? error.message
            : "An unexpected error occurred. Retry this action."}
        </p>
        {issues.length > 0 && (
          <ul className="list-inside list-disc">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        )}
        {retry && (
          <Button onClick={retry} variant="outline" size="sm">
            <RefreshCw data-icon="inline-start" />
            Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
export function Loading() {
  return (
    <div aria-label="Loading" role="status" className="flex flex-col gap-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-24 w-full" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        ["failed", "rejected", "needs_attention"].includes(status)
          ? "destructive"
          : ["active", "approved", "succeeded", "done"].includes(status)
            ? "default"
            : "secondary"
      }
    >
      {status.replaceAll("_", " ")}
    </Badge>
  );
}
export function TextField({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
  required,
  disabled,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  type?: string;
}) {
  const id = useId();
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </FieldLabel>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className="min-h-24 resize-y"
        />
      ) : (
        <Input
          id={id}
          value={value}
          type={type}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
        />
      )}
    </Field>
  );
}
export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
  description,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  description?: string;
}) {
  const id = useId();
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value || null}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        items={options}
        disabled={disabled || options.length === 0}
      >
        <SelectTrigger id={id} className="w-full min-w-0 max-w-full">
          <SelectValue
            className="min-w-0 truncate"
            placeholder={options.length ? "Choose…" : "No options available"}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="**:data-[slot=select-item-text]:whitespace-normal"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
}
export function PartialResultWarning({ job }: { job: Job }) {
  const result =
    job.result && typeof job.result === "object"
      ? (job.result as Record<string, unknown>)
      : null;
  const metadata =
    result?.metadata && typeof result.metadata === "object"
      ? (result.metadata as Record<string, unknown>)
      : null;
  const requested = metadata?.requestedCount;
  const returned = metadata?.returnedCount;
  if (
    typeof requested !== "number" ||
    typeof returned !== "number" ||
    requested === returned
  )
    return null;
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} className="w-fit" />}>
        <Badge variant="outline">
          {returned} of {requested} returned
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        Provider returned {returned < requested ? "fewer" : "more"} images than
        requested. No extra request was made.
      </TooltipContent>
    </Tooltip>
  );
}
export function ModelFacts({ job }: { job: Job }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      <p className="break-words">Requested {job.modelRequested}</p>
      <PartialResultWarning job={job} />
      <p className="break-words">
        {job.modelReported
          ? `Provider reported ${job.modelReported}`
          : "Model not reported by provider. Execution unverified."}
      </p>
    </div>
  );
}
export type ImageGenerationValue = {
  provider: string;
  model: string;
  count: number;
};
export function ImageGenerationControls({
  value,
  onChange,
  disabled,
}: {
  value: ImageGenerationValue;
  onChange: (value: ImageGenerationValue) => void;
  disabled?: boolean;
}) {
  const settings = useSettings();
  const providers =
    settings.data?.providers.filter((provider) =>
      provider.kinds.includes("image"),
    ) ?? [];
  const provider = providers.find((provider) => provider.id === value.provider);
  const capability = provider?.models.find(
    (model) => model.id === value.model && model.kind === "image",
  );
  const maxOutputs = capability?.maxOutputs ?? 1;
  return (
    <FieldGroup>
      <SelectField
        label="Image provider"
        value={value.provider}
        options={providers.map((p) => ({ value: p.id, label: p.label }))}
        disabled={disabled}
        onChange={(id) =>
          onChange({
            ...value,
            count: 1,
            provider: id,
            model:
              providers
                .find((p) => p.id === id)
                ?.models.find((m) => m.kind === "image")?.id ?? "",
          })
        }
      />
      <SelectField
        label="Requested model"
        value={value.model}
        options={(provider?.models ?? [])
          .filter((m) => m.kind === "image")
          .map((m) => ({ value: m.id, label: m.label }))}
        disabled={disabled}
        onChange={(model) => onChange({ ...value, model, count: 1 })}
      />
      {maxOutputs > 1 && (
        <SelectField
          label="Candidates"
          value={String(value.count)}
          options={Array.from(
            { length: maxOutputs },
            (_, index) => index + 1,
          ).map((n) => ({
            value: String(n),
            label: `${n} ${n === 1 ? "candidate" : "candidates"}`,
          }))}
          disabled={disabled}
          onChange={(count) => onChange({ ...value, count: Number(count) })}
        />
      )}
      {provider?.id === "codex" && maxOutputs === 1 && (
        <p className="text-xs text-muted-foreground">
          Codex returns one image per request. Each New candidate is a separate
          request on your account.
        </p>
      )}
      {settings.error && (
        <QueryError
          error={settings.error}
          retry={() => void settings.refetch()}
        />
      )}
      {provider && !provider.available && (
        <p className="text-xs text-muted-foreground">
          {provider.reason || "This provider is unavailable."}{" "}
          <Link className="underline" href="/settings">
            Settings
          </Link>
        </p>
      )}
      {provider?.id === "codex" && (
        <p className="text-xs text-muted-foreground">
          Experimental Codex images. Uses your ChatGPT account through an
          unofficial endpoint. Quality, output dimensions and executed model are
          not enforced by these controls.
        </p>
      )}
    </FieldGroup>
  );
}
export function RequestPreview({ request }: { request: CompiledRequest }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{request.provider}</Badge>
        <Badge variant="outline">{request.model}</Badge>
        {request.identityVersion !== null && (
          <Badge variant="secondary">Identity v{request.identityVersion}</Badge>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Ordered reference inputs</h3>
        {request.referenceRoles.length ? (
          <ol className="flex flex-col gap-3">
            {request.referenceRoles.map((ref, index) => (
              <li
                key={`${index}-${ref.assetId}`}
                className="flex min-w-0 items-start gap-3"
              >
                <span className="pt-1 text-xs text-muted-foreground">
                  {index + 1}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbUrl(ref.assetId, 256)}
                  alt={`${ref.role} reference`}
                  className="size-14 shrink-0 rounded-md bg-muted object-cover"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {ref.role.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs break-words text-muted-foreground">
                    {ref.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-muted-foreground">
            No images attached to this request.
          </p>
        )}
      </div>
      {request.warnings.map((warning, i) => (
        <Alert key={i} role="note">
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}
      {request.droppedRefAssetIds.length > 0 && (
        <Alert role="note">
          <AlertTitle>References excluded by the provider limit</AlertTitle>
          <AlertDescription className="break-all">
            {request.droppedRefAssetIds.join(", ")}
          </AlertDescription>
        </Alert>
      )}
      <Collapsible>
        <CollapsibleTrigger
          render={<Button variant="outline" className="w-full" />}
        >
          Read compiled prompt
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-words">
            {request.prompt}
          </pre>
          {request.negativePrompt && (
            <p className="mt-3 text-xs whitespace-pre-wrap">
              Avoid: {request.negativePrompt}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Aspect requested: {request.aspectRatio}. Output count:{" "}
            {request.count}. These are request parameters, not guarantees.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
