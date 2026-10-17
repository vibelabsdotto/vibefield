// Server-only boundary. The browser never receives the API origin or credentials.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MiB = 1024 * 1024;
const JSON_LIMIT = 2 * MiB;
// The API enforces the 200 MiB file limit. Allow a bounded multipart envelope too.
const UPLOAD_LIMIT = 200 * MiB + MiB;
const MEDIA_LIMIT = 200 * MiB;
const CATALOG_LIMIT = 24 * MiB;
const EXPORT_LIMIT = 2 * 1024 * MiB;
const ERROR_LIMIT = 64 * 1024;
const TIMEOUT_MS = 5 * 60 * 1000;
const METHODS = new Set(["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"]);
const REQUEST_HEADERS = [
  "content-type",
  "range",
  "if-range",
  "idempotency-key",
];
const RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "content-disposition",
  "etag",
  "last-modified",
];
type Context = { params: Promise<{ path: string[] }> };

function safeHeaders() {
  return new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy":
      "default-src 'none'; frame-ancestors 'none'; sandbox",
  });
}

function failure(
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return Response.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status, headers: safeHeaders() },
  );
}

function port(value: string | undefined, fallback: string) {
  const result = value ?? fallback;
  if (!/^[1-9]\d{0,4}$/.test(result) || Number(result) > 65535)
    throw new Error("Invalid local port configuration");
  return result;
}

function configuration() {
  const apiPort = port(process.env.VIBEFIELD_API_PORT, "4317");
  const webPort = port(process.env.VIBEFIELD_WEB_PORT, "4318");
  const origin = process.env.VIBEFIELD_API_URL ?? `http://127.0.0.1:${apiPort}`;
  // Validate the literal string, not just URL.hostname, which normalizes alternate IP spellings.
  const withoutTrailingSlash = origin.endsWith("/")
    ? origin.slice(0, -1)
    : origin;
  const match = /^http:\/\/(127\.0\.0\.1|localhost):([1-9]\d{0,4})$/.exec(
    withoutTrailingSlash,
  );
  if (!match || Number(match[2]) > 65535)
    throw new Error("API URL must be an exact local origin");
  return {
    origin: withoutTrailingSlash,
    hosts: [`127.0.0.1:${webPort}`, `localhost:${webPort}`],
  };
}

function contentLength(headers: Headers): number | null {
  const value = headers.get("content-length");
  if (value === null) return null;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error("Invalid content length");
  return Number(value);
}

/** One chunk at a time, with backpressure, no whole-file buffering. */
function boundedStream(
  source: ReadableStream<Uint8Array>,
  limit: number,
  done: () => void,
  exceeded: () => void,
) {
  const reader = source.getReader();
  let bytes = 0;
  let finished = false;
  const finish = () => {
    if (!finished) {
      finished = true;
      done();
    }
  };
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            finish();
            controller.close();
            return;
          }
          bytes += chunk.value.byteLength;
          if (bytes > limit) {
            exceeded();
            void reader.cancel().catch(() => undefined);
            finish();
            controller.error(
              new Error("Stream exceeds the local transfer limit"),
            );
            return;
          }
          controller.enqueue(chunk.value);
        } catch {
          finish();
          controller.error(new Error("Local API transfer interrupted"));
        }
      },
      async cancel() {
        finish();
        try {
          await reader.cancel();
        } catch {
          /* Already aborted. */
        }
      },
    },
    { highWaterMark: 0 },
  );
}

async function safeUpstreamError(upstream: Response) {
  // Only the API's bounded, structured error envelope is allowed through. Never HTML or stack traces.
  if (
    !upstream.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json") ||
    !upstream.body
  ) {
    await upstream.body?.cancel();
    return failure(
      upstream.status,
      "API_REQUEST_FAILED",
      "The local API rejected this request.",
    );
  }
  const reader = upstream.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > ERROR_LIMIT) {
        await reader.cancel();
        return failure(
          502,
          "API_INVALID_RESPONSE",
          "The local API returned an invalid error response.",
        );
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof body !== "object" || body === null || !("error" in body))
      throw new Error();
    const error = body.error;
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      !("message" in error) ||
      typeof error.code !== "string" ||
      !/^[A-Z][A-Z0-9_]{0,99}$/.test(error.code) ||
      typeof error.message !== "string" ||
      error.message.length > 4000
    )
      throw new Error();
    // Validation details contain field paths/messages only, not arbitrary upstream objects.
    const details =
      error.code === "VALIDATION_ERROR" &&
      "details" in error &&
      Array.isArray(error.details)
        ? error.details.slice(0, 100).flatMap((item: unknown) => {
            if (
              !item ||
              typeof item !== "object" ||
              !("path" in item) ||
              !("message" in item) ||
              !Array.isArray(item.path) ||
              !item.path.every(
                (part) => typeof part === "string" || typeof part === "number",
              ) ||
              typeof item.message !== "string"
            )
              return [];
            return [
              {
                path: item.path.slice(0, 20),
                message: item.message.slice(0, 1000),
              },
            ];
          })
        : undefined;
    return failure(upstream.status, error.code, error.message, details);
  } catch {
    return failure(
      502,
      "API_INVALID_RESPONSE",
      "The local API returned an invalid error response.",
    );
  } finally {
    reader.releaseLock();
  }
}

async function proxy(request: Request, context: Context) {
  let config: ReturnType<typeof configuration>;
  try {
    config = configuration();
  } catch {
    return failure(
      503,
      "API_CONFIGURATION_INVALID",
      "Configure VIBEFIELD_API_URL as the local API origin and use valid local ports.",
    );
  }
  const host = request.headers.get("host");
  if (!host || !config.hosts.includes(host))
    return failure(
      403,
      "HOST_FORBIDDEN",
      "Use the configured localhost or 127.0.0.1 web address.",
    );
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== `http://${host}`)
    return failure(
      403,
      "ORIGIN_FORBIDDEN",
      "Only this exact local web origin is allowed.",
    );
  if (!METHODS.has(request.method))
    return failure(
      405,
      "METHOD_NOT_ALLOWED",
      "This method is not supported by the local API proxy.",
    );
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const site = request.headers.get("sec-fetch-site");
  if (
    mutation &&
    origin === null &&
    site !== null &&
    site !== "same-origin" &&
    site !== "none"
  ) {
    return failure(
      403,
      "ORIGIN_FORBIDDEN",
      "Cross-site mutations are not allowed.",
    );
  }
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: safeHeaders() });
  const { path } = await context.params;
  if (
    !Array.isArray(path) ||
    !path.length ||
    path.length > 16 ||
    path.some((part) => !/^[A-Za-z0-9_-]{1,200}$/.test(part))
  ) {
    return failure(400, "INVALID_PATH", "Invalid API resource path.");
  }
  const query = new URL(request.url).search;
  if (query.length > 8192)
    return failure(414, "QUERY_TOO_LONG", "The API query is too long.");
  const upload =
    request.method === "POST" && path.length === 1 && path[0] === "assets";
  const type = request.headers.get("content-type") ?? "";
  if (
    mutation &&
    !(upload
      ? /^multipart\/form-data;\s*boundary=/i.test(type)
      : /^application\/json(?:\s*;|$)/i.test(type))
  ) {
    return failure(
      415,
      "CONTENT_TYPE_REQUIRED",
      upload
        ? "Use multipart/form-data with a boundary."
        : "Use application/json for mutations.",
    );
  }
  if (mutation && !request.body)
    return failure(400, "BODY_REQUIRED", "A request body is required.");
  const requestLimit = upload ? UPLOAD_LIMIT : JSON_LIMIT;
  let incomingLength: number | null;
  try {
    incomingLength = contentLength(request.headers);
  } catch {
    return failure(
      400,
      "INVALID_CONTENT_LENGTH",
      "Invalid request content length.",
    );
  }
  if (incomingLength !== null && incomingLength > requestLimit)
    return failure(
      413,
      "BODY_TOO_LARGE",
      "Request exceeds the local upload or JSON size limit.",
    );
  const headers = new Headers({
    "X-Vibefield-Actor": "web",
    "Accept-Encoding": "identity",
  });
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      if (value.length > 4096)
        return failure(
          431,
          "HEADER_TOO_LARGE",
          "An API request header is too long.",
        );
      headers.set(name, value);
    }
  }
  // Forward only a verified Origin; never Cookie, Authorization, X-Forwarded-* or browser actor claims.
  if (origin !== null) headers.set("Origin", origin);
  const controller = new AbortController();
  let uploadExceeded = false;
  let timedOut = false;
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, TIMEOUT_MS);
  const cleanup = () => {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
  };
  try {
    const body =
      mutation && request.body
        ? boundedStream(
            request.body,
            requestLimit,
            () => undefined,
            () => {
              uploadExceeded = true;
              abort();
            },
          )
        : undefined;
    const options: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      body,
      ...(body ? { duplex: "half" as const } : {}),
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    };
    const upstream = await fetch(
      `${config.origin}/api/v1/${path.map(encodeURIComponent).join("/")}${query}`,
      options,
    );
    if (
      upstream.status >= 300 &&
      upstream.status < 400 &&
      upstream.status !== 304
    ) {
      await upstream.body?.cancel();
      cleanup();
      return failure(
        502,
        "API_REDIRECT_BLOCKED",
        "The local API returned an unexpected redirect.",
      );
    }

    if (upstream.status >= 400) {
      const response = await safeUpstreamError(upstream);
      if (upstream.status === 416 && upstream.headers.has("content-range"))
        response.headers.set(
          "Content-Range",
          upstream.headers.get("content-range")!,
        );
      cleanup();
      return response;
    }
    if (
      upstream.headers.has("content-encoding") &&
      upstream.headers.get("content-encoding") !== "identity"
    ) {
      await upstream.body?.cancel();
      cleanup();
      return failure(
        502,
        "API_ENCODING_UNSUPPORTED",
        "The local API returned an unexpected transfer encoding.",
      );
    }
    const responseLimit =
      path[0] === "campaigns" && path[2] === "export"
        ? EXPORT_LIMIT
        : path[0] === "assets" && ["content", "thumb"].includes(path[2] ?? "")
          ? MEDIA_LIMIT
          : CATALOG_LIMIT;
    const length = contentLength(upstream.headers);
    if (length !== null && length > responseLimit) {
      await upstream.body?.cancel();
      cleanup();
      return failure(
        502,
        "API_RESPONSE_TOO_LARGE",
        "The local API response exceeds the transfer limit.",
      );
    }
    const responseHeaders = safeHeaders();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    if (
      request.method === "HEAD" ||
      [204, 205, 304].includes(upstream.status) ||
      !upstream.body
    ) {
      await upstream.body?.cancel();
      cleanup();
      return new Response(null, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }
    return new Response(
      boundedStream(upstream.body, responseLimit, cleanup, abort),
      { status: upstream.status, headers: responseHeaders },
    );
  } catch {
    abort();
    cleanup();
    if (uploadExceeded)
      return failure(
        413,
        "BODY_TOO_LARGE",
        "Request exceeds the local upload or JSON size limit.",
      );
    return failure(
      timedOut ? 504 : 502,
      timedOut ? "API_TIMEOUT" : "API_UNREACHABLE",
      "The local API response was not confirmed. Check Jobs before repeating a paid action.",
    );
  }
}

export {
  proxy as GET,
  proxy as HEAD,
  proxy as POST,
  proxy as PATCH,
  proxy as DELETE,
  proxy as OPTIONS,
  proxy as PUT,
};
