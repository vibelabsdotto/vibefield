import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, unlink, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, join, basename, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { Request, Response } from 'express';
import { DatabaseService, id, now } from './db/database.service';
import type { Row } from './db/schema';
import { assetsPath, temporaryPath } from './config';
import { fail } from './errors';
import { ApiError } from './errors';
import { inspectMp4 } from './mp4';

const exec = promisify(execFile);
const IMAGE_LIMIT = 25 * 1024 * 1024;
const VIDEO_LIMIT = 200 * 1024 * 1024;
@Injectable()
export class AssetsService {
  constructor(private readonly db: DatabaseService) {}
  present(asset: Row<'assets'>) { return { ...asset, contentUrl: `/api/v1/assets/${asset.id}/content`, thumbUrl: `/api/v1/assets/${asset.id}/thumb?w=768` }; }
  path(asset: Row<'assets'>): string {
    const path = resolve(assetsPath, asset.storageKey);
    if (!path.startsWith(`${resolve(assetsPath)}${sep}`)) fail('INVALID_STORAGE_KEY', 'Invalid media storage key', 500);
    return path;
  }
  async import(buffer: Buffer, originalName: string, sourceJobId: string | null, consentConfirmed: boolean, onStored?: (asset: Row<'assets'>) => void, auditActor = 'cli') {
    if (!buffer.length || buffer.length > VIDEO_LIMIT) fail('ASSET_TOO_LARGE', 'Maximum upload is 25MB images or 200MB MP4', 413);
    let kind: 'image' | 'video', mime: string, width: number | null = null, height: number | null = null, durationMs: number | null = null, extension: string;
    const brand = buffer.toString('ascii', 8, 12);
    const isMp4 = buffer.length > 12 && buffer.toString('ascii', 4, 8) === 'ftyp' && !['heic', 'heix', 'mif1', 'avif', 'avis'].includes(brand);
    if (isMp4) {
      if (!/^(isom|iso[2-6]|mp4[12]|avc1|M4V )$/.test(brand)) fail('INVALID_MEDIA', 'Only MP4 video brands are accepted; MOV and 3GP are not supported');
      kind = 'video'; mime = 'video/mp4'; extension = 'mp4';
      const temporary = join(temporaryPath, `${randomUUID()}.mp4`); await writeFile(temporary, buffer, { mode: 0o600 });
      try {
        try {
          const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', temporary], { timeout: 20000, maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH, LANG: 'C', HOME: process.env.HOME } });
          const metadata = JSON.parse(stdout) as { streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>; format?: { duration?: string; format_name?: string } };
          const video = metadata.streams?.find(stream => stream.codec_type === 'video');
          if (!video || !metadata.format?.format_name?.includes('mp4')) fail('INVALID_MEDIA', 'File is not a valid MP4 video');
          width = video.width || null; height = video.height || null;
          const duration = Number(video.duration || metadata.format.duration); durationMs = Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) : null;
          if (!width || !height || !durationMs || width * height > 40000000) fail('INVALID_MEDIA', 'Video dimensions or duration are invalid');
        } catch (error) {
          if (error instanceof ApiError) throw error;
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            try { ({ width, height, durationMs } = inspectMp4(buffer)); }
            catch { fail('INVALID_MEDIA', 'MP4 metadata is invalid or unsupported. Install ffprobe for additional container support.'); }
          } else fail('INVALID_MEDIA', 'File is not a decodable MP4 video');
        }
      } finally { await unlink(temporary).catch(() => undefined); }
    } else {
      if (buffer.length > IMAGE_LIMIT) fail('ASSET_TOO_LARGE', 'Images must be at most 25MB', 413);
      kind = 'image'; mime = 'image/png'; extension = 'png';
      try {
        const input = sharp(buffer, { limitInputPixels: 40000000, animated: false, failOn: 'error' });
        const metadata = await input.metadata();
        if (!['jpeg', 'png', 'webp', 'avif', 'heif'].includes(metadata.format || '') || (metadata.pages || 1) > 1) fail('INVALID_MEDIA', 'Use a single-frame JPEG, PNG, WebP, or AVIF image');
        const clean = await input.rotate().png().toBuffer({ resolveWithObject: true });
        buffer = clean.data; width = clean.info.width; height = clean.info.height;
        if (buffer.length > IMAGE_LIMIT) fail('ASSET_TOO_LARGE', 'Re-encoded image exceeds 25MB', 413);
      } catch (error) { if (error instanceof Error && error.name === 'ApiError') throw error; fail('INVALID_MEDIA', 'Image could not be decoded within the 40MP limit'); }
    }
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const existing = this.db.all('assets').find(asset => asset.sha256 === sha256);
    if (existing) return this.db.transaction(() => { onStored?.(existing); this.db.audit(sourceJobId ? 'runner' : auditActor, 'asset', existing.id, 'reused', { sourceJobId, sha256 }); return this.present(existing); });
    const storageKey = `${sha256.slice(0, 2)}/${sha256}.${extension}`;
    const target = join(assetsPath, storageKey); await mkdir(join(assetsPath, sha256.slice(0, 2)), { recursive: true, mode: 0o700 });
    const temporary = join(temporaryPath, `${randomUUID()}.part`); await writeFile(temporary, buffer, { mode: 0o600 }); await rename(temporary, target);
    return this.db.transaction(() => {
      const duplicate = this.db.all('assets').find(asset => asset.sha256 === sha256);
      if (duplicate) { onStored?.(duplicate); this.db.audit(sourceJobId ? 'runner' : auditActor, 'asset', duplicate.id, 'reused', { sourceJobId, sha256 }); return this.present(duplicate); }
      const asset = this.db.insert('assets', { id: id('ast'), sha256, kind, mime, bytes: buffer.length, width, height, durationMs, storageKey, originalName: [...basename(originalName)].filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('').slice(0, 200) || `output.${extension}`, sourceJobId, consentConfirmed, createdAt: now() });
      onStored?.(asset); this.db.audit(sourceJobId ? 'runner' : auditActor, 'asset', asset.id, 'created', { sourceJobId, sha256, kind }); return this.present(asset);
    });
  }
  async content(assetId: string, req: Request, res: Response) {
    const asset = this.db.get('assets', assetId); const path = this.path(asset); const size = (await stat(path)).size;
    res.setHeader('Content-Type', asset.mime); res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Cache-Control', 'private, max-age=31536000, immutable'); res.setHeader('ETag', `"${asset.sha256}"`);
    res.setHeader('Content-Disposition', `inline; filename="${asset.id}.${asset.kind === 'video' ? 'mp4' : 'png'}"`);
    const range = req.headers.range; let start = 0, end = size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) { res.setHeader('Content-Range', `bytes */${size}`); res.status(416).end(); return; }
      if (!match[1]) start = Math.max(0, size - Number(match[2])); else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), size - 1); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) { res.setHeader('Content-Range', `bytes */${size}`); res.status(416).end(); return; }
      res.status(206); res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    res.setHeader('Content-Length', end - start + 1);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(path, { start, end }); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
  }
  async thumbnail(assetId: string, requestedWidth: unknown, res: Response) {
    const width = requestedWidth === undefined ? 768 : Number(requestedWidth); if (![256, 768].includes(width)) fail('INVALID_THUMBNAIL_SIZE', 'Thumbnail width must be 256 or 768');
    const asset = this.db.get('assets', assetId); if (asset.kind !== 'image') fail('NOT_FOUND', 'Video thumbnails are not available', 404);
    const data = await sharp(await readFile(this.path(asset))).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    res.setHeader('Content-Type', 'image/webp'); res.setHeader('Cache-Control', 'private, max-age=31536000, immutable'); res.send(data);
  }
}
