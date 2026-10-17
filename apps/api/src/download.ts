import { request } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { fail } from './errors';

const suffixes = ['openrouter.ai'];
function publicAddress(address: string): boolean {
  if (isIP(address) !== 4) return false; // Fail closed on IPv6, including mapped/private addresses.
  const parts = address.split('.').map(Number); const a = parts[0]!; const b = parts[1]!;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
}
export async function downloadOutput(input: string, signal: AbortSignal, maxBytes = 200 * 1024 * 1024, redirects = 0): Promise<Buffer> {
  let url: URL; try { url = new URL(input); } catch { return fail('UNSAFE_OUTPUT_URL', 'Provider output URL is invalid'); }
  const host = url.hostname.toLowerCase();
  const configured = (process.env.VIBEFIELD_DOWNLOAD_HOSTS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(host) || ![...suffixes, ...configured].some(s => host === s || host.endsWith(`.${s}`))) fail('UNSAFE_OUTPUT_URL', 'Provider output host is not allowlisted');
  const addresses = await lookup(host, { all: true, family: 4 });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) fail('UNSAFE_OUTPUT_URL', 'Provider output resolves to a private or reserved address');
  const address = addresses[0]!.address;
  return new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => req.destroy(new Error('Download deadline exceeded')), 120000);
    const req = request(url, { signal, family: 4, lookup: (_hostname, _options, callback) => callback(null, address, 4), headers: { Accept: 'image/*,video/mp4,application/octet-stream' } }, response => {
      if (response.statusCode && [301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume(); clearTimeout(timer);
        if (redirects >= 3 || !response.headers.location) { reject(new Error('Too many provider output redirects')); return; }
        downloadOutput(new URL(response.headers.location, url).href, signal, maxBytes, redirects + 1).then(resolve, reject); return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Provider output download failed')); return; }
      if (Number(response.headers['content-length']) > maxBytes) { req.destroy(new Error('Provider output exceeds size limit')); return; }
      let size = 0; const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) req.destroy(new Error('Provider output exceeds size limit')); else chunks.push(chunk); });
      response.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
      response.on('error', reject);
    });
    req.on('error', reject); req.on('close', () => clearTimeout(timer)); req.end();
  });
}
