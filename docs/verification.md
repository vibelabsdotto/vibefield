# Verification status

Verified locally on 2026-10-17. This describes exercised behavior, not a promise that model outputs will always preserve identity.

## Application checks

- Root typecheck, ESLint and production builds passed across all five workspaces.
- An isolated export of the staged source passed `npm ci`, typecheck, lint, production builds, two Drizzle migration runs and CLI help. Both migrations reported SQLite integrity OK and no foreign-key violations.
- 34 isolated live HTTP scenarios passed, including upload deduplication, consent, invalid media, host/origin protection, identity versions, ordered references and persistent budget state.
- 15 real CLI cases passed, including character and campaign edits, reviews, canonical selection, request preview, range download and explicit video confirmation rejection.
- The browser created a real expression-generation job, displayed its returned image without a reload, and saved an explicit visual review. Persona edits preserved the identity version. Settings changes were read back through the API.
- Eight populated routes were checked at 390px with no document overflow or captured runtime/console errors. Desktop dark/light layouts, reference comparison, upload and the native video player were also exercised.
- Campaign export produced a valid ZIP with two approved stills and their manifest. An imported, explicitly labeled Higgsfield comparison clip played to its end in the library. It is an upload, not an OpenRouter generation.
- Gitleaks found no secrets in the inspected source export. Private credentials, databases, generated media and tutorial recordings are not included in the source tree.

## Actual image generation

Seven persisted image jobs completed through the experimental Codex adapter: two portrait attempts, a reference sheet, a face angle, two campaign stills and an expression variation. The first portrait included an unwanted cup and received a needs-changes review. The neutral portrait became canonical; derived views and campaign stills used actual ordered image bytes.

A request for two angle images returned one. The job retained the partial-result warning without another call. The integration now advertises one output per job and rejects larger counts before creating a job. No quality or pixel-size control is claimed. All requests used `gpt-image-2`; the responses did not report the executed model.

A Higgsfield still used the identical compiled prompt and ordered canonical, angle and product references. Both outputs retained the recognizable character and cup in the inspected samples. Their quality/size settings differed, so this is a workflow comparison, not a controlled model ranking.

## OpenRouter is still blocked by billing

The first five-second Seedance 2.5 video request returned HTTP 402. The account's credits were exhausted. The application kept the rejected submission and failure visible, did not retry, and retained **1 of 5 attempts used** across restart. No OpenRouter video was created.

The video adapter is implemented, but inline start-frame acceptance, asynchronous completion and media retrieval have **not** been verified with a funded account. Copy generation was not exercised after the billing failure either. There is no public upload fallback or substitute video presented as a successful OpenRouter result.

To finish verification, configure a funded OpenRouter account, inspect the approved selected still and submit a new job explicitly. Keep the remaining attempt cap in place. The separate Higgsfield control used the same selected frame and motion prompt; it does not establish that the OpenRouter path works.

## Dependency audit

The production-dependency audit reported no vulnerabilities. The full audit reported 13 development-tool dependency findings. No forced dependency downgrade or automatic `npm audit fix --force` was applied. Dependency advisories and provider availability can change after this check.
