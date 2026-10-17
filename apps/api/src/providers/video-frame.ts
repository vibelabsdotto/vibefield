import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { ProviderContext } from './provider.types';
import { ProviderError } from './provider.types';
import { boundedFile, IMAGE_BYTES_LIMIT, imageMime } from './transport';

// Local conservative envelope, not a universal OpenRouter capability claim.
// Seedance's upstream docs specify <30 MB, dimensions between 300 and 6000,
// and aspect ratio between 0.4 and 2.5. The OpenRouter catalog has no input-byte bound.
const INLINE_BYTES_LIMIT = 4 * 1024 * 1024;
const MAX_EDGE = 2048;

export async function prepareStartFrame(ref: ProviderContext['refs'][number], model: string, signal: AbortSignal): Promise<{ dataUrl: string; metadata: Record<string, unknown> }> {
  const original = await boundedFile(ref.path, IMAGE_BYTES_LIMIT, signal);
  const mime = imageMime(original);
  if (!mime || mime !== ref.mime) throw new ProviderError('VIDEO_FRAME_INVALID', 'Start-frame bytes do not match their declared image format.');
  try {
    const info = await sharp(original, { limitInputPixels: 40000000 }).timeout({ seconds: 20 }).metadata();
    const width = info.autoOrient.width ?? info.width;
    const height = info.autoOrient.height ?? info.height;
    if (!width || !height || (info.pages ?? 1) > 1) throw new ProviderError('VIDEO_FRAME_INVALID', 'Start frame must be one decodable still image.');
    if (model.startsWith('bytedance/seedance-') && (width <= 300 || height <= 300 || width / height <= 0.4 || width / height >= 2.5)) throw new ProviderError('VIDEO_FRAME_DIMENSIONS', 'Seedance input requires both dimensions above 300 pixels and an aspect ratio between 0.4 and 2.5. The frame is not cropped or stretched automatically.');
    let bytes = original;
    let sentMime = mime;
    let sentWidth = width;
    let sentHeight = height;
    let adapted = false;
    if (original.length > INLINE_BYTES_LIMIT || Math.max(width, height) > MAX_EDGE || mime === 'image/gif' || (info.orientation !== undefined && info.orientation !== 1)) {
      if (signal.aborted) throw new ProviderError('PROVIDER_CANCELLED', 'Cancelled before video submission.');
      const encoded = await sharp(original, { limitInputPixels: 40000000 }).timeout({ seconds: 20 }).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
      bytes = encoded.data; sentMime = 'image/jpeg'; sentWidth = encoded.info.width; sentHeight = encoded.info.height; adapted = true;
    }
    if (bytes.length > INLINE_BYTES_LIMIT) throw new ProviderError('VIDEO_FRAME_TOO_LARGE', 'Prepared start frame exceeds the local 4 MiB inline limit. Resize the selected still before another explicit submission.');
    if (model.startsWith('bytedance/seedance-') && (sentWidth <= 300 || sentHeight <= 300)) throw new ProviderError('VIDEO_FRAME_DIMENSIONS', 'Downscaling would violate the documented Seedance minimum dimensions.');
    return { dataUrl: `data:${sentMime};base64,${bytes.toString('base64')}`, metadata: {
      assetId: ref.assetId, adapted, originalMime: mime, originalBytes: original.length, originalWidth: width, originalHeight: height,
      sentMime, sentBytes: bytes.length, sentWidth, sentHeight,
      originalSha256: createHash('sha256').update(original).digest('hex'), sentSha256: createHash('sha256').update(bytes).digest('hex'),
      adaptation: adapted ? 'Auto-orient, fit inside 2048px without cropping or enlargement, flatten alpha to white, JPEG quality 85, strip metadata.' : 'Original selected-still bytes.',
      inlineInputSupport: 'provider_dependent', localInlineByteLimit: INLINE_BYTES_LIMIT,
    } };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('VIDEO_FRAME_INVALID', 'Start frame could not be decoded or adapted safely.');
  }
}
