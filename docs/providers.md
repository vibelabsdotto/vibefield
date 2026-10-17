# Provider adapters

VibeField uses independent HTTP adapters. It does not import Hermes, invoke Codex, search login stores, refresh tokens, change profiles, or fall back to paid OpenAI API billing. Manual studio work remains available without credentials.

## Backend exports

- `apps/api/src/providers/providers.module.ts`: Nest `ProvidersModule`.
- `apps/api/src/providers/providers.service.ts`: injectable `ProvidersService`, with the contract's `describe()`, `generate(request, context)` and `resume(request, providerJobId, context)` methods. This module also exports `ProviderError`, `ProviderContext` and `ProviderResult`.
- `apps/api/src/providers/provider.types.ts`: boundary interfaces and safe structured errors.
- `ProvidersService.verifyVideoJob(providerJobId, signal)` performs one authenticated status GET for explicit job-ID attachment. It does not wait for completion or submit a new job.
- `ProvidersService.defaultVideoModel(): Promise<string | null>` selects from the current public catalog. Use this for an unset settings default, not a hardcoded model ID. The same choice is first among video models in `describe()`.

`ProviderContext.refs` must contain exactly the compiled ordered server-resolved assets. Image references are never silently dropped. Video accepts only the selected start frame. `onSubmitted(id)` must durably commit the acknowledged external ID. The adapter awaits it before the first poll or download.

`ProviderError` exposes `code`, a safe `message`, `submissionOutcome`, optional `providerJobId`, and optional safe `metadata`. Outcomes are `not_submitted`, `rejected`, `unknown` and `accepted`. The API maps the first two to a failed attempt, unknown submissions to `needs_attention`, and acknowledged observation failures to resumable jobs. `VIDEO_FAILED`, `VIDEO_CANCELLED` and `VIDEO_EXPIRED` are upstream terminal outcomes. A callback-persistence failure retains the external ID on the error. Preserve it for manual recovery. The submission ledger is owned by the API, not these adapters.

Persist `ProviderError.metadata` as provenance, not as a completed output result. Video errors include the frame's actual transfer adaptation when preparation completed. A successful result includes the same metadata. Recovery polling without the original in-memory attempt cannot reconstruct a prior transfer, so retain previously saved adaptation metadata when merging resumed results. Do not store an error-only record as a downloadable result.

Provider `usage` is already restricted to numeric values, numeric strings, booleans, nulls and bounded nested count objects. Preserve keys such as `prompt_tokens`, `completion_tokens` and `total_tokens`. Preserve safe `metadata.requestId` and `modelRequested` too. A blanket substring filter for `token` or `request` would incorrectly delete this provenance.

## Codex images, disabled by default

This is an **unofficial experimental endpoint**. It may break without notice, uses your ChatGPT/Codex account quota, and may be disallowed by OpenAI's terms. It is not a supported public Images API or a guarantee of free generation.

API-process environment:

| Variable | Meaning |
| --- | --- |
| `VIBEFIELD_EXPERIMENTAL_CODEX_IMAGES=1` | Explicit opt-in. Any other value leaves the adapter disabled. |
| `VIBEFIELD_CODEX_ACCESS_TOKEN` | Explicit access token. Never put it in browser settings, command arguments, source or logs. |
| `VIBEFIELD_CODEX_ACCOUNT_ID` | Optional account ID accompanying the explicit access token. |
| `VIBEFIELD_CODEX_AUTH_FILE` | Alternative, explicitly selected absolute path to a standard Codex `auth.json`. Read-only; only `tokens.access_token` and `tokens.account_id` are used. |

When the access-token variable is present it takes precedence over the file. An invalid explicit token does not cause fallback to another source. The selected file is read again for every job and status check; tokens are not cached. The adapter does not guess `CODEX_HOME`, expand a default path, inspect a keychain, or read other profiles. Run `codex login` yourself outside VibeField when authentication is missing or expired, then explicitly select its auth file. Local JWT expiry checks are hints, not signature verification. An opaque token still requires upstream authentication.

Optional account and residency routing headers use the supplied account ID or the researched JWT auth metadata, never invented values. JWT claims and credentials are not logged or returned. A 401/403 remembers only an internal one-way credential fingerprint and marks that credential unavailable until it changes or the API restarts. No automatic refresh or second paid attempt follows.

The destination is fixed at `https://chatgpt.com/backend-api/codex`. The client identifies itself with `originator: vibefield` and `User-Agent: VibeField/0.1.0`. Redirects are rejected; credentials cannot be forwarded to another host.

- No references: `POST /images/generations`.
- References: `POST /images/edits`, with ordered `images: [{image_url: "data:image/...;base64,..."}]` containing the actual bytes.
- Maximum five references, each at most 25 MiB, with matching PNG, JPEG, WebP or GIF signatures.
- Only `model: "gpt-image-2"` is accepted. The wire uses `quality: "auto"`, `size: "auto"`, `background: "opaque"`, and `n: 1`. Those quality/size fields are not product controls or output guarantees.
- VibeField currently advertises `maxOutputs: 1`, with `maxOutputsSource: "observed"` and observation date `2026-10-17`. A real `n: 2` request returned one image. Count above one is rejected before job creation; another candidate is a separate explicit job. The historical partial result remains successful with its requested/returned count warning. No hidden fan-out or top-up is performed.
- `modelReported` stays null unless an actual response model field or upstream model header supplies it. A reported name is provider attribution, not verification of the underlying model weights.
- Safe usage, reported size and quality, response request ID, correlation turn ID, generation IDs and measured dimensions are retained.
- One POST, at most 300 seconds. The correlation UUID is not an idempotency guarantee. No automatic retry or synchronous-image resume.

Use "GPT Image 2 requested · model not reported by provider" when the response lacks model identity. Do not infer identity from appearance, latency, usage, requested settings or a locally constructed tier label.

## OpenRouter

Only `OPENROUTER_API_KEY` is accepted, in the API process. The origin is fixed at `https://openrouter.ai/api/v1`; there is no base-URL override or credential fallback. Catalog requests are public and send no authorization.

`GET /videos/models` supplies validated exact duration, resolution, aspect-ratio and first-frame arrays. A separate `GET /models?output_modalities=text` discovers text models. Successful catalogs are cached for five minutes, concurrent reads coalesce, and failed refreshes have a 30-second discovery backoff. Expired catalogs are not used to admit a paid job. Null capabilities remain omitted and unknown. Unknown frame support or missing required video arrays disables that model for VibeField video submission. No parameters are silently clamped.

The default prefers `bytedance/seedance-2.0-fast` only while it exists and advertises first-frame input, five seconds, 720p and 9:16. Otherwise it chooses another qualifying live Seedance entry, then another qualifying live model, or returns null. This is a compatibility default, not a quality or price ranking.

### Text

`POST /chat/completions` sends a single user message with the compiled prompt, explicit model, `stream: false`, `max_tokens: 4096`, and `provider.allow_fallbacks: false`. Copy is text-only. The result contains text, the actually reported model if any, safe usage, generation ID and finish reason. There is no tool execution, automatic continuation or paid retry. The response is bounded to 4 MiB and 120 seconds.

### Video

Submission additionally requires `VIBEFIELD_ALLOW_VIDEO=1`, explicit user confirmation and the API's persisted atomic submission-budget admission. The API counts the attempt before network access, including rejected and ambiguous attempts. Free resume is allowed even when new submissions are disabled or the cap is exhausted.

There is exactly one `POST /videos` per `generate()` invocation. It sends explicit model, prompt, duration, resolution, aspect ratio and `generate_audio`, defaulting to false. Audio true is accepted only when the live catalog explicitly advertises it. The selected still is sent as:

```json
{
  "frame_images": [
    {
      "type": "image_url",
      "image_url": {"url": "data:image/jpeg;base64,<selected-frame-bytes>"},
      "frame_type": "first_frame"
    }
  ]
}
```

One end-to-end run on 2026-10-17 completed with an unchanged PNG data URL and requested model `kwaivgi/kling-v3.0-pro`. A separate Seedance 2.5 attempt rejected the same synthetic character image under `InputImageSensitiveContentDetected.PrivacyInformation`. Acceptance and safety rules vary by model and provider. VibeField never uploads the image to a public host, alters it after rejection, switches models or resubmits automatically. Changing the model requires a new explicit job.

Frame preparation has a conservative local maximum of 4 MiB and 2048px on the longest edge. These are application limits, not universal OpenRouter claims. The upstream Seedance documentation describes image inputs below 30 MB, dimensions between 300 and 6000px, and aspect ratios between 0.4 and 2.5. Seedance inputs outside the minimum/ratio envelope are rejected without stretching or cropping. Oversized images are auto-oriented, fit inside 2048px without enlargement, flattened to white if needed, and encoded as JPEG at quality 85. If the result remains too large it is rejected locally. Original and sent checksums, byte sizes, dimensions, MIME types and the adaptation description are recorded. Original assets remain immutable.

After acknowledgement, the adapter awaits `onSubmitted(id)`, then performs free `GET /videos/{id}` polling, normally every 30 seconds with a 15-minute observation deadline. A local timeout or cancellation does not cancel/refund upstream work. Errors retain the acknowledged ID. `resume()` only polls/downloads that ID, never submits, and does not require reference files or current catalog access.

Arbitrary provider polling and unsigned content URLs are ignored. Downloads use `GET /videos/{id}/content?index=N` on the fixed OpenRouter host with authentication and redirect rejection. A signed HTTPS content URL already on that exact host and job path can instead be returned for AssetsService to download without API credentials. Otherwise the adapter returns bounded MP4 bytes. Do not expose signed bearer links in public logs. Downloads are bounded to 200 MiB and 120 seconds per output; AssetsService still validates and imports them. Acknowledged job IDs remain the recovery handle when a content fetch fails.

All HTTP bodies have streamed byte bounds and overall deadlines. Raw provider errors, response bodies, request bodies, credentials and local credential paths are not placed in metadata or error messages. No adapter follows authenticated redirects, invokes a subprocess or automatically repeats paid requests. The launcher must inject secrets only into the API process, and any future API subprocess must receive a scrubbed environment. These adapters do not implement a launcher or modify other process environments.

## Verification and remaining limits

See [Verification status](verification.md) for the completed image and browser workflows, observed one-image limit and the successful OpenRouter video run.

The API package typecheck, Nest build and ESLint all passed with installed dependencies. The compiled adapters' live public discovery returned 30 unique video models and 470 unique text models. The live compatibility default was `bytedance/seedance-2.0-fast`; `openai/gpt-4.1-mini` was present in the text catalog. Both provider descriptions passed the shared `providerStatusSchema`, and a second description read made zero new catalog requests. The probe explicitly disabled Codex and removed credential variables in its own child process before invoking descriptions. It performed only two unauthenticated public catalog GETs and no paid requests.

Public discovery does not verify account eligibility, billing, actual model execution, inline video acceptance or media delivery. Those require a separately authorized generation with a configured account.

The source links below document the transports. [Research](research.md) explains the character workflow and the distinction between observed behavior and provider claims.

Sources:

- [Codex authentication](https://developers.openai.com/codex/auth)
- [Pinned native Codex image schema](https://raw.githubusercontent.com/openai/codex/ce0323f2f2d3b25e82806cd555237da3db4e1897/codex-rs/codex-api/src/images.rs)
- [Pinned Codex image tool and five-reference cap](https://raw.githubusercontent.com/openai/codex/ce0323f2f2d3b25e82806cd555237da3db4e1897/codex-rs/ext/image-generation/src/tool.rs)
- [Live OpenRouter video catalog](https://openrouter.ai/api/v1/videos/models)
- [OpenRouter video generation](https://openrouter.ai/docs/guides/overview/multimodal/video-generation)
- [OpenRouter image-to-video cookbook](https://openrouter.ai/docs/cookbook/video-generation/image-to-video)
- [OpenRouter provider fallback controls](https://openrouter.ai/docs/guides/routing/provider-selection)
- [Seedance upstream video request documentation](https://www.volcengine.com/docs/82379/1520757)
