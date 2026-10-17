# Verification status

Verified locally on 2026-10-17. This describes exercised behavior, not a promise that model outputs will always preserve identity.

## Application checks

- Root typecheck, ESLint and production builds passed across all five workspaces.
- An isolated export of the staged source passed `npm ci`, typecheck, lint, production builds, two Drizzle migration runs and CLI help. Both migrations reported SQLite integrity OK and no foreign-key violations.
- 34 isolated live HTTP scenarios passed, including upload deduplication, consent, invalid media, host/origin protection, identity versions, ordered references and persistent budget state.
- 15 real CLI cases passed, including character and campaign edits, reviews, canonical selection, request preview, range download and explicit video confirmation rejection.
- The browser created a real expression-generation job, displayed its returned image without a reload, and saved an explicit visual review. Persona edits preserved the identity version. Settings changes were read back through the API.
- Eight populated routes were checked at 390px with no document overflow or captured runtime/console errors. Desktop dark/light layouts, reference comparison, upload and the native video player were also exercised.
- Campaign export produced a valid ZIP with two approved stills, one selected OpenRouter video and their manifest. The unanimated second shot remains explicitly marked incomplete. An imported, explicitly labeled Higgsfield comparison clip also played to its end in the library; it is an upload, not an OpenRouter generation.
- Gitleaks found no secrets in the inspected source export. Private credentials, databases, generated media and tutorial recordings are not included in the source tree.

## Actual image generation

Seven persisted image jobs completed through the experimental Codex adapter: two portrait attempts, a reference sheet, a face angle, two campaign stills and an expression variation. The first portrait included an unwanted cup and received a needs-changes review. The neutral portrait became canonical; derived views and campaign stills used actual ordered image bytes.

A request for two angle images returned one. The job retained the partial-result warning without another call. The integration now advertises one output per job and rejects larger counts before creating a job. No quality or pixel-size control is claimed. All requests used `gpt-image-2`; the responses did not report the executed model.

A Higgsfield still used the identical compiled prompt and ordered canonical, angle and product references. Both outputs retained the recognizable character and cup in the inspected samples. Their quality/size settings differed, so this is a workflow comparison, not a controlled model ranking.

## One successful OpenRouter video run

The initial Seedance 2.5 request returned HTTP 402 on an exhausted account. After explicitly configuring a funded, capped application key, two Seedance requests were rejected with HTTP 400. The upstream reason was `InputImageSensitiveContentDetected.PrivacyInformation`: the synthetic character image may contain a real person. No image masking, safety-check alteration or public upload fallback was used.

The operator then explicitly selected `kwaivgi/kling-v3.0-pro` for a new job using the unchanged approved still and the same motion prompt. That job completed through the actual application pipeline: one submission, persisted provider ID, status polling, authenticated content retrieval and local asset import. The frame was sent inline as PNG, without resizing or re-encoding. Its original and sent checksums match.

Requested settings were 5 seconds, 720p, 9:16 and audio disabled. The actual MP4 is H.264, 1080 × 1916, 24 fps, 5.041667 seconds, without an audio stream. This difference is why VibeField records measured output separately from requested settings. The response did not report the executed model, so `modelReported` remains null. Full-file decoding passed. Six sampled frames retain the recognizable character and cup; this is not a universal identity guarantee or a measurement of continuous motion quality.

The separate Higgsfield control used the same source frame and motion prompt with a different requested model. Both are real outputs; neither is substituted for the other. Four submission attempts were recorded, with one success. The final allowed test attempt was left unused. No automatic retries or counter resets occurred.

The generated OpenRouter clip played to its end in the studio with no decoding or captured runtime errors. After an explicit concept-review approval, selection and ZIP export succeeded. The exported MP4 matched the downloaded asset byte for byte. Audio, lip sync and exact product geometry at newly revealed angles still need their own review; no conclusion about them follows from this silent clip.

## Copy generation

One real OpenRouter copy job requested `openai/gpt-4.1-mini` and returned three short German advertising lines. The response reported that model and usage. The application stored the result as draft copy and did not execute generated instructions or start another media job.

## Dependency audit

The production-dependency audit reported no vulnerabilities. The full audit reported 13 development-tool dependency findings. No forced dependency downgrade or automatic `npm audit fix --force` was applied. Dependency advisories and provider availability can change after this check.
