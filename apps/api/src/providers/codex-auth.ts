import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { ProviderError } from './provider.types';
import { boundedFile, record } from './transport';

export interface CodexCredential {
  token: string;
  accountId?: string;
  residency?: string;
  source: 'env' | 'auth_file';
}

function headerValue(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 32768 && /^[\x21-\x7e]+$/.test(value);
}

/** Explicit backend opt-in only. No discovery, writes, refresh, login or token cache. */
export async function readCodexCredential(): Promise<CodexCredential> {
  if (process.env.VIBEFIELD_EXPERIMENTAL_CODEX_IMAGES !== '1') throw new ProviderError('CODEX_DISABLED', 'Experimental Codex images are disabled. Set VIBEFIELD_EXPERIMENTAL_CODEX_IMAGES=1 in the API process to opt in.');
  let token: unknown;
  let accountId: unknown;
  let source: CodexCredential['source'];
  const fromEnv = process.env.VIBEFIELD_CODEX_ACCESS_TOKEN;
  if (fromEnv !== undefined) {
    source = 'env'; token = fromEnv; accountId = process.env.VIBEFIELD_CODEX_ACCOUNT_ID;
  } else if (process.env.VIBEFIELD_CODEX_AUTH_FILE) {
    source = 'auth_file';
    const path = process.env.VIBEFIELD_CODEX_AUTH_FILE;
    if (!isAbsolute(path)) throw new ProviderError('CODEX_AUTH_FILE_INVALID', 'VIBEFIELD_CODEX_AUTH_FILE must be an explicitly selected absolute path.');
    try {
      const file = record(JSON.parse((await boundedFile(path, 256 * 1024)).toString('utf8')));
      const tokens = record(file?.tokens);
      token = tokens?.access_token; accountId = tokens?.account_id;
    } catch {
      throw new ProviderError('CODEX_AUTH_FILE_INVALID', 'Cannot read the explicitly selected Codex auth file. Run codex login outside VibeField, then select its auth file.');
    }
  } else throw new ProviderError('CODEX_AUTH_MISSING', 'No Codex credential configured. Run codex login outside VibeField and set VIBEFIELD_CODEX_AUTH_FILE, or supply VIBEFIELD_CODEX_ACCESS_TOKEN to the API process.');
  if (!headerValue(token) || (accountId !== undefined && accountId !== null && !headerValue(accountId))) throw new ProviderError('CODEX_AUTH_INVALID', 'Codex credential is missing or malformed. Run codex login outside VibeField, then retry.');
  // Claims supply optional routing metadata and a local expiry hint, not signature validation.
  let claims: Record<string, unknown> | undefined;
  try {
    const parts = token.split('.');
    if (parts.length === 3 && parts[1]) claims = record(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')));
  } catch { /* Opaque tokens are left for the upstream authentication check. */ }
  if (typeof claims?.exp === 'number' && claims.exp * 1000 <= Date.now() + 30000) throw new ProviderError('CODEX_AUTH_EXPIRED', 'Codex access token is expired or about to expire. Run codex login outside VibeField, then retry. VibeField never refreshes tokens.');
  const routing = record(claims?.['https://api.openai.com/auth']);
  // These exact claims/header names are used by the researched Codex transport.
  const claimAccount = routing?.chatgpt_account_id;
  const residency = routing?.chatgpt_data_residency ?? routing?.chatgpt_compute_residency;
  const selectedAccount = accountId ?? (headerValue(claimAccount) ? claimAccount : undefined);
  return { token, source, ...(headerValue(selectedAccount) ? { accountId: selectedAccount } : {}), ...(headerValue(residency) ? { residency } : {}) };
}

/** Internal identity for invalidating a remembered 401/403. Never exposed or persisted. */
export function credentialFingerprint(credential: CodexCredential): string {
  return createHash('sha256').update(credential.token).update('\0').update(credential.accountId ?? '').digest('hex');
}
