# VibeField

A local studio for reusable AI characters and character-led ads. Build a visual identity, direct shots, review stills, then animate the takes you want to keep.

VibeField runs a Next.js interface and a NestJS API on your machine. SQLite stores the work; media stays in a local data directory. The web app and CLI use the same API.

## What it does

- Create a character from an appearance brief or an authorized image. Approve one canonical portrait, then derive and review sheets, angles and expressions.
- Keep identity references separate from wardrobe, products, locations and shot direction. Inspect the actual ordered attachments and compiled prompt before generating.
- Organize an ad as a campaign with ordered shots. Review and select a still before requesting image-to-video.
- Compare candidate images with the canonical reference and record review notes. No invented identity scores or progress percentages.
- Retain request snapshots, actual output dimensions, provider identifiers, requested and reported models, errors and submission history.
- Resume acknowledged video jobs without another paid submission. Ambiguous submissions require an explicit decision.
- Export selected media with shot order and provenance for editing elsewhere.
- Use the same workflow through a bundled TypeScript CLI with `--json`.

This is an independent implementation informed by [research into twelve tutorials and Higgsfield's interface](docs/research.md), not Higgsfield's code or a compatible replacement for every Higgsfield feature. There is no local model training, voice cloning, source-video motion transfer, object replacement or timeline editor in this release. Reference images improve control; they do not guarantee identical faces in every output.

## Start locally

Requires Node.js 22.12 or newer and npm 11 or newer. Native SQLite dependencies may require your platform's build tools if a prebuilt package is unavailable. `ffprobe` is recommended for broader MP4 metadata support; supported MP4 containers also have a local parser fallback.

```sh
git clone https://github.com/vibelabsdotto/vibefield.git
cd vibefield
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4318**. The API listens on **http://127.0.0.1:4317/api/v1**. The launcher applies the checked-in Drizzle migrations before starting the API. Ctrl+C stops both processes.

No provider account is required to start, upload authorized references, organize characters and plan shots. Generation buttons require a configured provider. A fresh installation contains no generated demo media or fabricated jobs.

For development:

```sh
npm run dev
```

Both listeners stay on loopback. Do not expose this single-user application through a public tunnel or reverse proxy.

## Configure providers

Copy `.env.example` to `.env.local` and configure only the providers you intend to use. Restart the local processes after changing the environment. Existing process variables take precedence over `.env.local`, which takes precedence over `.env`.

### Codex images, experimental

The native Codex image adapter is **off by default**. It uses an unofficial endpoint and your ChatGPT/Codex account quota. It may stop working without notice; check the provider's current terms before use.

1. Install the official Codex CLI and run `codex login` outside VibeField.
2. If Codex uses file-backed credential storage, select that file explicitly:

```dotenv
VIBEFIELD_EXPERIMENTAL_CODEX_IMAGES=1
VIBEFIELD_CODEX_AUTH_FILE=/absolute/path/to/.codex/auth.json
```

VibeField reads that explicit file per request. It does not search other profiles, copy credentials, sign in or refresh tokens. Keyring-only login is not read. A trusted backend process can instead supply `VIBEFIELD_CODEX_ACCESS_TOKEN` and the optional account ID.

The adapter requests **`gpt-image-2`**. If the response does not identify the executed model, VibeField records `modelReported: null`. Quality and output size are not reliable controls on this route. Aspect ratio is composition direction; inspect the dimensions actually returned. There is no silent switch to another image model or to API-key billing.

Codex currently produces one candidate per request in the verified integration. Request another candidate explicitly; VibeField does not silently submit extra calls to fill a batch.

### OpenRouter

Set your API key in the local environment file or API process environment:

```dotenv
OPENROUTER_API_KEY=your-own-key
VIBEFIELD_ALLOW_VIDEO=1
VIBEFIELD_VIDEO_SUBMISSION_CAP=5
```

Choose supported text and video models in Settings. The catalog comes from OpenRouter's documented endpoints. Unsupported duration, resolution, aspect or audio choices are rejected rather than silently changed.

Video sends the selected still inline with the motion prompt. There is no automatic public-media-host fallback. Provider support and the real verification status of inline frames are documented in [Providers](docs/providers.md).

**One OpenRouter video run has completed end-to-end**, requesting `kwaivgi/kling-v3.0-pro` with an inline selected frame. The application persisted the acknowledgement, polled completion and imported the actual MP4. Seedance 2.5 rejected the same synthetic character image under a privacy check; a catalog entry alone does not establish suitability for character work. Models never switch automatically. See [verification details](docs/verification.md) for the exact parameters, measured output and remaining limits.

The video cap is persistent per data directory. A failed or ambiguous submission attempt still counts. Raising the cap is an explicit environment change, not an automatic response to failure. A local cap does not replace your provider's own spending limits.

Prompts and selected reference images leave your machine when you request generation. Provider billing and retention terms apply. Credentials remain in the backend, never in browser API responses.

## Character-to-ad workflow

1. Create a character and generate portrait candidates, or upload an authorized portrait.
2. Review a candidate and explicitly make it canonical.
3. Derive useful views from that clean reference. Approve supporting images individually.
4. Create a campaign with a brief, product references and delivery format.
5. Add shots with scene, action, camera, lighting, wardrobe and motion direction.
6. Inspect the reference order, generate stills, and review/select a take for each shot.
7. Confirm a paid video request from the exact selected still. Watch the complete clip before selecting it.
8. Export the approved media and manifest. Finish pacing, captions, typography and sound in your editor.

See [From character to ad](docs/character-workflow.md) for photography direction, review checklists and recovery decisions.

## CLI

The bundle has no runtime npm dependencies. Run it from the repository after building:

```sh
node apps/cli/dist/index.mjs health
node apps/cli/dist/index.mjs character list --json
node apps/cli/dist/index.mjs character create --name "Mara" --json
node apps/cli/dist/index.mjs campaign list --json
node apps/cli/dist/index.mjs job list --json
node apps/cli/dist/index.mjs --help
```

The package executable is named `vibefield`. `npm run cli -- <arguments>` runs the source during development. Generation commands accept `--idempotency-key` and `--wait`; video requires `--confirm-external`. The CLI never opens SQLite directly.

[Complete CLI reference](docs/cli.md)

## Storage and implementation

Default data directory: `~/.vibefield`. Set `VIBEFIELD_HOME` to choose another location. It contains `vibefield.db`, content-addressed `assets/` and temporary generation outputs. The repository excludes credentials, databases, private media and research recordings from Git.

```text
apps/api             NestJS, SQLite, Drizzle, provider adapters, jobs and media
apps/web             Next.js App Router, shadcn Base UI, TanStack Query
apps/cli             Commander HTTP client, esbuild bundle
packages/contracts   Shared Zod validation and TypeScript types
packages/prompt      Pure identity/reference and shot prompt compilation
scripts              Local process orchestration
```

```sh
npm run typecheck
npm run lint
npm run build
npm run db:migrate
```

These commands do not submit generation jobs. GitHub Actions runs the build checks and migration replay without provider credentials. Real provider calls must be explicitly initiated.

- [API and data contract](docs/CONTRACT.md)
- [Provider behavior and configuration](docs/providers.md)
- [What has been verified and what is blocked](docs/verification.md)
- [Research and sources](docs/research.md)
- [Security](SECURITY.md)

## License

[MIT](LICENSE). Third-party source and font notices are in [THIRD_PARTY.md](THIRD_PARTY.md). Model access, provider terms and generated-media rights are separate from this repository's license.
