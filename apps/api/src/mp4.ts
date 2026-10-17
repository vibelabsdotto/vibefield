// Bounded ISO-BMFF metadata reader for standard, non-encrypted MP4s when
// ffprobe is not installed. It reads container metadata, not guessed defaults.
interface Box { type: string; start: number; end: number }
function boxes(data: Buffer, start: number, end: number): Box[] {
  const result: Box[] = [];
  while (start < end) {
    if (end - start < 8 || result.length > 100000) throw new Error('Malformed MP4 box');
    let size = data.readUInt32BE(start); const type = data.toString('ascii', start + 4, start + 8); let header = 8;
    if (size === 1) { if (end - start < 16) throw new Error('Truncated MP4 box'); const large = data.readBigUInt64BE(start + 8); if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Oversized MP4 box'); size = Number(large); header = 16; }
    if (size === 0) size = end - start;
    if (size < header || start + size > end) throw new Error('Invalid MP4 box size');
    result.push({ type, start: start + header, end: start + size }); start += size;
  }
  return result;
}
function child(data: Buffer, parent: Box, type: string): Box { const box = boxes(data, parent.start, parent.end).find(box => box.type === type); if (!box) throw new Error(`MP4 ${type} metadata is missing`); return box; }
function seconds(data: Buffer, box: Box): number {
  const version = data[box.start]; if (version !== 0 && version !== 1) throw new Error('Unsupported MP4 metadata version');
  const offset = box.start + (version === 1 ? 20 : 12); if (offset + (version === 1 ? 12 : 8) > box.end) throw new Error('Truncated MP4 timing');
  const timescale = data.readUInt32BE(offset); const duration = version === 1 ? Number(data.readBigUInt64BE(offset + 4)) : data.readUInt32BE(offset + 4);
  if (!timescale || !Number.isSafeInteger(duration)) throw new Error('Invalid MP4 timing'); return duration / timescale;
}
export function inspectMp4(data: Buffer): { width: number; height: number; durationMs: number } {
  const top = boxes(data, 0, data.length); const ftyp = top.find(box => box.type === 'ftyp'); const moov = top.find(box => box.type === 'moov');
  if (!ftyp || ftyp.end - ftyp.start < 8 || !moov || !top.some(box => box.type === 'mdat')) throw new Error('MP4 container metadata or media is missing');
  const brand = data.toString('ascii', ftyp.start, ftyp.start + 4);
  if (!/^(isom|iso[2-6]|mp4[12]|avc1|M4V )$/.test(brand)) throw new Error('Unsupported MP4 brand');
  for (const track of boxes(data, moov.start, moov.end).filter(box => box.type === 'trak')) {
    const mdia = child(data, track, 'mdia'); const handler = child(data, mdia, 'hdlr');
    if (handler.start + 12 > handler.end || data.toString('ascii', handler.start + 8, handler.start + 12) !== 'vide') continue;
    const sample = child(data, child(data, child(data, mdia, 'minf'), 'stbl'), 'stsd');
    if (sample.end - sample.start < 8) throw new Error('Invalid MP4 sample description');
    const entries = boxes(data, sample.start + 8, sample.end); if (!entries.length || entries.length !== data.readUInt32BE(sample.start + 4)) throw new Error('Invalid MP4 sample entries');
    const entry = entries.find(box => ['avc1', 'avc3', 'hvc1', 'hev1', 'vp09', 'av01', 'mp4v'].includes(box.type));
    if (!entry || entry.end - entry.start < 28) throw new Error('Unsupported or encrypted video stream');
    const width = data.readUInt16BE(entry.start + 24); const height = data.readUInt16BE(entry.start + 26);
    const duration = seconds(data, child(data, mdia, 'mdhd')) || seconds(data, child(data, moov, 'mvhd'));
    if (!width || !height || width * height > 40000000 || !Number.isFinite(duration) || duration <= 0) throw new Error('Video metadata is unavailable; install ffprobe for fragmented MP4s');
    return { width, height, durationMs: Math.round(duration * 1000) };
  }
  throw new Error('MP4 has no supported video track');
}
