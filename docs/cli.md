# VibeField CLI

The CLI talks to the API over HTTP. It does not open the database or the API's asset storage. Local files are used only for explicit JSON input, uploads, and downloads.

## Run it

From the repository root:

```sh
npm run build --workspace @vibefield/cli
node apps/cli/dist/index.mjs --help
./apps/cli/dist/index.mjs status
npm run cli -- character --help
```

The package executable is `vibefield`. The bundled entry is `apps/cli/dist/index.mjs` with a Node shebang. The source entry is `apps/cli/src/index.ts`. Importing that module exports `createProgram` and `main` without executing a command.

Examples below use `vibefield`. Without a global installation, replace it with `node apps/cli/dist/index.mjs`. IDs such as `$CHARACTER_ID`, `$ASSET_ID`, `$CAMPAIGN_ID`, `$SHOT_ID`, `$REFERENCE_ID`, and `$JOB_ID` must be actual IDs returned by your API. IDs use their entity prefix followed by a UUID. Paths, URLs, and shortened placeholder IDs are rejected.

## Global options and output

```sh
vibefield --api http://127.0.0.1:4317 --actor cli --json status
vibefield character list --api http://127.0.0.1:4317/api/v1 --json
```

| Option | Behavior |
| --- | --- |
| `--api <url>` | Server origin or URL ending in `/api/v1`. Defaults to `VIBEFIELD_API_URL`, then `http://127.0.0.1:4317`. |
| `--actor <name>` | Sends `X-Vibefield-Actor`. Defaults to `cli`. Audit context only, not authentication. Use 1 to 256 printable ASCII characters. |
| `--json` | One compact JSON result or error on stdout. Help remains ordinary command help. |
| `--timeout <seconds>` | Deadline for each full HTTP request and JSON response. Default 30, range 0.1 to 3600. |
| `--help` | Help for the current command or group. |

Global options work before or after the command. Human mode prints the complete returned data as indented JSON. Budget and watch updates go to stderr. In JSON mode, results include the generation's idempotency key and pre-submission budget. Recovery information may go to stderr if an API error must remain unchanged on stdout.

The CLI does not follow HTTP redirects or retry requests automatically. A request deadline covers the response body as well as the connection. JSON responses are limited to 16 MiB.

Lists return `{ "items": [...], "nextCursor": ... }`. Use `--limit 1..200` and `--cursor <nextCursor>` to fetch another page. The CLI does not silently fetch every page.

Plural group aliases are available: `characters`, `assets`, `campaigns`, `shots`, `jobs`, `reviews`, and `references`. `references` aliases `ref`.

## Status, providers, and settings

```sh
vibefield status
vibefield health
vibefield settings
vibefield settings show
vibefield models
vibefield providers models
vibefield settings update --default-image-provider codex
vibefield settings update --file defaults.json
```

`status` reads health and settings. Settings show provider availability, model defaults, and the persisted video budget including its enabled state. `models` and `providers models` read the same capability catalog.

Settings update flags are `--default-image-provider`, `--default-image-model`, `--default-video-model`, and `--default-text-model`. Only non-secret settings go through this endpoint. Do not put credentials in CLI input files.

## JSON input and common flags

Mutation commands with JSON bodies accept `--file <path>` or `--file -` for stdin. The root must be an object, up to 1 MiB. Unknown fields and invalid primitive types are rejected before sending a request. Explicit flags override the corresponding file fields. Nested objects are replaced, not deep-merged. The API still validates business rules.

```sh
vibefield character create --file character.json
printf '%s' '{"name":"Synthetic studio character","description":"Manual character, no media generated."}' \
  | vibefield character create --file - --json
vibefield character update "$CHARACTER_ID" --appearance '{"hair":"short dark hair"}'
```

Boolean field options take `true` or `false`, for example `--approved false` and `--generate-audio false`. Standalone authorization flags such as `--consent` and `--confirm-external` do not take a value.

ID lists use commas without spaces: `--characters "$FIRST_CHARACTER_ID,$SECOND_CHARACTER_ID"`. Use an empty string to clear a list, for example `--refs ''`. In files, use ordinary JSON arrays.

## Characters and references

```sh
vibefield character list --limit 25
vibefield character create --name "Studio character" --description "An original synthetic adult character."
vibefield character show "$CHARACTER_ID"
vibefield character update "$CHARACTER_ID" --persona '{"tone":"Direct","audience":"Product teams"}'
vibefield character update "$CHARACTER_ID" --status archived
vibefield character canonical "$CHARACTER_ID" --asset "$ASSET_ID"

vibefield character references "$CHARACTER_ID"
vibefield character ref-add "$CHARACTER_ID" --asset "$ASSET_ID" --role upload --consent-confirmed true
vibefield character ref-update "$CHARACTER_ID" "$REFERENCE_ID" --position 0
vibefield character ref-approve "$CHARACTER_ID" "$REFERENCE_ID"
vibefield character ref-approve "$CHARACTER_ID" "$REFERENCE_ID" --approved false
vibefield character ref-remove "$CHARACTER_ID" "$REFERENCE_ID"
```

Character create accepts `--name`, `--description`, `--appearance <json>`, and `--persona <json>`. Update also accepts `--status draft|active|archived`. Canonical promotion requires an approved review in that character's context and an eligible image.

The `ref` group exposes the same reference operations as `list`, `add`, `update`, `approve`, and `remove`. All take a character ID first; `update`, `approve`, and `remove` also take a reference ID. Reference roles are `sheet`, `angle`, `expression`, `scene`, and `upload`. Approval is an explicit human action. Removing a reference deletes the relation only, not its media.

## Assets

```sh
vibefield asset upload ./reference.png --consent
vibefield asset list --kind image --q portrait --character "$CHARACTER_ID"
vibefield asset list --campaign "$CAMPAIGN_ID" --limit 25
vibefield asset show "$ASSET_ID"
vibefield asset get "$ASSET_ID" --output ./reference.png
vibefield asset get "$ASSET_ID" --thumb 256 --output ./reference-thumb.png
vibefield asset get "$ASSET_ID" --range bytes=0-1023 --output ./first-kib.bin
vibefield asset get "$ASSET_ID" --output - > ./download.bin
```

`--consent` confirms that the material is yours, authorized, or synthetic. The API checks the actual file content and applies its image/video limits. Uploads use multipart `file` and `consent=true`. The CLI reads uploads through a file-backed Blob rather than buffering the whole file.

`asset get` streams bytes. `--thumb` accepts `256` or `768`; a video without a thumbnail may return 404. `--range` sends a single HTTP byte range.

File downloads use a private temporary file beside the destination and publish it only after streaming finishes. Existing files are not overwritten unless you pass `--force`. Interrupted or failed transfers remove the temporary file. A successful file download returns the output path, byte count, SHA-256 of the received bytes, and content type. The hash is a transfer receipt, not a comparison against stored API metadata.

`--download-timeout <seconds>` bounds the whole download, default 120, range 1 to 86400. `--output -` writes only binary bytes to stdout and cannot be combined with `--json` or an interactive terminal. A failed stdout transfer can leave partial bytes in a redirected file; check the exit code before using it.

## Campaigns and shots

```sh
vibefield campaign list
vibefield campaign create --name "Product launch" --brief "Demonstrate the product." \
  --characters "$CHARACTER_ID" --products "$PRODUCT_ASSET_ID" --format 9:16
vibefield campaign show "$CAMPAIGN_ID"
vibefield campaign update "$CAMPAIGN_ID" --product-name "Desk lamp" --status active

vibefield shot list "$CAMPAIGN_ID"
vibefield shot add "$CAMPAIGN_ID" --character "$CHARACTER_ID" --title "Opening" \
  --scene "A bright home office" --action "Turn on the lamp" --camera "Medium shot" --duration 5 --resolution 720p
vibefield shot show "$SHOT_ID"
vibefield shot update "$SHOT_ID" --lighting "Soft window light" --motion "Slow push in"
vibefield shot reorder "$CAMPAIGN_ID" --ids "$FIRST_SHOT_ID,$SECOND_SHOT_ID"
vibefield shot preview "$SHOT_ID"
vibefield shot preview "$SHOT_ID" --kind video
vibefield shot select-still "$SHOT_ID" --asset "$STILL_ASSET_ID"
vibefield shot select-video "$SHOT_ID" --asset "$VIDEO_ASSET_ID"
vibefield shot remove "$SHOT_ID"
```

Campaign create/update flags are `--name`, `--brief`, `--product-name`, `--products`, `--characters`, `--format`, and `--status`. Formats are `9:16`, `16:9`, `1:1`, `3:4`, and `4:5`. Campaign statuses are `draft`, `active`, `done`, and `archived`.

Shot add/update flags are `--character`, `--title`, `--scene`, `--action`, `--camera`, `--lighting`, `--wardrobe`, `--dialogue`, `--motion`, `--refs`, `--duration`, and `--resolution`. In JSON files these map to the API names, including `characterId`, `refAssetIds`, and `durationSeconds`. Add requires a character and title; server defaults supply omitted duration/resolution.

Reorder requires every current shot ID exactly once. Selecting a still or video requires an approved review for an asset belonging to that shot. A new character identity can make an old selected still stale. The API rejects invalid selections. Shot removal preserves media and job history and can be blocked by an active job.

## Reviews

```sh
vibefield review --asset "$ASSET_ID" --context-type character --context "$CHARACTER_ID" \
  --decision approved --notes "Identity matches the intended character." \
  --checklist '[{"item":"Identity","result":"pass"},{"item":"Hands","result":"unsure","note":"Inspect the left hand."}]'
vibefield review add --asset "$STILL_ASSET_ID" --context-type shot --context "$SHOT_ID" \
  --decision needs_changes --notes "Keep the canonical face; simplify the background."
vibefield asset show "$ASSET_ID"
```

Both `review` and `review add` create a review. Decisions are `approved`, `rejected`, and `needs_changes`. Checklist results are `pass`, `fail`, `unsure`, and `na`; `note` is optional. There is no numeric quality score. `asset show` reads the asset's reviews. Review creation does not itself select a canonical image or shot output.

## Explicit generation and waiting

These commands request real provider work when the API is configured. They can consume credits. Do not run them as connectivity checks.

```sh
vibefield character portraits "$CHARACTER_ID" --count 1 --notes "Neutral expression" \
  --idempotency-key portrait-request-001 --wait
vibefield character derive "$CHARACTER_ID" --role sheet --spec "Front and three-quarter views" \
  --idempotency-key sheet-request-001 --wait
vibefield shot stills "$SHOT_ID" --idempotency-key still-request-001 --wait
vibefield campaign copy "$CAMPAIGN_ID" --instruction "Write a concise opening line." \
  --idempotency-key copy-request-001 --wait
vibefield shot video "$SHOT_ID" --confirm-external --duration 5 --resolution 720p \
  --generate-audio false --idempotency-key video-request-001 --wait
```

Portraits, derivations, and stills default to **one** image. They accept `--count 1..4`, `--provider`, and `--model`. Portraits also accept `--notes` and `--aspect-ratio`. Derivations require `--role sheet|angle|expression` and optionally `--spec`. Copy accepts `--instruction` and `--model`. Video accepts `--model`, `--duration`, `--resolution`, and `--generate-audio true|false`. Parameters are requests; provider capabilities determine support.

Before submitting, the CLI reads settings and reports the video budget. JSON generation results contain `videoBudgetBeforeSubmission`, which is explicitly a pre-submission snapshot, not a claim about final usage. The API enforces the persisted cap and provider configuration. The CLI does not preemptively reject stable-key replays merely because the budget is now exhausted.

Video always requires the standalone `--confirm-external` flag. A JSON file containing `"confirmExternal": true` is not enough. This also applies when explicitly resubmitting a video job. A failed or ambiguous external video submission may still consume the budget.

### Idempotency and ambiguous outcomes

Every generation invocation sends an `Idempotency-Key`. A provided key is sent unchanged and must contain 1 to 256 visible ASCII characters without spaces. If omitted, the CLI generates one key for that invocation. The result and local ambiguous-request errors retain it. Human mode prints it before submission; JSON-mode API rejections retain the API envelope on stdout and print recovery context to stderr.

Reuse the same key and exact body only to recover the same intended request. Changing the body with the same key is an API conflict. A fresh key means a new explicit generation action. The CLI never repeats a POST automatically, even after a timeout, lost connection, failed job, or ambiguous submission.

Without `--wait`, acceptance returns `{ "jobId": ..., "idempotencyKey": ..., "videoBudgetBeforeSubmission": ... }`. This is not a completed generation.

With `--wait`, the CLI polls that exact job using GET only:

- `queued`, `submitting`, `running`, and `downloading` continue polling.
- `succeeded` returns the final job.
- `failed`, `needs_attention`, and `cancelled` return an error with the full job and exit 4.
- An unknown status stops polling with exit 4 rather than inventing a terminal outcome.
- `--wait-timeout <seconds>` bounds polling, default 600, range 1 to 86400. `--poll-interval <seconds>` defaults to 2, range 0.1 to 60.
- An expired polling deadline returns `WAIT_TIMEOUT` and exit 4. The job may continue running.
- A network failure stops polling with exit 2. It does not cause cancellation or resubmission.
- Interrupting a watch stops waiting, not the job. Use the saved job ID to inspect it again.

## Job recovery

```sh
vibefield job list --status needs_attention --character "$CHARACTER_ID"
vibefield job list --campaign "$CAMPAIGN_ID" --shot "$SHOT_ID"
vibefield job show "$JOB_ID"
vibefield job watch "$JOB_ID" --wait-timeout 300 --poll-interval 2
vibefield job cancel "$JOB_ID"
vibefield job resolve "$JOB_ID" --action attach_provider_job --provider-job-id "$PROVIDER_JOB_ID" --wait
vibefield job resolve "$JOB_ID" --action resume --wait
vibefield job resolve "$JOB_ID" --action mark_failed
```

`attach_provider_job` asks the API to verify the supplied provider ID. `resume` only resumes polling/downloads; it is not permission to submit again. `mark_failed` resolves the old job without creating a new one. `--wait` is not accepted with `mark_failed`.

A deliberate resubmission is separate and potentially billable:

```sh
vibefield job resolve "$JOB_ID" --action resubmit --idempotency-key replacement-request-001
# Add --confirm-external if the original job is video.
```

Resubmission creates a new job/key and preserves the old job and submission history. If no key is supplied, the CLI creates one for the new action. `--idempotency-key` is rejected for the other resolution actions. In-flight cancellation does not promise a provider cancellation or refund.

`job show` is an inspection command and exits 0 when the API read succeeds, even if the stored job has failed. Use `job watch` when the process exit code should reflect the terminal job outcome.

## Export and history

```sh
vibefield campaign export "$CAMPAIGN_ID" --output ./campaign.zip --download-timeout 300
vibefield history --entity-type character --entity-id "$CHARACTER_ID" --limit 50
```

Campaign export streams the API's ZIP. The API requires at least one selected output and includes selected approved media, `manifest.json`, and request/provenance data. Incomplete shots remain described in the manifest. Export supports the same destination protection, `--force`, binary stdout, and download deadline as `asset get`.

History accepts `--entity-type`, `--entity-id`, `--limit`, and `--cursor`.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Successful command, or an accepted generation when not waiting. |
| 1 | Invalid CLI/file input, local file error, or API validation/not-found/conflict rejection. |
| 2 | Unreachable API, network deadline, malformed response, or server error. Mutation acceptance may be unknown. |
| 3 | Budget, permission, provider availability/configuration, or missing consent/external confirmation. |
| 4 | Failed, cancelled, or needs-attention watched job; unknown job status; polling deadline or interrupted watch. |

API errors remain `{ "error": { "code": ..., "message": ..., "details": ... } }` without replacing their fields. Local errors use the same envelope. In JSON mode errors go to stdout so scripts can parse them. Save stderr as well when troubleshooting an accepted job or a generation whose response was lost.

## Verification scope

The CLI build, strict typecheck, and lint were run. Every command/group help entry and every group alias were invoked. An unreachable API probe returned a JSON `API_UNREACHABLE` envelope and exit 2.

Scratch HTTP protocol probes exercised route/method/body mapping, actor and stable idempotency headers, file/stdin input, confirmation gates, terminal job handling, bounded polling, unchanged API error envelopes, multipart upload construction, and streaming download/export behavior. These probes use an isolated protocol fixture, not a provider or the production API. They do not prove real generation, provider authentication, image quality, backend review enforcement, or ZIP contents. No paid generation was submitted during CLI verification.

The local API at `127.0.0.1:4317` was unreachable during this verification. Live character creation/readback was therefore not run. The command syntax and transport checks above passed independently of backend readiness.
