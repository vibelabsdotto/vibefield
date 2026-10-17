import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Command, CommanderError } from 'commander';
import { ApiClient } from './client.js';
import { CliError, cleanTerminal, fail, isObject, type JsonObject } from './errors.js';
import { fields, id, numeric, payload, uploadBody, type Field, type Options } from './input.js';

interface GlobalOptions { api: string; json?: boolean; actor: string; timeout: number }
interface Context { api: ApiClient; json: boolean; signal: AbortSignal; options: Options; emit: (value: unknown) => void }
type Action = (context: Context, args: string[]) => Promise<void>;
type Argument = readonly [name: string, prefix?: string];
const f = (key: string, flag = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), type: Field['type'] = 'text', choices?: readonly string[]): Field => ({ key, flag, type, choices, description: `${key}${choices ? `: ${choices.join(', ')}` : ''}` });
const formats = ['9:16', '16:9', '1:1', '3:4', '4:5'] as const;
const characterFields = [f('name'), f('description'), f('appearance', 'appearance', 'object'), f('persona', 'persona', 'object')];
const characterUpdate = [...characterFields, f('status', 'status', 'text', ['draft', 'active', 'archived'])];
const campaignFields = [f('name'), f('brief'), f('productName'), f('productAssetIds', 'products', 'ids'), f('characterIds', 'characters', 'ids'), f('format', 'format', 'text', formats), f('status', 'status', 'text', ['draft', 'active', 'done', 'archived'])];
const shotFields = [f('characterId', 'character'), ...['title', 'scene', 'action', 'camera', 'lighting', 'wardrobe', 'dialogue', 'motion'].map((key) => f(key)), f('refAssetIds', 'refs', 'ids'), f('durationSeconds', 'duration', 'number'), f('resolution')];
const generationFields = [f('count', 'count', 'count'), f('provider'), f('model')];
const referenceFields = [f('assetId', 'asset'), f('role', 'role', 'text', ['sheet', 'angle', 'expression', 'scene', 'upload']), f('approved', 'approved', 'boolean'), f('consentConfirmed', 'consent-confirmed', 'boolean')];
const reviewFields = [f('assetId', 'asset'), f('contextType', 'context-type', 'text', ['character', 'shot']), f('contextId', 'context'), f('decision', 'decision', 'text', ['approved', 'rejected', 'needs_changes']), f('checklist', 'checklist', 'array'), f('notes')];
const settingsFields = ['defaultImageProvider', 'defaultImageModel', 'defaultVideoModel', 'defaultTextModel'].map((key) => f(key));
const activeStatuses = new Set(['queued', 'submitting', 'running', 'downloading']);
const terminalStatuses = new Set(['succeeded', 'failed', 'needs_attention', 'cancelled']);

function route(...parts: string[]): string { return `/${parts.map(encodeURIComponent).join('/')}`; }
function query(path: string, values: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, String(value));
  return `${path}${params.size ? `?${params}` : ''}`;
}
function page(command: Command): Command {
  return command.option('--limit <number>', 'Page size, 1 to 200', (value: string) => numeric(value, 'limit', 1, 200, true))
    .option('--cursor <value>', 'Opaque cursor from nextCursor');
}
function watchOptions(command: Command, wait = true): Command {
  if (wait) command.option('--wait', 'Poll this job until completion; never resubmit');
  return command.option('--wait-timeout <seconds>', 'Total polling deadline, 1 to 86400 seconds', (value: string) => numeric(value, 'wait-timeout', 1, 86400), 600)
    .option('--poll-interval <seconds>', 'Time between polls, 0.1 to 60 seconds', (value: string) => numeric(value, 'poll-interval', 0.1, 60), 2);
}
function generationOptions(command: Command): Command {
  return watchOptions(command).option('--idempotency-key <key>', 'Stable key for this exact request; generated once if omitted');
}
function downloadOptions(command: Command): Command {
  return command.requiredOption('-o, --output <path>', 'Destination file, or - for binary stdout').option('--force', 'Replace an existing destination file')
    .option('--download-timeout <seconds>', 'Deadline for the entire download, 1 to 86400 seconds', (value: string) => numeric(value, 'download-timeout', 1, 86400), 120);
}
function idempotencyKey(options: Options): string {
  const key = options.idempotencyKey ?? randomUUID();
  if (typeof key !== 'string' || key.length < 1 || key.length > 256 || !/^[\x21-\x7e]+$/.test(key)) fail('INVALID_IDEMPOTENCY_KEY', 'An idempotency key must contain 1 to 256 visible ASCII characters without spaces.');
  return key;
}
function printBudget(context: Context, budget: unknown): void {
  if (!context.json && isObject(budget)) process.stderr.write(`Video budget: ${budget.used}/${budget.cap} submissions used; ${budget.remaining} remaining; ${budget.enabled ? 'enabled' : 'disabled'}.\n`);
}
async function budget(context: Context, external: boolean): Promise<unknown> {
  const settings = await context.api.request('GET', '/settings');
  if (!isObject(settings) || !isObject(settings.videoBudget)) fail('INVALID_RESPONSE', 'Settings did not include the video budget. No generation was submitted.', 2);
  const value = settings.videoBudget;
  if (![value.cap, value.used, value.remaining].every((item) => typeof item === 'number' && Number.isSafeInteger(item) && item >= 0) || typeof value.enabled !== 'boolean') fail('INVALID_RESPONSE', 'Settings returned an invalid video budget. No generation was submitted.', 2);
  printBudget(context, value);
  // The API decides the budget atomically. Do not block a stable-key replay here:
  // a previously accepted job must still be recoverable after the cap is reached.
  if (external && context.options.confirmExternal !== true) fail('EXTERNAL_CONFIRMATION_REQUIRED', 'Video requires --confirm-external. It may consume a paid submission, including an ambiguous attempt.', 3);
  return value;
}

async function watch(context: Context, jobId: string, metadata: JsonObject = {}): Promise<unknown> {
  const deadline = performance.now() + Number(context.options.waitTimeout ?? 600) * 1000;
  const interval = Number(context.options.pollInterval ?? 2) * 1000;
  let lastJob: JsonObject | undefined;
  let previousStatus: string | undefined;
  for (;;) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) fail('WAIT_TIMEOUT', 'Stopped waiting. The job may still be running. Use job show or job watch; do not submit it again.', 4, { ...metadata, jobId, lastJob, resubmitted: false });
    let result: unknown;
    try { result = await context.api.request('GET', route('jobs', jobId), { timeout: Math.min(context.api.options.timeout, remaining) }); }
    catch (error) {
      if (context.signal.aborted) fail('WAIT_INTERRUPTED', 'Stopped waiting. The job was not cancelled or resubmitted.', 4, { ...metadata, jobId, lastJob });
      if (performance.now() >= deadline || remaining <= context.api.options.timeout && error instanceof CliError && error.envelope.error.code === 'REQUEST_TIMEOUT') fail('WAIT_TIMEOUT', 'Stopped waiting. The job may still be running. Use job show or job watch; do not submit it again.', 4, { ...metadata, jobId, lastJob, resubmitted: false });
      if (error instanceof CliError && error.source === 'cli') {
        throw new CliError({ error: { ...error.envelope.error, details: { ...(isObject(error.envelope.error.details) ? error.envelope.error.details : {}), ...metadata, jobId, resubmitted: false } } }, error.exitCode);
      }
      // Preserve server envelopes exactly. Recovery context uses stderr instead.
      process.stderr.write(`Job ${jobId} was accepted and not resubmitted. Recovery: ${JSON.stringify(metadata)}. Use job show ${jobId}.\n`);
      throw error;
    }
    if (!isObject(result) || typeof result.status !== 'string' || typeof result.id !== 'string' || result.id !== jobId) fail('INVALID_JOB_RESPONSE', 'The API returned an invalid job response. No resubmission was made.', 2, { ...metadata, jobId });
    lastJob = result;
    const status = result.status;
    if (!context.json && status !== previousStatus) process.stderr.write(`Job ${jobId}: ${cleanTerminal(status)}\n`);
    previousStatus = status;
    if (terminalStatuses.has(status)) {
      if (status === 'succeeded') return result;
      const message = status === 'needs_attention'
        ? 'The provider submission outcome needs attention. Inspect the job and resolve it explicitly; do not resubmit blindly.'
        : status === 'cancelled' ? 'The job is cancelled. This does not imply an upstream cancellation or refund.' : 'The job failed. No automatic resubmission was made.';
      fail(`JOB_${status.toUpperCase()}`, message, 4, { ...metadata, jobId, job: result, resubmitted: false });
    }
    if (!activeStatuses.has(status)) fail('UNKNOWN_JOB_STATUS', 'The API returned an unknown job status. Stopped polling without resubmitting.', 4, { ...metadata, jobId, job: result });
    try { await sleep(Math.min(interval, Math.max(0, deadline - performance.now())), undefined, { signal: context.signal }); }
    catch { fail('WAIT_INTERRUPTED', 'Stopped waiting. The job was not cancelled or resubmitted.', 4, { ...metadata, jobId, lastJob }); }
  }
}

async function generate(context: Context, path: string, body: JsonObject, external = false): Promise<void> {
  if (external && context.options.confirmExternal !== true) fail('EXTERNAL_CONFIRMATION_REQUIRED', 'Video requires the explicit --confirm-external flag, including when using --file.', 3);
  const key = idempotencyKey(context.options);
  const videoBudgetBeforeSubmission = await budget(context, external);
  if (!context.json) process.stderr.write(`Idempotency key: ${key}\n`);
  let response: unknown;
  try { response = await context.api.request('POST', path, { body, idempotencyKey: key }); }
  catch (error) {
    // API errors stay byte-structure compatible in stdout. Keep the key available
    // even when a server error makes acceptance uncertain and JSON mode is on.
    if (error instanceof CliError && error.source === 'api' && context.json) {
      process.stderr.write(`${JSON.stringify({ request: { path, idempotencyKey: key, resubmitted: false, outcomeUnknown: error.exitCode === 2 } })}\n`);
    }
    throw error;
  }
  if (!isObject(response) || typeof response.jobId !== 'string') fail('INVALID_JOB_RESPONSE', 'The API may have accepted the request, but did not return a jobId. Inspect jobs before retrying.', 2, { idempotencyKey: key, outcomeUnknown: true, resubmitted: false });
  try { id(response.jobId, 'job'); }
  catch { fail('INVALID_JOB_RESPONSE', 'The API returned an invalid job identifier. Inspect jobs before retrying.', 2, { idempotencyKey: key, outcomeUnknown: true, resubmitted: false }); }
  const metadata = { ...response, jobId: response.jobId, idempotencyKey: key, videoBudgetBeforeSubmission };
  if (context.options.wait) context.emit({ ...metadata, job: await watch(context, response.jobId, metadata) });
  else context.emit(metadata);
}

async function download(context: Context, path: string, headers: Record<string, string> = {}): Promise<void> {
  const output = String(context.options.output);
  if (output === '-' && context.json) fail('OUTPUT_MODE_CONFLICT', '--json cannot be combined with binary --output -. Use a file destination.');
  if (output === '-' && process.stdout.isTTY) fail('BINARY_TERMINAL', 'Refusing to write binary media to a terminal. Redirect stdout or choose an output file.');
  const receipt = await context.api.download(path, output, context.options.force === true, Number(context.options.downloadTimeout) * 1000, headers);
  if (output !== '-') context.emit(receipt);
}

export function createProgram(signal: AbortSignal = new AbortController().signal): Command {
  const program = new Command('vibefield').description('Character-first ad studio. HTTP only; generation is always explicit.')
    .version('0.1.0')
    .option('--api <url>', 'API origin or /api/v1 URL', process.env.VIBEFIELD_API_URL || 'http://127.0.0.1:4317')
    .option('--json', 'Write one machine-readable JSON result or error to stdout')
    .option('--actor <name>', 'Audit actor, not authentication', 'cli')
    .option('--timeout <seconds>', 'Per-request deadline, 0.1 to 3600 seconds', (value: string) => numeric(value, 'timeout', 0.1, 3600), 30)
    .showSuggestionAfterError(true).exitOverride().configureOutput({ writeErr: () => undefined });
  program.addHelpText('after', '\nExit codes: 0 success, 1 invalid input/API rejection, 2 network/protocol/server error, 3 budget/permission/configuration, 4 incomplete or unsuccessful job.\nNo request is automatically retried. JSON errors retain API envelopes.');

  const act = (command: Command, action: Action): Command => command.action(async () => {
    const global = command.optsWithGlobals<GlobalOptions>();
    const json = global.json === true;
    const emit = (value: unknown): void => { process.stdout.write(`${JSON.stringify(value, null, json ? undefined : 2)}\n`); };
    const context: Context = { api: new ApiClient({ api: global.api, actor: global.actor, timeout: global.timeout * 1000, signal }), json, signal, options: command.optsWithGlobals<Options>(), emit };
    await action(context, command.processedArgs as string[]);
  });
  const command = (parent: Command, name: string, description: string, args: readonly Argument[] = []): Command => {
    const item = parent.command(name).description(description);
    for (const [name, prefix] of args) item.argument(`<${name}>`, prefix ? `${prefix}_ UUID identifier` : name, prefix ? (value: string) => id(value, prefix) : (value: string) => value);
    return item;
  };
  const group = (name: string, description: string, alias?: string): Command => {
    const item = program.command(name).description(description);
    if (alias) item.alias(alias);
    item.action(() => { item.outputHelp(); });
    return item;
  };
  const get = (item: Command, path: (args: string[], options: Options) => string): Command => act(item, async (ctx, args) => { ctx.emit(await ctx.api.request('GET', path(args, ctx.options))); });
  const mutate = (item: Command, method: string, path: (args: string[]) => string, definitions: readonly Field[], required: readonly string[] = [], defaults: JsonObject = {}): Command => {
    fields(item, definitions);
    return act(item, async (ctx, args) => { ctx.emit(await ctx.api.request(method, path(args), { body: await payload(ctx.options, definitions, required, defaults) })); });
  };
  const gen = (item: Command, path: (args: string[]) => string, definitions: readonly Field[], required: readonly string[] = [], defaults: JsonObject = {}, external = false): Command => {
    generationOptions(fields(item, definitions));
    if (external) item.option('--confirm-external', 'Authorize this paid external video submission');
    return act(item, async (ctx, args) => {
      const body = await payload(ctx.options, definitions, required, defaults);
      if (external) body.confirmExternal = ctx.options.confirmExternal === true;
      await generate(ctx, path(args), body, external);
    });
  };

  act(command(program, 'status', 'Show API health, providers, and persisted video budget'), async (ctx) => {
    const [health, settings] = await Promise.all([ctx.api.request('GET', '/health'), ctx.api.request('GET', '/settings')]);
    if (isObject(settings)) printBudget(ctx, settings.videoBudget);
    ctx.emit({ health, settings });
  });
  get(command(program, 'health', 'Show API health'), () => '/health');
  const settings = group('settings', 'Inspect provider configuration and change non-secret defaults');
  const showSettings: Action = async (ctx) => { const value = await ctx.api.request('GET', '/settings'); if (isObject(value)) printBudget(ctx, value.videoBudget); ctx.emit(value); };
  act(settings, showSettings);
  act(command(settings, 'show', 'Show provider availability, defaults, and budget'), showSettings);
  mutate(command(settings, 'update', 'Change non-secret provider/model defaults'), 'PATCH', () => '/settings', settingsFields);
  get(command(program, 'models', 'Show the current provider capability catalog'), () => '/providers/models');
  const providers = group('providers', 'Inspect provider capabilities');
  get(command(providers, 'models', 'Show provider models and supported parameters'), () => '/providers/models');

  const character = group('character', 'Create and manage character identities', 'characters');
  get(page(command(character, 'list', 'List characters')), (_, options) => query('/characters', { limit: options.limit, cursor: options.cursor }));
  mutate(command(character, 'create', 'Create a character without generating media'), 'POST', () => '/characters', characterFields, ['name']);
  get(command(character, 'show', 'Show a character, references, and assets', [['id', 'chr']]), ([value]) => route('characters', value!));
  mutate(command(character, 'update', 'Update identity or persona fields', [['id', 'chr']]), 'PATCH', ([value]) => route('characters', value!), characterUpdate);
  gen(command(character, 'portraits', 'Generate portrait candidates; default count is 1', [['id', 'chr']]), ([value]) => route('characters', value!, 'portraits'), [...generationFields, f('notes'), f('aspectRatio', 'aspect-ratio', 'text', formats)], [], { count: 1 });
  mutate(command(character, 'canonical', 'Promote an approved character image to canonical', [['id', 'chr']]), 'POST', ([value]) => route('characters', value!, 'canonical'), [f('assetId', 'asset')], ['assetId']);
  gen(command(character, 'derive', 'Derive identity references from the canonical image', [['id', 'chr']]), ([value]) => route('characters', value!, 'derivations'), [...generationFields, f('role', 'role', 'text', ['sheet', 'angle', 'expression']), f('spec')], ['role'], { count: 1 });
  const addReferenceCommands = (parent: Command, names: { list: string; add: string; update: string; approve: string; remove: string }): void => {
    get(page(command(parent, names.list, 'List character references', [['character', 'chr']])), ([value], options) => query(route('characters', value!, 'references'), { limit: options.limit, cursor: options.cursor }));
    mutate(command(parent, names.add, 'Attach an existing asset as a reference', [['character', 'chr']]), 'POST', ([value]) => route('characters', value!, 'references'), referenceFields, ['assetId', 'role']);
    const updateFields = [f('approved', 'approved', 'boolean'), f('position', 'position', 'number')];
    const refPath = ([character, reference]: string[]): string => route('characters', character!, 'references', reference!);
    mutate(command(parent, names.update, 'Set approval or reference position', [['character', 'chr'], ['reference', 'ref']]), 'PATCH', refPath, updateFields);
    mutate(command(parent, names.approve, 'Approve a reference; --approved false revokes approval', [['character', 'chr'], ['reference', 'ref']]), 'PATCH', refPath, updateFields, [], { approved: true });
    act(command(parent, names.remove, 'Remove only the reference relation, not its media', [['character', 'chr'], ['reference', 'ref']]), async (ctx, args) => { ctx.emit(await ctx.api.request('DELETE', refPath(args))); });
  };
  addReferenceCommands(character, { list: 'references', add: 'ref-add', update: 'ref-update', approve: 'ref-approve', remove: 'ref-remove' });
  addReferenceCommands(group('ref', 'Manage character reference relations', 'references'), { list: 'list', add: 'add', update: 'update', approve: 'approve', remove: 'remove' });

  const asset = group('asset', 'Upload, inspect, and download immutable media', 'assets');
  const upload = command(asset, 'upload', 'Upload owned, authorized, or synthetic media', [['path']]).option('--consent', 'Confirm permission to use this material');
  act(upload, async (ctx, [path]) => { ctx.emit(await ctx.api.request('POST', '/assets', { body: await uploadBody(path!, ctx.options.consent === true) })); });
  const assetList = page(command(asset, 'list', 'List assets')).option('--kind <kind>', 'image or video').option('--q <query>', 'Search assets').option('--character <id>', 'Filter by character', (value: string) => id(value, 'chr')).option('--campaign <id>', 'Filter by campaign', (value: string) => id(value, 'cmp'));
  get(assetList, (_, options) => { if (options.kind && !['image', 'video'].includes(String(options.kind))) fail('INVALID_KIND', '--kind must be image or video.'); return query('/assets', { kind: options.kind, q: options.q, characterId: options.character, campaignId: options.campaign, limit: options.limit, cursor: options.cursor }); });
  get(command(asset, 'show', 'Show asset metadata and reviews', [['id', 'ast']]), ([value]) => route('assets', value!));
  const assetGet = downloadOptions(command(asset, 'get', 'Stream asset bytes or an image thumbnail', [['id', 'ast']])).option('--thumb <width>', 'Download a 256 or 768 pixel thumbnail', (value: string) => { if (!['256', '768'].includes(value)) fail('INVALID_THUMB_WIDTH', '--thumb must be 256 or 768.'); return value; }).option('--range <bytes>', 'Single HTTP byte range, for example bytes=0-1023');
  act(assetGet, async (ctx, [value]) => {
    const range = ctx.options.range;
    if (range !== undefined && (typeof range !== 'string' || !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))) fail('INVALID_RANGE', '--range must contain a single byte range, such as bytes=0-1023.');
    await download(ctx, ctx.options.thumb ? query(route('assets', value!, 'thumb'), { w: ctx.options.thumb }) : route('assets', value!, 'content'), typeof range === 'string' ? { Range: range } : {});
  });

  const campaign = group('campaign', 'Manage campaign briefs, copy, and exports', 'campaigns');
  get(page(command(campaign, 'list', 'List campaigns')), (_, options) => query('/campaigns', { limit: options.limit, cursor: options.cursor }));
  mutate(command(campaign, 'create', 'Create a campaign brief'), 'POST', () => '/campaigns', campaignFields, ['name']);
  get(command(campaign, 'show', 'Show a campaign and its shots', [['id', 'cmp']]), ([value]) => route('campaigns', value!));
  mutate(command(campaign, 'update', 'Update the campaign brief and linked assets', [['id', 'cmp']]), 'PATCH', ([value]) => route('campaigns', value!), campaignFields);
  gen(command(campaign, 'copy', 'Generate campaign copy without executing it', [['id', 'cmp']]), ([value]) => route('campaigns', value!, 'copy'), [f('instruction'), f('model')]);
  act(downloadOptions(command(campaign, 'export', 'Stream selected approved media and provenance as ZIP', [['id', 'cmp']])), async (ctx, [value]) => { await download(ctx, route('campaigns', value!, 'export')); });

  const shot = group('shot', 'Compose shots, select approved media, and animate stills', 'shots');
  get(page(command(shot, 'list', 'List campaign shots in position order', [['campaign', 'cmp']])), ([value], options) => query(route('campaigns', value!, 'shots'), { limit: options.limit, cursor: options.cursor }));
  mutate(command(shot, 'add', 'Add a manual shot without generating media', [['campaign', 'cmp']]), 'POST', ([value]) => route('campaigns', value!, 'shots'), shotFields, ['characterId', 'title']);
  get(command(shot, 'show', 'Show shot details, jobs, and assets', [['id', 'sht']]), ([value]) => route('shots', value!));
  mutate(command(shot, 'update', 'Update shot directions and extra references', [['id', 'sht']]), 'PATCH', ([value]) => route('shots', value!), shotFields);
  mutate(command(shot, 'reorder', 'Set the exact complete ordered shot membership', [['campaign', 'cmp']]), 'POST', ([value]) => route('campaigns', value!, 'shots', 'reorder'), [f('ids', 'ids', 'ids')], ['ids']);
  act(command(shot, 'remove', 'Delete the shot relation while preserving media and job history', [['id', 'sht']]), async (ctx, [value]) => { ctx.emit(await ctx.api.request('DELETE', route('shots', value!))); });
  get(command(shot, 'preview', 'Preview the exact compiled still or video request', [['id', 'sht']]).option('--kind <kind>', 'still or video', 'still'), ([value], options) => { if (!['still', 'video'].includes(String(options.kind))) fail('INVALID_KIND', '--kind must be still or video.'); return query(route('shots', value!, 'preview'), options.kind === 'video' ? { kind: 'video' } : {}); });
  gen(command(shot, 'stills', 'Generate shot still candidates; default count is 1', [['id', 'sht']]), ([value]) => route('shots', value!, 'stills'), generationFields, [], { count: 1 });
  for (const kind of ['still', 'video']) mutate(command(shot, `select-${kind}`, `Select an approved ${kind} belonging to this shot`, [['id', 'sht']]), 'POST', ([value]) => route('shots', value!, `select-${kind}`), [f('assetId', 'asset')], ['assetId']);
  // confirmExternal is accepted in files but never substitutes for the flag.
  const videoFields = [f('model'), f('durationSeconds', 'duration', 'number'), f('resolution'), f('generateAudio', 'generate-audio', 'boolean')];
  const video = command(shot, 'video', 'Animate the approved selected still; explicit paid authorization required', [['id', 'sht']]);
  generationOptions(fields(video, videoFields)).option('--confirm-external', 'Authorize this paid external video submission');
  act(video, async (ctx, [value]) => {
    const definitions = [...videoFields, f('confirmExternal', 'confirm-external', 'boolean')];
    const body = await payload(ctx.options, definitions);
    body.confirmExternal = ctx.options.confirmExternal === true;
    await generate(ctx, route('shots', value!, 'video'), body, true);
  });

  const job = group('job', 'Inspect, watch, cancel, or explicitly resolve generation jobs', 'jobs');
  const jobList = page(command(job, 'list', 'List persisted jobs')).option('--status <status>', 'Filter by job status').option('--character <id>', 'Filter by character', (value: string) => id(value, 'chr')).option('--shot <id>', 'Filter by shot', (value: string) => id(value, 'sht')).option('--campaign <id>', 'Filter by campaign', (value: string) => id(value, 'cmp'));
  get(jobList, (_, options) => { if (options.status && !activeStatuses.has(String(options.status)) && !terminalStatuses.has(String(options.status))) fail('INVALID_STATUS', 'Unknown job status.'); return query('/jobs', { status: options.status, characterId: options.character, shotId: options.shot, campaignId: options.campaign, limit: options.limit, cursor: options.cursor }); });
  get(command(job, 'show', 'Inspect a job, output assets, errors, and history', [['id', 'job']]), ([value]) => route('jobs', value!));
  act(watchOptions(command(job, 'watch', 'Poll one existing job with a bounded deadline; never resubmit', [['id', 'job']]), false), async (ctx, [value]) => { ctx.emit(await watch(ctx, value!)); });
  act(command(job, 'cancel', 'Cancel locally; in-flight cancellation does not imply a refund', [['id', 'job']]), async (ctx, [value]) => { ctx.emit(await ctx.api.request('POST', route('jobs', value!, 'cancel'), { body: {} })); });
  const resolveFields = [f('action', 'action', 'text', ['mark_failed', 'resubmit', 'attach_provider_job', 'resume']), f('providerJobId', 'provider-job-id')];
  const resolveJob = generationOptions(fields(command(job, 'resolve', 'Resolve ambiguity explicitly; resubmit creates a NEW paid job', [['id', 'job']]), resolveFields)).option('--confirm-external', 'Authorize a paid video resubmission');
  act(resolveJob, async (ctx, [value]) => {
    const body = await payload(ctx.options, [...resolveFields, f('confirmExternal', 'confirm-external', 'boolean')], ['action']);
    if (body.action === 'attach_provider_job' && (typeof body.providerJobId !== 'string' || !body.providerJobId)) fail('REQUIRED_FIELD', 'attach_provider_job requires --provider-job-id.');
    if (body.action === 'resubmit') {
      const old = await ctx.api.request('GET', route('jobs', value!));
      if (!isObject(old) || !['image', 'video', 'text'].includes(String(old.kind))) fail('INVALID_JOB_RESPONSE', 'Cannot determine the job kind. No resubmission was made.', 2);
      const external = old.kind === 'video';
      if (external) body.confirmExternal = ctx.options.confirmExternal === true;
      await generate(ctx, route('jobs', value!, 'resolve'), body, external);
    } else {
      if (ctx.options.idempotencyKey !== undefined) fail('UNUSED_IDEMPOTENCY_KEY', '--idempotency-key applies only to --action resubmit.');
      if (ctx.options.wait && body.action === 'mark_failed') fail('INVALID_WAIT', '--wait cannot be used with --action mark_failed.');
      const result = await ctx.api.request('POST', route('jobs', value!, 'resolve'), { body });
      if (ctx.options.wait) ctx.emit(await watch(ctx, value!));
      else ctx.emit(result);
    }
  });

  const review = program.command('review').alias('reviews').description('Record an explicit human review; no numeric quality score');
  const reviewAction: Action = async (ctx) => { ctx.emit(await ctx.api.request('POST', '/reviews', { body: await payload(ctx.options, reviewFields, ['assetId', 'contextType', 'contextId', 'decision']) })); };
  act(fields(review, reviewFields), reviewAction);
  act(fields(command(review, 'add', 'Record a review for an asset in character or shot context'), reviewFields), reviewAction);
  get(page(command(program, 'history', 'List audited mutations and job transitions')).option('--entity-type <type>', 'Filter by entity type').option('--entity-id <id>', 'Filter by entity identifier'), (_, options) => query('/history', { entityType: options.entityType, entityId: options.entityId, limit: options.limit, cursor: options.cursor }));
  program.action(() => { program.outputHelp(); });
  return program;
}

export async function main(argv = process.argv): Promise<void> {
  const controller = new AbortController();
  const interrupt = (): void => { controller.abort(); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const program = createProgram(controller.signal);
  const args = argv.slice(2);
  const jsonRequested = args.slice(0, args.indexOf('--') < 0 ? undefined : args.indexOf('--')).includes('--json');
  try { await program.parseAsync(argv); }
  catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return;
    const failure = error instanceof CliError ? error : error instanceof CommanderError
      ? new CliError({ error: { code: 'CLI_USAGE', message: error.message.replace(/^error:\s*/, '') } }, 1)
      : new CliError({ error: { code: 'CLI_ERROR', message: 'The CLI could not complete the command.' } }, 1);
    if (program.opts<GlobalOptions>().json || jsonRequested) process.stdout.write(`${JSON.stringify(failure.envelope)}\n`);
    else {
      process.stderr.write(`${cleanTerminal(failure.envelope.error.code)}: ${cleanTerminal(failure.message)}\n`);
      if (failure.envelope.error.details !== undefined) process.stderr.write(`${JSON.stringify(failure.envelope.error.details, null, 2)}\n`);
    }
    process.exitCode = failure.exitCode;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
