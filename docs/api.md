# Local API

The NestJS API binds only to `127.0.0.1`. Its default address is `http://127.0.0.1:4317/api/v1`. The web application uses port 4318 and a same-origin proxy. `VIBEFIELD_API_URL` is an origin, without `/api/v1`. See [the contract](CONTRACT.md) for routes and DTOs.

## Run

Use Node 22.16 or newer with the workspace dependencies installed. From the repository root:

```sh
npm run build --workspace @vibefield/contracts
npm run build --workspace @vibefield/prompt
npm run build --workspace @vibefield/api
npm run db:migrate --workspace @vibefield/api
npm run start --workspace @vibefield/api
```

The workspace migration script runs `tsx src/db/migrate.ts`. The compiled equivalent is `node apps/api/dist/db/migrate.js` from the root. Both call the standard Drizzle migrator. `npm run db:generate --workspace @vibefield/api` generates SQL, its snapshot, and the journal from `apps/api/src/db/schema.ts`. Stop the API before applying migrations. Startup checks every applied migration hash and timestamp, then refuses pending or divergent migration history. It does not migrate implicitly.

`VIBEFIELD_HOME` defaults to `~/.vibefield`. It contains `vibefield.db`, immutable content-addressed `assets/`, durable output staging in `tmp/`, and an exclusive `writer.lock`. Only one API or migration process may own the directory. WAL, a 15-second busy timeout, and foreign keys are enabled. Use a separate directory for probes; do not point probes at a user's database.

`VIBEFIELD_API_PORT` and `VIBEFIELD_WEB_PORT` set local ports. Host must be exactly `127.0.0.1:<api-port>` or `localhost:<api-port>`. Allowed Origins are the configured API and web ports on those same hostnames. Foreign Origins are rejected. Missing Origin is permitted for non-browser clients, but a cross-site Fetch Metadata header still blocks mutations. JSON mutation bodies require `Content-Type: application/json`. Bodyless DELETE does not require a Content-Type header. Uploads use multipart. The actor header, `X-Vibefield-Actor`, is audit context, not authentication, and is preserved for uploads.

## Manual work and media

Character, reference, review, campaign, shot, and library operations work without provider credentials. Generation availability comes from the provider catalog, not a guessed successful response. The API consumes shared Zod schemas and prompt compilers.

Upload `file` and `consent=true` to `POST /assets`. Consent means the material is owned, authorized, or synthetic. Images must be at most 25MB and 40MP. Sharp decodes and re-encodes them to PNG, applies orientation, and omits EXIF and other source metadata. Supported image inputs are single-frame JPEG, PNG, WebP, AVIF, and supported HEIF. Animated and unrecognized media are rejected. The stored MIME and dimensions come from the decoded output, not the uploaded name or MIME.

MP4 inputs must be at most 200MB. When installed, `ffprobe` from FFmpeg validates the container and video stream and reads dimensions and duration. Without ffprobe, a bounded ISO-BMFF parser reads actual dimensions and duration from standard MP4 video-track metadata. Encrypted streams, unsupported codecs, malformed metadata, or fragmented files without usable timing fail closed instead of receiving guessed dimensions. ffprobe's child environment includes only PATH, HOME, and LANG, not provider secrets. Video metadata is preserved; image EXIF is stripped.

`GET /assets/:id/content` supports a single byte range, suffix ranges, HEAD, and 416 for invalid ranges. Image thumbnails support widths 256 and 768. Video thumbnails return 404; clients can use native video. Client filenames never become filesystem paths. No API accepts an arbitrary remote URL.

Provider output downloads require HTTPS, an approved hostname, public IPv4 DNS results, and a connection pinned to a checked address. Redirects repeat these checks, at most three times. Downloads have byte limits and a two-minute transfer deadline. IPv6-only destinations fail closed. Only `openrouter.ai` is allowlisted by default. `VIBEFIELD_DOWNLOAD_HOSTS` can extend the hostname suffix allowlist for a provider's documented output CDN; do not add user-controlled generic download endpoints.

Stored-byte SHA-256 is unique. Uploading identical normalized image bytes or MP4 bytes returns the same asset ID, even with another filename. `Asset.sourceJobId` records the first import origin. Every generating job retains its own immutable `outputAssetIds` association. Shot selection audits pin the specific contextual job occurrence, so a later byte-identical result does not relabel an already selected still's historical provenance. Signed download URLs and staging filenames remain private database fields and are removed from public job responses.

Canonical promotion requires the latest matching approved character review. A generated image must belong to the character; an upload must have consent. Canonical promotion or an appearance change increments the identity version. Persona changes do not. Reference approval is explicit. Existing references retain their identity version and become visibly stale rather than being silently relabeled.

Shot characters must belong to the campaign. Selected media must be generated outputs of that exact shot and have a latest matching approved review. Videos must originate from the currently selected still. A rejecting or needs-changes review clears a matching selected still or video. Canonical changes preserve existing jobs and mark older selected stills stale. An approved historical still may still be animated. The video request pins that still's saved identity version, appearance, and canonical provenance, with an explicit stale warning; it never substitutes the current character identity.

## Jobs and spending

Every explicit generation creates an immutable compiled request and identity snapshot. Every generation POST requires `Idempotency-Key`. Same key and same route/body returns the existing job; a changed body returns `422 IDEMPOTENCY_CONFLICT`. A missing key returns `422 IDEMPOTENCY_KEY_REQUIRED`. Resubmission always requires a fresh key.

One worker claims queued jobs, appends a unique submission row, and checks the video cap inside a synchronous `BEGIN IMMEDIATE` transaction. The network call starts only after commit. No transaction spans network I/O. No image, text, or video request is automatically resubmitted.

Video requires both `VIBEFIELD_ALLOW_VIDEO=1` and `confirmExternal:true`. The default cap is five. `VIBEFIELD_VIDEO_SUBMISSION_CAP` explicitly overrides the persisted cap, including zero to disable spending. Every video submission row counts, including rejected and uncertain attempts, and no cancel or resolution refunds or deletes a row. `/settings` reports the persisted used/cap/remaining count separately from configured provider availability.

A process restart changes unacknowledged submissions to `needs_attention`. Acknowledged jobs resume polling. Jobs with persisted output handles resume downloads. Byte outputs are durably staged before import. Asset insertion and its job-output link commit together. Actual output dimensions, bytes, hash, requested model, reported model, and usage/provenance are retained. A missing reported model stays null; it is not inferred from the request.

Canceling queued work prevents submission. Canceling in-flight work only stops local processing and leaves the job requiring attention; it does not claim upstream cancellation. Resolution supports marking failed, creating a new explicit submission, resuming free polling/downloads, or verifying and attaching an async OpenRouter video ID. Attachment performs free provider verification before storing the ID. An unverifiable ID is rejected. Resubmitting an old portrait, still, or derivation after the identity changes is rejected; create a fresh generation request instead. Video keeps the selected still's historical identity provenance.

## Export and errors

`GET /campaigns/:id/export` streams a ZIP containing selected approved media plus `manifest.json`. The manifest includes incomplete-shot warnings, current campaign and character records, exact compiled requests and identity snapshots, review decisions, submission records, hashes, actual media metadata, and requested/reported model provenance. Signed provider download URLs and staged output files are not exported. At least one selected output is required; incomplete campaigns are not represented as complete.

List endpoints return `{items,nextCursor}` and accept a limit of 1 to 200, default 100. References and shots use position order; other entity lists use newest-first order. Cursors are opaque and scoped to the current filtered result set.

Errors use `{error:{code,message,details?}}`. Validation errors use 422, missing records 404, conflicts 409, and spending/security denials 403. The server never returns stack traces, provider credentials, or raw provider HTTP responses. Settings accept only nonsecret defaults. Configure provider credentials in the local API environment, never through the browser.
