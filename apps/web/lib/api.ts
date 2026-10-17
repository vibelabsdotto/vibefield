"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { Job, Settings } from "@vibefield/contracts";
import { toast } from "@/components/ui/toast";

export interface List<T> {
  items: T[];
  nextCursor: string | null;
}
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Invalid API path");
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        ...(!(options.body instanceof FormData) && options.body
          ? { "Content-Type": "application/json" }
          : {}),
        "X-Vibefield-Actor": "web",
        ...options.headers,
      },
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new ApiError(
      "UNREACHABLE",
      "The local API could not be reached. Your inputs have been kept. Check that VibeField is running, then retry.",
      0,
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = body as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null;
    throw new ApiError(
      envelope?.error?.code ?? "HTTP_ERROR",
      envelope?.error?.message ??
        `Request failed with HTTP ${response.status}.`,
      response.status,
      envelope?.error?.details,
    );
  }
  return body as T;
}
export function useApi<T>(path: string | null) {
  return useQuery({
    queryKey: ["api", path],
    queryFn: ({ signal }) => api<T>(path!, { signal }),
    enabled: !!path,
    staleTime: 10_000,
    retry: false,
  });
}
export function useList<T>(path: string | null) {
  const query = useInfiniteQuery({
    queryKey: ["list", path],
    enabled: !!path,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api<List<T>>(
        `${path}${pageParam ? `${path!.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(pageParam)}` : ""}`,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 10_000,
    retry: false,
  });
  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
  };
}
export function useSettings() {
  return useApi<Settings>("/settings");
}
export function isActiveJob(job: Pick<Job, "status">) {
  return ["queued", "submitting", "running", "downloading"].includes(
    job.status,
  );
}
export function useJobs(query = "") {
  const client = useQueryClient();
  const previous = useRef<string | undefined>(undefined);
  const result = useQuery({
    queryKey: ["jobs", query],
    queryFn: ({ signal }) =>
      api<List<Job>>(
        `/jobs${query ? (query.startsWith("?") ? query : `?${query}`) : "?limit=200"}`,
        { signal },
      ),
    retry: false,
    staleTime: 1500,
    refetchInterval: (q) =>
      q.state.data?.items.some(isActiveJob) ? 1500 : false,
    refetchIntervalInBackground: false,
  });
  const signature = result.data?.items
    .map((job) => `${job.id}:${job.status}:${job.outputAssetIds.join(",")}`)
    .join("|");
  useEffect(() => {
    if (previous.current !== undefined && signature !== previous.current) {
      void client.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== "jobs",
      });
    }
    previous.current = signature;
  }, [signature, client]);
  return result;
}
export type ActionInput = {
  path: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  generation?: boolean;
  idempotencyKey?: string;
};
export function useAction<T = unknown>(successMessage?: string) {
  const client = useQueryClient();
  const attempts = useRef(new Map<string, string>());
  return useMutation<T, Error, ActionInput>({
    retry: false,
    mutationFn: async ({
      path,
      method = "POST",
      body = {},
      generation,
      idempotencyKey,
    }) => {
      const fingerprint = JSON.stringify([path, method, body]);
      let key = idempotencyKey;
      if (generation && !key) {
        key = attempts.current.get(fingerprint) ?? crypto.randomUUID();
        attempts.current.set(fingerprint, key);
      }
      const result = await api<T>(path, {
        method,
        body: body instanceof FormData ? body : JSON.stringify(body),
        headers: key ? { "Idempotency-Key": key } : undefined,
      });
      attempts.current.delete(fingerprint);
      return result;
    },
    onSuccess: async () => {
      await client.invalidateQueries();
      if (successMessage) toast.add({ title: successMessage, type: "success" });
    },
    onError: (error) =>
      toast.add({
        title: "Action not completed",
        description: error.message,
        type: "error",
      }),
  });
}
export const assetUrl = (id: string) =>
  `/api/v1/assets/${encodeURIComponent(id)}/content`;
export const thumbUrl = (id: string, width: 256 | 768 = 768) =>
  `/api/v1/assets/${encodeURIComponent(id)}/thumb?w=${width}`;
