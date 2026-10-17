import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

function integer(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max || value === '') throw new Error('Invalid numeric VibeField configuration');
  return parsed;
}
export const config = {
  home: resolve(process.env.VIBEFIELD_HOME || join(homedir(), '.vibefield')),
  port: integer(process.env.VIBEFIELD_API_PORT, 4317, 1024, 65535),
  webPort: integer(process.env.VIBEFIELD_WEB_PORT, 4318, 1024, 65535),
  videoCap: integer(process.env.VIBEFIELD_VIDEO_SUBMISSION_CAP, 5, 0, 1000000),
  videoEnabled: process.env.VIBEFIELD_ALLOW_VIDEO === '1',
  migrations: resolve(__dirname, '../drizzle'),
};
export const databasePath = join(config.home, 'vibefield.db');
export const assetsPath = join(config.home, 'assets');
export const temporaryPath = join(config.home, 'tmp');
