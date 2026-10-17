import type { Request, Response, NextFunction } from 'express';
import { config } from './config';

export function localSecurity(req: Request, res: Response, next: NextFunction) {
  const reject = (code: string, message: string, status = 403) => res.status(status).json({ error: { code, message } });
  const hosts = [`127.0.0.1:${config.port}`, `localhost:${config.port}`];
  if (!hosts.includes(req.headers.host || '')) { reject('HOST_FORBIDDEN', 'Use the configured local API address'); return; }
  const origin = req.headers.origin;
  const origins = [config.port, config.webPort].flatMap(port => [`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  if (origin && !origins.includes(origin)) { reject('ORIGIN_FORBIDDEN', 'Foreign origins are not allowed'); return; }
  const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const site = req.headers['sec-fetch-site'];
  if (mutation && !origin && site && site !== 'same-origin' && site !== 'none') { reject('ORIGIN_FORBIDDEN', 'Cross-site mutations are not allowed'); return; }
  const bodyless = !req.headers['transfer-encoding'] && (!req.headers['content-length'] || req.headers['content-length'] === '0');
  if (mutation && !bodyless) {
    const contentType = req.headers['content-type'] || '';
    const upload = req.method === 'POST' && req.path === '/api/v1/assets';
    if (!(upload ? /^multipart\/form-data;/i.test(contentType) : /^application\/json(?:;|$)/i.test(contentType))) { reject('CONTENT_TYPE_REQUIRED', upload ? 'Use multipart/form-data' : 'Use application/json', 415); return; }
  }
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PATCH,DELETE,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Idempotency-Key,X-Vibefield-Actor,Range'); }
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
}
export function actor(req: Request): string { const value = req.header('X-Vibefield-Actor') || 'cli'; return /^[a-zA-Z0-9_.-]{1,64}$/.test(value) ? value : 'cli'; }
