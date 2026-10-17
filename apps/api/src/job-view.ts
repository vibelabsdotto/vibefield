import type { Row } from './db/schema';

/** Persist resumable handles privately; never send signed URLs or staging names. */
export function publicJob(job: Row<'jobs'>): Row<'jobs'> {
  if (!job.result) return job;
  const result = { ...job.result };
  if (Array.isArray(result.outputs)) result.outputs = result.outputs.map((output: unknown) => {
    if (!output || typeof output !== 'object') return {};
    const value = output as Record<string, unknown>;
    return { ...(typeof value.assetId === 'string' ? { assetId: value.assetId } : {}), ...(typeof value.mime === 'string' ? { mime: value.mime } : {}) };
  });
  return { ...job, result };
}
