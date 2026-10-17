# Security

VibeField is a single-user local application. It is not designed to be exposed to the internet or used as a shared server.

## Running locally

Keep the web and API listeners on loopback. Do not place them behind a public tunnel or reverse proxy. Host and Origin validation limits browser-origin attacks; it does not make untrusted local processes safe. Any process running as your operating-system user may access your local files and API.

The data directory contains character references, generated media, prompts, reviews and provider job identifiers. Keep it outside the source repository. Do not commit `.env`, credentials, Codex login files or data directories.

## Provider access

Local storage does not mean local generation. A generation request sends its prompt and selected reference images to the chosen provider. Provider terms, billing, retention and content rules apply separately from this repository's MIT license.

The Codex images adapter is experimental and disabled by default. Enabling it uses an unofficial native image endpoint and your signed-in account quota. Its interface may change without notice. Check the provider's current terms before use. VibeField does not establish which underlying model ran when the response omits that information.

Credentials belong in the API process environment or an explicitly selected credential file. The web UI must never receive them. Do not use third-party credential files or ask someone to paste their login tokens into a chat or issue.

## Paid jobs

An interrupted request may already have been accepted upstream. Do not treat a local timeout as proof that nothing was charged. Inspect the saved job and provider job ID before resubmitting. Recovery should poll or collect the original job; a resubmission is a new paid request.

The video submission budget counts attempts before sending them. Failed or ambiguous attempts remain in that ledger. Changing a local budget does not change a provider's account-level spending limit.

## Reporting an issue

Report vulnerabilities privately through [GitHub's private vulnerability reporting](https://github.com/vibelabsdotto/vibefield/security/advisories/new) when enabled. Do not put account tokens, private reference images, signed download URLs, or raw provider responses in public issues. Include the affected version, reproduction steps and sanitized logs.
