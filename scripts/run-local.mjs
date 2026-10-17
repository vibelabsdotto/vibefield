import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = new Set();
let stopping = false;

function stopChild(child) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') console.error(error.message);
  }
}

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) stopChild(child);
  const deadline = setTimeout(() => {
    for (const child of children) {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch { /* The owned child has already stopped. */ }
    }
    process.exit(code);
  }, 3000);
  deadline.unref();
  if (children.size === 0) process.exit(code);
  process.exitCode = code;
}

function publicChildEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !name.startsWith('VIBEFIELD_CODEX_') &&
    !/(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN|SECRET|PASSWORD)$/.test(name),
  ));
}

function launch(command, args, cwd = root, env = publicChildEnv()) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    shell: false,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  child.once('error', () => children.delete(child));
  return child;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = launch(command, args);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`));
    });
  });
}

async function requireFreePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => reject(new Error(`127.0.0.1:${port} is unavailable: ${error.message}. Stop the existing VibeField instance or choose another port.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

function readPort(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${name} must be an integer between 1024 and 65535.`);
  }
  return value;
}

export async function runLocal(mode) {
  process.chdir(root);
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    if (existsSync(file)) process.loadEnvFile(file);
  }
  const apiPort = readPort('VIBEFIELD_API_PORT', 4317);
  const webPort = readPort('VIBEFIELD_WEB_PORT', 4318);
  if (apiPort === webPort) throw new Error('API and web need different ports.');
  process.env.VIBEFIELD_API_PORT = String(apiPort);
  process.env.VIBEFIELD_WEB_PORT = String(webPort);
  process.env.VIBEFIELD_API_URL = `http://127.0.0.1:${apiPort}`;
  process.env.VIBEFIELD_WEB_ORIGIN = `http://127.0.0.1:${webPort}`;
  await requireFreePort(apiPort);
  await requireFreePort(webPort);
  process.once('SIGINT', () => shutdown(130));
  process.once('SIGTERM', () => shutdown(143));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (mode === 'dev') {
    for (const workspace of ['@vibefield/contracts', '@vibefield/prompt', '@vibefield/api']) {
      await run(npm, ['run', 'build', '--workspace', workspace]);
    }
  }
  await run(npm, ['run', 'db:migrate', '--workspace', '@vibefield/api']);
  const api = mode === 'dev'
    ? launch(npm, ['run', 'dev', '--workspace', '@vibefield/api'], root, process.env)
    : launch(process.execPath, [path.join(root, 'apps/api/dist/main.js')], root, process.env);
  const webDir = path.join(root, 'apps/web');
  const requireWeb = createRequire(path.join(webDir, 'package.json'));
  const web = launch(process.execPath, [requireWeb.resolve('next/dist/bin/next'), mode === 'dev' ? 'dev' : 'start', '--hostname', '127.0.0.1', '--port', String(webPort)], webDir);
  for (const [name, child] of [['API', api], ['Web', web]]) {
    child.once('error', (error) => {
      console.error(`${name} could not start: ${error.message}`);
      shutdown(1);
    });
    child.once('exit', (code, signal) => {
      if (!stopping) {
        console.error(`${name} stopped (${code ?? signal}); stopping the other process.`);
        shutdown(code || 1);
      }
    });
  }
  console.log(`\nVibeField ${mode}: http://127.0.0.1:${webPort}`);
  console.log(`API: http://127.0.0.1:${apiPort}/api/v1`);
  console.log('Ctrl+C stops both local processes.\n');
}

export function fail(error) {
  console.error(`VibeField: ${error.message}`);
  shutdown(1);
}
