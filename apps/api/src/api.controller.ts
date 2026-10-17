import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type {} from 'multer';
import * as c from '@vibefield/contracts';
import { config } from './config';
import { DatabaseService } from './db/database.service';
import { StudioService, newest, paginate } from './studio.service';
import { AssetsService } from './assets.service';
import { JobsService } from './jobs.service';
import { SettingsService } from './settings.service';
import { CompilerService } from './compiler.service';
import { ExportService } from './export.service';
import { ProvidersService } from './providers/providers.service';
import { actor } from './security';
import { fail } from './errors';
import { publicJob } from './job-view';

const chr = (value: string) => c.characterIdSchema.parse(value);
const cmp = (value: string) => c.campaignIdSchema.parse(value);
const sht = (value: string) => c.shotIdSchema.parse(value);
const ast = (value: string) => c.assetIdSchema.parse(value);
const job = (value: string) => c.jobIdSchema.parse(value);
@Controller()
export class ApiController {
  constructor(private readonly db: DatabaseService, private readonly studio: StudioService, private readonly assets: AssetsService, private readonly jobs: JobsService, private readonly settings: SettingsService, private readonly compiler: CompilerService, private readonly exports: ExportService, private readonly providers: ProvidersService) {}
  @Get('health') health() { return { ok: true, version: '0.1.0', dataDir: config.home, runner: this.jobs.status() }; }
  @Get('settings') getSettings() { return this.settings.get(); }
  @Patch('settings') patchSettings(@Body() body: unknown, @Req() req: Request) { return this.settings.update(body, actor(req)); }
  @Get('providers/models') models() { return this.providers.describe(); }
  @Get('characters') characters(@Query() query: unknown) { return paginate(newest(this.db.all('characters')), c.paginationSchema.parse(query)); }
  @Post('characters') createCharacter(@Body() body: unknown, @Req() req: Request) { return this.studio.createCharacter(body, actor(req)); }
  @Get('characters/:id') character(@Param('id') key: string) { return this.studio.characterDetail(chr(key)); }
  @Patch('characters/:id') patchCharacter(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { return this.studio.patchCharacter(chr(key), body, actor(req)); }
  @Post('characters/:id/canonical') canonical(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { return this.studio.canonical(chr(key), body, actor(req)); }
  @Post('characters/:id/portraits') portraits(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { c.portraitOptionsSchema.parse(body); return this.jobs.create('portrait', chr(key), body, req.header('Idempotency-Key'), actor(req)); }
  @Post('characters/:id/derivations') derivations(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { c.derivationOptionsSchema.parse(body); return this.jobs.create('derivation', chr(key), body, req.header('Idempotency-Key'), actor(req)); }
  @Get('characters/:id/references') references(@Param('id') key: string, @Query() query: unknown) { return paginate(this.studio.references(chr(key)), c.paginationSchema.parse(query)); }
  @Post('characters/:id/references') addReference(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { return this.studio.addReference(chr(key), body, actor(req)); }
  @Patch('characters/:id/references/:refId') patchReference(@Param('id') key: string, @Param('refId') ref: string, @Body() body: unknown, @Req() req: Request) { return this.studio.patchReference(chr(key), c.referenceIdSchema.parse(ref), body, actor(req)); }
  @Delete('characters/:id/references/:refId') removeReference(@Param('id') key: string, @Param('refId') ref: string, @Req() req: Request) { return this.studio.removeReference(chr(key), c.referenceIdSchema.parse(ref), actor(req)); }
  @Post('assets') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 200 * 1024 * 1024, files: 1, fields: 1, fieldSize: 100 } }))
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Body() body: unknown, @Req() req: Request) { c.uploadConsentSchema.parse(body); if (!file) fail('FILE_REQUIRED', 'Supply multipart file and consent=true'); return { asset: await this.assets.import(file.buffer, file.originalname, null, true, undefined, actor(req)) }; }
  @Get('assets') listAssets(@Query() query: unknown) { return this.studio.listAssets(c.assetListQuerySchema.parse(query)); }
  @Get('assets/:id') asset(@Param('id') key: string) { const asset = this.db.get('assets', ast(key)); return { ...this.assets.present(asset), reviews: newest(this.db.all('reviews').filter(r => r.assetId === asset.id)) }; }
  @Get('assets/:id/content') content(@Param('id') key: string, @Req() req: Request, @Res() res: Response) { return this.assets.content(ast(key), req, res); }
  @Get('assets/:id/thumb') thumb(@Param('id') key: string, @Query() query: unknown, @Res() res: Response) { return this.assets.thumbnail(ast(key), c.thumbnailQuerySchema.parse(query).w, res); }
  @Get('campaigns') campaigns(@Query() query: unknown) { return paginate(newest(this.db.all('campaigns')), c.paginationSchema.parse(query)); }
  @Post('campaigns') createCampaign(@Body() body: unknown, @Req() req: Request) { return this.studio.createCampaign(body, actor(req)); }
  @Get('campaigns/:id') campaign(@Param('id') key: string) { return { ...this.db.get('campaigns', cmp(key)), shots: this.studio.shots(key) }; }
  @Patch('campaigns/:id') patchCampaign(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { return this.studio.patchCampaign(cmp(key), body, actor(req)); }
  @Get('campaigns/:id/shots') shots(@Param('id') key: string, @Query() query: unknown) { return paginate(this.studio.shots(cmp(key)), c.paginationSchema.parse(query)); }
  @Post('campaigns/:id/shots') createShot(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { return this.studio.createShot(cmp(key), body, actor(req)); }
  @Post('campaigns/:id/shots/reorder') reorder(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { return this.studio.reorder(cmp(key), body, actor(req)); }
  @Post('campaigns/:id/copy') copy(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { c.copyOptionsSchema.parse(body); return this.jobs.create('copy', cmp(key), body, req.header('Idempotency-Key'), actor(req)); }
  @Get('campaigns/:id/export') export(@Param('id') key: string, @Req() req: Request, @Res() res: Response) { return this.exports.campaign(cmp(key), res, actor(req)); }
  @Get('shots/:id') shot(@Param('id') key: string) { return this.studio.shotDetail(sht(key)); }
  @Patch('shots/:id') patchShot(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { return this.studio.patchShot(sht(key), body, actor(req)); }
  @Delete('shots/:id') removeShot(@Param('id') key: string, @Req() req: Request) { return this.studio.removeShot(sht(key), actor(req)); }
  @Get('shots/:id/preview') preview(@Param('id') key: string, @Query() query: unknown) { const { kind } = c.previewQuerySchema.parse(query); return this.compiler.compile(kind, sht(key), kind === 'video' ? { confirmExternal: true } : {}, true); }
  @Post('shots/:id/stills') stills(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { c.stillOptionsSchema.parse(body); return this.jobs.create('still', sht(key), body, req.header('Idempotency-Key'), actor(req)); }
  @Post('shots/:id/select-still') selectStill(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { return this.studio.select(sht(key), body, 'image', actor(req)); }
  @Post('shots/:id/video') video(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { c.videoOptionsSchema.parse(body); return this.jobs.create('video', sht(key), body, req.header('Idempotency-Key'), actor(req)); }
  @Post('shots/:id/select-video') selectVideo(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { return this.studio.select(sht(key), body, 'video', actor(req)); }
  @Get('jobs') listJobs(@Query() query: unknown) { return this.jobs.list(c.jobListQuerySchema.parse(query)); }
  @Get('jobs/:id') getJob(@Param('id') key: string) { return this.jobs.detail(job(key)); }
  @Post('jobs/:id/cancel') cancel(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { c.emptyBodySchema.parse(body); return publicJob(this.jobs.cancel(job(key), actor(req))); }
  @Post('jobs/:id/resolve') async resolve(@Param('id') key: string, @Body() body: unknown, @Req() req: Request) { const result = await this.jobs.resolve(job(key), body, req.header('Idempotency-Key'), actor(req)); return 'jobId' in result ? result : publicJob(result); }
  @Post('reviews') review(@Body() body: unknown, @Req() req: Request) { return this.studio.review(body, actor(req)); }
  @Get('history') history(@Query() query: unknown) { const q = c.historyListQuerySchema.parse(query); return paginate(this.db.all('history').reverse().filter(h => (!q.entityType || h.entityType === q.entityType) && (!q.entityId || h.entityId === q.entityId)).sort((a, b) => b.at.localeCompare(a.at)), q); }
}
