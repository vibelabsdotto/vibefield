# VibeField contract

Local character-first ad studio. Next.js + shadcn Base UI, NestJS Express, Drizzle/better-sqlite3, npm workspaces and an HTTP CLI. Runtime DTOs are defined in `packages/contracts`. This document describes the API and its persistence and generation rules. A fresh installation has no fabricated generations or demo media.

## Runtime and workspace

- API `127.0.0.1:4317`, web `127.0.0.1:4318`. `VIBEFIELD_API_PORT`, `VIBEFIELD_WEB_PORT`, `VIBEFIELD_API_URL` override locally. API prefix `/api/v1`.
- `VIBEFIELD_HOME` default `~/.vibefield` holds `vibefield.db`, `assets/`, `tmp/`. Only API touches DB/media files. Web and CLI consume HTTP.
- `apps/api`, `apps/web`, `apps/cli`, `packages/contracts`, `packages/prompt`. Package names `@vibefield/api`, `@vibefield/web`, `@vibefield/cli`, `@vibefield/contracts`, `@vibefield/prompt`.
- Root npm commands: dev, build, typecheck, lint, db:migrate, cli. CLI command `vibefield`.
- Explicit standard Drizzle migration command; dev/start orchestrator runs it before API starts. Startup checks readiness. WAL, busy_timeout 15000, foreign_keys ON. No handwritten migration ledger or business triggers.
- IDs are prefixed random UUIDs (`chr_`, `ref_`, `cmp_`, `sht_`, `ast_`, `job_`, `rev_`, `sub_`, `hst_`); strings, never file paths. ISO UTC date strings in DTOs. Strict TS.
- No auth or cloud deployment. Host allowlist exact localhost/127.0.0.1 configured port; foreign Origins rejected. Mutation missing Origin allowed only with no Sec-Fetch-Site or same-origin/none. JSON Content-Type for JSON mutations. Same-origin Next catchall proxy streams bytes/Range, checks incoming host/origin, forwards only necessary headers, API URL server-only. No browser secrets.
- Request actor header `X-Vibefield-Actor` defaults `cli`, UI `web`; non-auth audit context. Error `{error:{code,message,details?}}`, no secret/raw provider response leakage.
- Lists `{items: T[], nextCursor: string|null}` support `limit` default 100 max200, cursor. Individual responses direct entity except jobs start `{jobId:string}` and uploads `{asset:Asset}`. GET detail can extend base entity with related arrays. Date order newest first except references/shots ascending position.

## Entities / DTOs

Common mutable fields id, createdAt, updatedAt. JSON columns validated with Zod.

Character: `id,slug,name,description,appearance: Appearance,persona: Persona,status:'draft'|'active'|'archived',canonicalAssetId:string|null,identityVersion:number,createdAt,updatedAt`.
Appearance fields optional strings: `age,gender,skinTone,face,eyes,hair,build,distinguishingMarks,wardrobe`. Persona optional strings `bio,tone,audience,dos,donts`. Age plain adult description, no invented age-21 rule. Description/appearance for identity, persona for copy.
CharacterReference: `id,characterId,assetId,role:'sheet'|'angle'|'expression'|'scene'|'upload',position:number,approved:boolean,identityVersion:number,sourceJobId:string|null,consentConfirmed:boolean,createdAt,updatedAt`.
Campaign: `id,name,brief,productName,productAssetIds:string[],characterIds:string[],format:'9:16'|'16:9'|'1:1'|'3:4'|'4:5',status:'draft'|'active'|'done'|'archived',createdAt,updatedAt`.
Shot: `id,campaignId,characterId,position,title,scene,action,camera,lighting,wardrobe,dialogue,motion,refAssetIds:string[],durationSeconds:number,resolution:string,selectedStillAssetId:string|null,selectedVideoAssetId:string|null,stillIdentityVersion:number|null,status:'draft'|'stills'|'still_selected'|'video'|'done',createdAt,updatedAt`. All direction fields strings. `camera` descriptive shot/lens text, not simulated physical guarantee. Default duration5 resolution720p. Derived stale flag in detail if current identityVersion differs.
Asset: `id,sha256,kind:'image'|'video',mime,bytes,width:number|null,height:number|null,durationMs:number|null,storageKey,originalName,sourceJobId:string|null,consentConfirmed:boolean,createdAt`. contentUrl `/api/v1/assets/:id/content`, thumbUrl `/api/v1/assets/:id/thumb?w=768` may be added. Stored bytes immutable, no deleting media in v1.
Job: `id,idempotencyKey,requestHash,kind:'image'|'video'|'text',purpose:'portrait'|'derivation'|'still'|'video'|'copy',characterId:string|null,campaignId:string|null,shotId:string|null,provider,modelRequested,modelReported:string|null,request:CompiledRequest,status:'queued'|'submitting'|'running'|'downloading'|'succeeded'|'failed'|'needs_attention'|'cancelled',providerJobId:string|null,outputAssetIds:string[],resultText:string|null,result:unknown|null,error:{code,message}|null,createdAt,updatedAt,submittedAt:string|null,finishedAt:string|null`. result is safe resumable output handles/usage, never credentials. Detail includes assets and history.
Review: `id,assetId,contextType:'character'|'shot',contextId,decision:'approved'|'rejected'|'needs_changes',checklist:Array<{item:string,result:'pass'|'fail'|'unsure'|'na',note?:string}>,notes,actor,createdAt`. No numeric quality score.
Submission: `id,jobId,provider,kind,outcome:'pending'|'accepted'|'rejected'|'unknown',createdAt`. Unique jobId, never deleted/reset. Video cap counts every video row, including failed/unknown submission attempts.
History: `id,at,actor,entityType,entityId,action,payload`. Business mutations and job transitions audited.

CompiledRequest: `{kind,purpose,provider,model,prompt,negativePrompt?:string,aspectRatio:string,count:number,refAssetIds:string[],referenceRoles:Array<{assetId:string,role:string,description:string}>,identityVersion:number|null,startFrameAssetId?:string,params:{durationSeconds?:number,resolution?:string,generateAudio?:boolean,derivationRole?:string},warnings:string[],droppedRefAssetIds:string[]}`. Immutable at job creation. Exact canonical image sha and appearance snapshot stored additionally in request identity snapshot if needed for export. Image params are REQUESTS, not guarantees. For Codex no functional quality/size control; mark model execution unverified when no provider field returned. Provider parameter support must reflect discovery.

## Identity and generation rules

- Portrait generation starts without canonical. Explicit approval/promotion sets canonical and activates character. Increment identityVersion on canonical or appearance changes, not persona edits. Canonical not duplicated as reference row.
- Derivations require canonical. Always attach canonical first. Approved reference rows are explicit user action; no auto-promote new images to identity. Match current identityVersion when selecting references; stale ones visibly warned/excluded.
- Still generation requires active character with canonical. Order: canonical, first approved current-version sheet or face-angle (at most two identity images total), campaign product images, shot extra refs, empty scene plate last. Label roles and index in prompt. A scene plate must not redefine face/wardrobe. Provider ref limit truncates end with explicit warnings, never silent text-only fallback.
- Repeated edits always go from clean canonical/master, never a chain of last generated outputs. A textual appearance cannot override visible anchor. Identity lint is advice, not broad proper-name banning.
- Generate portrait candidates, approve canonical, derive reference sheet/angles, compose scene, review/select still, animate selected still, review/select video, export. Selected still must belong to this shot and have approved review; selecting video likewise. New canonical flags stale selected still, does not rewrite existing jobs.
- Latest shot needs_changes notes feed next compiled request, never mutate character identity.
- No automatic resubmits for image, text OR video. Every paid generation uses fresh explicit action. Same Idempotency-Key + same body returns same job; different body ->422 IDEMPOTENCY_CONFLICT.
- One in-process worker, atomic claim + append submission + budget check in BEGIN IMMEDIATE, network outside transaction. Cap default5 (`VIBEFIELD_VIDEO_SUBMISSION_CAP`, explicit config, >=0) persisted across restarts, external video requires `VIBEFIELD_ALLOW_VIDEO=1`. App status must show used/cap and configuration state. Count before network, no refund on ambiguity.
- On restart submitting without acknowledgment ->needs_attention; acknowledged video resumes polling, downloading resumes known downloads; no paid call repeated. Cancel queued safely; in-flight cancel cannot imply refund or upstream cancellation. Resolve old ambiguous job by attaching verified provider job ID or mark failed. Resubmit creates NEW job/key, never rewrites snapshot or ledger. Manual resume is free polling/download only.
- No fake provider/default response. Missing auth -> informative unavailable provider and disabled real-generation action. Pure manual character/shot/library work works offline.

## API endpoints and input bodies

GET /health -> `{ok:true,version,dataDir,runner:{active:boolean,jobId?:string}}`
GET /settings -> `{providers:ProviderStatus[],defaults:{imageProvider,imageModel,videoModel,textModel},videoBudget:{cap,used,remaining,enabled,submissions:Submission[]},storage:{dataDir}}`
PATCH /settings -> `{defaultImageProvider?,defaultImageModel?,defaultVideoModel?,defaultTextModel?}` non-secrets only.
GET /providers/models -> current capability catalog (may share settings result).

GET /characters
POST /characters `{name,description?,appearance?,persona?}`
GET /characters/:id -> Character plus `references:CharacterReference[],assets:Asset[]` optional relation arrays
PATCH /characters/:id `{name?,description?,appearance?,persona?,status?}`
POST /characters/:id/portraits `{count?:1..4,notes?:string,provider?:string,model?:string,aspectRatio?:string}` -> jobId
POST /characters/:id/canonical `{assetId}` ->Character. Requires image and matching approved character review; generated output must belong to character or consent-confirmed uploaded asset.
POST /characters/:id/derivations `{role:'sheet'|'angle'|'expression',spec?:string,count?:1..4,provider?,model?}` ->jobId
GET /characters/:id/references
POST /characters/:id/references `{assetId,role,approved?:boolean,consentConfirmed?:boolean}`
PATCH /characters/:id/references/:refId `{approved?,position?}`
DELETE /characters/:id/references/:refId removes relation only, not media.

POST /assets multipart `file` and `consent=true` ->{asset}
GET /assets `?kind=&q=&characterId=&campaignId=&limit=&cursor=`
GET /assets/:id ->Asset plus reviews
GET /assets/:id/content binary Range support
GET /assets/:id/thumb?w=256|768 images; videos can return404 if no thumbnail, UI uses native video.
Upload max25MB images/200MB mp4, content sniffs and sharp reencode EXIF stripping, 40MP bound. Consent is own/authorized/synthetic material, not a forced fictional-only gate. Server-controlled UUID/CAS paths, nosniff and safe headers. Provider download HTTPS allowlists + reject private/loopback destinations/redirects, bounded size/time. Do not accept arbitrary remote URLs via API.

GET /campaigns
POST /campaigns `{name,brief?,productName?,productAssetIds?:string[],characterIds?:string[],format?,status?}`
GET /campaigns/:id ->Campaign plus `shots:Shot[]`
PATCH /campaigns/:id same optional fields
GET /campaigns/:id/shots
POST /campaigns/:id/shots `{characterId,title,scene?,action?,camera?,lighting?,wardrobe?,dialogue?,motion?,refAssetIds?,durationSeconds?,resolution?}`
POST /campaigns/:id/shots/reorder `{ids:string[]}` exact current membership unique
GET /shots/:id ->Shot plus assets/jobs/character optional
PATCH /shots/:id same optional editable fields as creation
DELETE /shots/:id deletes only shot relation if no active job; preserve referenced job history/media
GET /shots/:id/preview ->CompiledRequest for still (`?kind=video` optional)
POST /shots/:id/stills `{count?:1..4,provider?,model?}` ->jobId
POST /shots/:id/select-still `{assetId}` ->Shot
POST /shots/:id/video `{confirmExternal:true,model?:string,durationSeconds?:number,resolution?:string,generateAudio?:boolean}` ->jobId
POST /shots/:id/select-video `{assetId}` ->Shot
POST /campaigns/:id/copy `{instruction?:string,model?:string}` ->text job, save resultText; no automatically executing model-generated instructions
GET /campaigns/:id/export zip with selected approved media, manifest.json and exact request/provenance. State incomplete shots in manifest and UI; require >=1 selected output.

GET /jobs `?status=&characterId=&shotId=&campaignId=&limit=&cursor=`
GET /jobs/:id
POST /jobs/:id/cancel {}
POST /jobs/:id/resolve `{action:'mark_failed'|'resubmit'|'attach_provider_job'|'resume',providerJobId?:string,confirmExternal?:boolean}` Idempotency-Key required for resubmit. attach only for supported async provider, verify status before accepting.
POST /reviews `{assetId,contextType,contextId,decision,checklist?:[],notes?:string}`
GET /history `?entityType=&entityId=&limit=&cursor=`

## Shared provider boundary

Adapters live in `apps/api/src/providers/**`, including injectable `ProvidersService` exported from `providers.service.ts` and `ProvidersModule` exported from `providers.module.ts`.
`ProvidersService.describe(): Promise<ProviderStatus[]>`, `generate(request:CompiledRequest,context:ProviderContext):Promise<ProviderResult>`, `resume(request:CompiledRequest,providerJobId:string,context:ProviderContext):Promise<ProviderResult>`.
ProviderContext `{signal:AbortSignal, refs:Array<{assetId:string,path:string,mime:string}>, onSubmitted:(providerJobId:string)=>Promise<void>}`. refs ordered and resolved server-side, includes start frame for video. No raw arbitrary client paths.
ProviderResult `{outputs:Array<{url?:string,bytes?:Buffer,mime?:string}>,modelReported:string|null,text?:string,usage?:Record<string,unknown>,metadata?:Record<string,unknown>}`. `generate` is allowed to await async poll after calling onSubmitted FIRST. `resume` NEVER submits, only polls existing ID. All outputs imported through AssetsService, not provider-specific asset copies. API persists remote result handles before downloads. Failed transport distinguishes no submission vs unknown, conservatively ambiguous.
ProviderStatus `{id,label,kinds:('image'|'video'|'text')[],configured:boolean,available:boolean,reason?:string,models:Array<{id,label,kind,maxReferences?:number,durations?:number[],resolutions?:string[],aspectRatios?:string[],supportsStartFrame?:boolean,supportsAudio?:boolean}>,warnings:string[],docsUrl:string}`. Providers initially `codex` image, `openrouter` text/video; optional explicit OpenAI API image fallback only if authorized, not default. NEVER infer actual executed model from requested identifier. Codex native images is an experimental adapter, disabled unless `VIBEFIELD_EXPERIMENTAL_CODEX_IMAGES=1`. Credentials from explicit backend env or explicit `VIBEFIELD_CODEX_AUTH_FILE`, read-only per job. No automatic login/refresh/search, no auth redirects, no public upload fallback. Provider secrets go only to API process, never Next/browser/CLI/ffprobe children. Record actual provider model when supplied, null otherwise.

Model capabilities can additionally specify `maxOutputs`, `maxOutputsSource: 'observed'|'documented'` and `maxOutputsObservedAt`. The image DTO accepts counts 1 through 4, but the compiler rejects a count above the current model limit before creating a job. Codex currently advertises one output per request, based on an observed partial batch response. Missing outputs never trigger an automatic top-up.

## CLI and web

CLI HTTP-only, commander, global --api --json --actor. Support status/settings, character list/create/show/update/portraits/canonical/derive/ref-add/ref-approve/ref-remove, asset upload/list/show/get, campaign list/create/show/update/copy/export, shot list/add/show/update/reorder/preview/stills/select-still/video/select-video, job list/show/watch/cancel/resolve, review, history. File payload `--file <json>` or stdin `-`; flags for common fields; --wait generation; --idempotency-key optional stable retry. Errors preserve API envelope in JSON mode; exit 0 success,1 validation,2 unreachable,3 budget/permission,4 terminal failed/needs_attention/cancelled. Generate default count1, not4, to avoid accidental credits.

Web routes /characters, /characters/[id], /campaigns, /campaigns/[id], /campaigns/[id]/shots/[shotId], /library, /jobs, /jobs/[id], /settings. Root redirects Characters. Sidebar current campaign picker where relevant, theme toggle, budget. Neutral dark/light studio, Geist, teal semantic primary. Character detail image-first identity form + candidate grid + pinned canonical comparison. Campaign Brief/Shots/Export. Shot instructions + variants + actual ordered refs + request preview, approved still then video confirmation. Review dialog real checklist + notes + image/video; no random scores/progress bars. Settings configuration instructions/availability, never browser credentials. Empty/error/loading/retry states. Toast via Base toast manager/Toaster. Public copy English. Real generated media only, no fake library population.
