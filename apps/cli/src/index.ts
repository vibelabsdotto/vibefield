#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { main } from './commands.js';

export { createProgram, main } from './commands.js';

// Importing the module does not run a CLI. realpath also supports npm bin links.
let entryUrl: string | undefined;
try { if (process.argv[1]) entryUrl = pathToFileURL(realpathSync(process.argv[1])).href; }
catch { /* Importing from stdin or an embedding host need not have a file entry. */ }
if (import.meta.url === entryUrl) {
  await main();
}
