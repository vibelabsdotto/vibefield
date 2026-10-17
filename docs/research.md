# Research behind the character workflow

VibeField's production design is reference-first: approve a character, compose and review each shot as an image, then animate the selected image. The important unit is an approved asset with a known source, not a prompt that happens to produce a similar face.

For the practical sequence, read [From character to ad](character-workflow.md). The [workflow contract](CONTRACT.md) defines VibeField's scope; the tutorials below are evidence for design decisions, not a list of implemented features.

## Evidence and coverage

Research date: 2026-10-17. All 12 supplied videos were analyzed from their complete available captions and selected visual frames. Titles and public video links were checked against YouTube metadata. Two videos share a title but have different IDs and content.

- **Observed** means a sampled frame or live interface was inspected. A frame can establish a visible control or selected result, not consistency throughout a clip.
- **Presenter account** means narration or captions describe a result. Audio quality, lip synchronization, revenue, speed and reliability claims were not independently established by this review.
- **Design inference** means a VibeField recommendation drawn from the evidence.
- **Local exploratory experiments** inform the operational cautions below. They are not a published benchmark or a basis for model rankings.

This review did not continuously watch every video, independently listen to the examples, or reproduce every demonstrated generation. The synthesis uses original explanations and links, not transcript dumps or copied media.

## The 12 video sources

| Source | Concrete evidence | Lesson for production |
| --- | --- | --- |
| [1] [How to Make Consistent AI Characters in Higgsfield AI (Step by Step)](https://www.youtube.com/watch?v=ZsrhdgG0I1E) | [03:03](https://www.youtube.com/watch?v=ZsrhdgG0I1E&t=183s) introduces a neutral sheet; the 04:52 frame shows a named element. [08:24](https://www.youtube.com/watch?v=ZsrhdgG0I1E&t=504s) begins wardrobe variants. Text-only face drift is a presenter account. | Save a visual identity and derive outfits from it. Do not overwrite the base identity with each outfit. |
| [2] [How to Build a $10,000 AI Influencer in 2026 (Claude + Higgsfield)](https://www.youtube.com/watch?v=jUiLvgRZC5g) | [04:43](https://www.youtube.com/watch?v=jUiLvgRZC5g&t=283s) introduces a performance video plus character image. [11:53](https://www.youtube.com/watch?v=jUiLvgRZC5g&t=713s) reports a changed voice after reusing a voiced character clip. Input controls were observed; voice similarity was not independently heard. | Keep performance, visual identity, script and voice separate. The title's earnings claim is not research evidence. |
| [3] [How to Use Higgsfield AI Better than 99% of People](https://www.youtube.com/watch?v=dJSJMt4ESEU) | [05:35](https://www.youtube.com/watch?v=dJSJMt4ESEU&t=335s) separates product and empty location references. [06:43](https://www.youtube.com/watch?v=dJSJMt4ESEU&t=403s) uses character, product and location without a start frame; the 07:31 frame shows a planned shot sequence. | A reusable reference is not a start frame. Product detail and scene layout need their own inputs. |
| [4] [I Created an AI influencer that broke the internet (full tutorial)](https://www.youtube.com/watch?v=qdmeVr6hp8c) | The [03:35](https://www.youtube.com/watch?v=qdmeVr6hp8c&t=215s) frame requests separate angle images. [03:55](https://www.youtube.com/watch?v=qdmeVr6hp8c&t=235s) explains recasting modes; [06:10](https://www.youtube.com/watch?v=qdmeVr6hp8c&t=370s) acknowledges failed clips and external editing. | Review each derived view and each clip. More references and more automation do not remove that step. |
| [5] [How to Make Your AI Clone With Higgsfield (Full Guide)](https://www.youtube.com/watch?v=qwr7RbFWRU4) | [00:43](https://www.youtube.com/watch?v=qwr7RbFWRU4&t=43s) introduces varied identity photos, with an observed upload grid at 00:49. At [05:29](https://www.youtube.com/watch?v=qwr7RbFWRU4&t=329s), the presenter says Marketing Studio uses a single-image avatar rather than the trained identity. | A shared character name does not prove a shared identity mechanism. Check what each operation actually receives. |
| [6] [Higgsfield AI Consistent Character Tutorial for Beginners (Fast & Easy)](https://www.youtube.com/watch?v=oFwfvQpcoBM) | [00:55](https://www.youtube.com/watch?v=oFwfvQpcoBM&t=55s) discusses reference curation; the 02:54 frame shows an eating-scene result. At [03:00](https://www.youtube.com/watch?v=oFwfvQpcoBM&t=180s), the presenter warns that style can override identity. | Curate references before styling. A successful still does not prove reliable eating motion or hand contact. |
| [7] [Dear Higgsfield, I reverse engineered you in 12 hours](https://www.youtube.com/watch?v=d6spCMcfkew) | At [10:43](https://www.youtube.com/watch?v=d6spCMcfkew&t=643s), an observed reconstruction is gray and retains source-like bodies. [13:28](https://www.youtube.com/watch?v=d6spCMcfkew&t=808s) shows a revised result; [17:23](https://www.youtube.com/watch?v=d6spCMcfkew&t=1043s) shows mask defects to review. | Review whole-person appearance and intermediate inputs. This is an independent reconstruction, not evidence of Higgsfield's private implementation. |
| [8] [How to Use Higgsfield AI Better than 99% of People](https://www.youtube.com/watch?v=OxNlBqHex44) | [01:26](https://www.youtube.com/watch?v=OxNlBqHex44&t=86s) directs side light, clothing and environment. The [02:25](https://www.youtube.com/watch?v=OxNlBqHex44&t=145s) frame shows angle candidates. [05:41](https://www.youtube.com/watch?v=OxNlBqHex44&t=341s) favors an image first for a known opening composition. | Describe photographic decisions, select candidates, then animate. Camera controls express intent, not recovered scene geometry. |
| [9] [How to Create an AI Influencer in Minutes (Higgsfield AI & Genjutsu)](https://www.youtube.com/watch?v=oOR0--DNRFo) | The [05:18](https://www.youtube.com/watch?v=oOR0--DNRFo&t=318s) frame shows a face/body reference. At [06:31](https://www.youtube.com/watch?v=oOR0--DNRFo&t=391s), a reference moves to first position; 06:45 shows Motion transfer and Objects swap as separate choices. | Reference order changes meaning. Source-video operations need different inputs from image-to-video. |
| [10] [STOP Wasting Credits & Master Higgsfield AI in 18 Minutes](https://www.youtube.com/watch?v=M73BrFnVPA8) | [03:40](https://www.youtube.com/watch?v=M73BrFnVPA8&t=220s) plans distinct shot stills. At [09:05](https://www.youtube.com/watch?v=M73BrFnVPA8&t=545s), the presenter reports losing framing despite retained identity and setting. The 12:48 frame distinguishes reference, start-frame and end-frame roles. | Approve composition separately from identity. Reference-guided generation does not necessarily preserve a storyboard. |
| [11] [Higgsfield AI Tutorial: Complete Beginner's Guide (Full Workflow)](https://www.youtube.com/watch?v=YdUa1482_Jo) | [07:54](https://www.youtube.com/watch?v=YdUa1482_Jo&t=474s) warns about image numbering; the 08:01 frame shows ordered thumbnails and numbered mentions. [08:15](https://www.youtube.com/watch?v=YdUa1482_Jo&t=495s) moves clips into an editor for trimming and sound. | Bind prompt roles to actual attachments. Export is an editing handoff, not a finished advertisement. |
| [12] [Higgsfield AI Full Course for Beginners (Become a Master)](https://www.youtube.com/watch?v=9Ykl1y53LIs) | [03:12](https://www.youtube.com/watch?v=9Ykl1y53LIs&t=192s) uses a selected image as the start frame. The [06:16](https://www.youtube.com/watch?v=9Ykl1y53LIs&t=376s) frame shows a single-face sheet. [08:20](https://www.youtube.com/watch?v=9Ykl1y53LIs&t=500s) introduces motion transfer, with a stylized result sampled at 09:03. | Keep reusable references, start frames and source clips distinct. A stylized result frame does not establish unchanged motion. |

## Why identity needs an image

The tutorials repeatedly save and reuse visual assets. One demonstrates reported drift despite unchanged descriptive text; another explicitly switches from a trained identity to a single-image avatar in a different tool.[1][5] A name, persona paragraph or literal `@character` string is not an attachment.

VibeField therefore makes the approved **canonical image** the visual authority. Appearance text records intent and helps identify conflicts. Persona records writing voice and audience. Neither replaces the face reference.

A seed is not VibeField's identity mechanism either. These sources do not establish seed-only identity retention across changed scenes, prompts or models, and the current contract exposes no seed-based identity binding. Reusing a seed would not specify which visible face the user approved.

Reference sheets are useful, but their layout is not a universal rule. The sampled sheet in source 10 retains a face on the full-body view beside the close-up, while sources 1 and 12 omit the detailed face on the front body panel.[1][10][12] VibeField's single-face sheet recipe is a conservative layout choice. An approved portrait remains the primary reference; the sheet does not become ground truth merely because it contains more views.

## Separate what stays fixed from what changes

| Layer | What to preserve or direct | VibeField design |
| --- | --- | --- |
| Visual identity | Face proportions, hairline, body proportions and distinctive marks | Approved canonical image, versioned appearance and individually approved supporting references |
| Wardrobe | Clothing, accessories, fabric and fit for this shot | Shot wardrobe direction; reuse the same character rather than create a new identity |
| Scene | Location, light, camera position, props and action | Shot fields plus product and extra references; an empty scene plate describes the setting |
| Persona | Tone, audience, vocabulary and editorial limits | Character persona for copy, separate from appearance |
| Voice | Speaker sound, delivery, exact words and timing | Dialogue direction is in scope; voice cloning, voice replacement and dedicated lip-sync tools are not current contract features |

This separation follows the wardrobe-variant demonstrations and the reported need to replace voice after visual character reuse.[1][2][5] A stable face does not prove a stable voice. A neutral reference does not require every final scene to have neutral lighting.

### Reference order is part of the request

The clearest public examples show numbered image mentions and deliberate reordering in the motion interface.[9][11] VibeField's still-request order is a design policy:

1. Canonical identity image.
2. The first approved, current-version sheet or face-angle reference, if present. At most two identity images in total.
3. Campaign product images.
4. Shot-specific extra references.
5. Empty scene plates last.

Each attachment needs a role and a matching index in the compiled prompt. Product references must not supply a different face. A scene plate must not redefine wardrobe or introduce another person. Check the actual request preview, especially after changing reference order. The contract requires visible warnings when a provider reference limit drops inputs, never a silent text-only fallback.

## Direct a photograph, not a quality adjective

One tutorial specifies side lighting and a cold environment; another plans establishing, detail, low-angle and close-up views and explicitly relights the character for the gym.[8][10] These are actionable decisions. "Photorealistic, cinematic, high quality" leaves the important choices unresolved.

For each still, state:

- What the person is doing and where their weight rests.
- Camera height, distance, framing and the intended perspective.
- A plausible light source, its direction and how the background responds.
- Materials, garment folds, skin texture and contact shadows appropriate to the scene.
- The exact product interaction, visible label and space needed for later text.

Use lens language to communicate a look, not to claim calibrated optics. Field of view in degrees and focal length in millimeters are different quantities; source 3 uses both types of camera direction.[3] Natural detail should follow the scene. Adding noise, excessive pores or random clutter is not a substitute for correct lighting and anatomy.

## Approve the still before video

Identity and composition are different checks. Source 10 reports keeping the character and location while losing planned framing. Source 12 starts from a selected image and describes movement instead of rebuilding the scene in text.[10][12]

VibeField's contract therefore requires an approved, selected still from the exact shot before animation. An identity-version change flags the selected still as stale rather than silently changing it. Review face, body, hands, product, wardrobe, framing and lighting together. Reject a recognizable character if the product is wrong or the intended action is impossible. Generating motion is not a repair step for a defective still.

After approval, describe the action, pace and camera movement. Do not repeat conflicting face and wardrobe instructions. Review the whole video, including the middle and ending, rather than approving its opening thumbnail.

### Image-to-video, motion transfer and replacement

| Operation | Primary input | What it directs |
| --- | --- | --- |
| Image-to-video | Approved shot still | An opening composition followed by generated motion |
| Reference-guided video | Identity, product and setting references, without necessarily fixing an opening frame | A newly composed sequence using those references |
| Motion transfer | Source performance video plus appearance references | Motion or performance derived from an existing clip |
| Object or person replacement | Source video plus a replacement target/reference | A change within an existing sequence |

The tutorials demonstrate these as distinct workflows, not interchangeable names.[3][4][9] VibeField's current contract uses image-to-video from a selected still. Source-video transfer, masks, end-frame choreography and replacement operations are outside that contract. An ordinary image-to-video request must not be presented as motion transfer.

## What the live Higgsfield inspection added

Read-only interface inspection on 2026-10-17 confirmed these product distinctions:

- AI Influencer Studio separates creation from Motion. Motion offers separate transfer and object-swap modes with a source-video input and image references.[13]
- The asset library organizes reusable media; the image composer exposes an Elements picker and a named, versioned element form.[14][15]
- The image catalog lists GPT Image 2 separately from GPT Image 2.5. The video composer has distinct creation, editing and motion controls, with media attachments and explicit output settings.[15][16]
- Marketing Studio places Avatar and Product inputs beside the creative brief. Cinema Studio exposes ordered references and camera, palette and lighting direction.[17][18]

These observations support a compact character-and-shot workspace with inspectable inputs. They do not establish Higgsfield's private model architecture or make its account-specific controls available through Codex or OpenRouter. Public route checks succeeded; some interactive views require sign-in. No account media or interface screenshots are included here.

## Lessons from local exploratory experiments

Separate local work compared reference combinations, repeated edits, photographic direction and provider metadata. Its useful findings are hypotheses and operating cautions, not numerical performance claims:

- A clear face reference followed by one complementary approved view was a useful starting point. Extra identity images sometimes introduced conflicts instead of resolving them. Empty scene plates reduced opportunities to copy another person's pose or clothing.
- Profile views, broad smiles, chewing and hand interactions remained failure cases. Identity review and action/anatomy review need separate decisions.
- Repeatedly editing the latest generated output accumulated unwanted texture, color and composition changes. Start new stills and derivations from the clean canonical or approved master, not an unreviewed chain.
- Concrete material and physical-state descriptions were more useful than escalating style adjectives. The experiments do not establish a magic prompt length, JSON format or universal reference count.
- A convincing starting portrait did not establish consistent appearance or correct speech throughout a video. Automated face comparisons and speech transcription can also misread small faces, pose and pronunciation; they do not replace human playback review.

The Codex metadata inspection did not establish a reliable exact-model pin or reliable control of requested quality and size. For the Codex route, `gpt-image-2` is the requested identifier, not proof of the executed model. **Exact executed model, controllable quality and controllable size remain unverified.** Record any returned metadata and measured output dimensions separately from the request. A successful response is not model attestation, and a Higgsfield model label does not validate the Codex route.

VibeField consequently does not treat Codex quality or size as functional controls. It also does not adopt exploratory recommendations to retry automatically when a returned quality label is low. No automatic paid retries apply to image, text or video generation.

The local observations are summarized here without private logs, identities, benchmark images or numerical scores. The public workflow and citations remain usable without those materials.

## Recovery and editing are part of production

The reconstruction tutorial distinguishes continuing a known draft task from uploading that draft as a new request.[7] This distinction informs recovery: keep the request snapshot and provider job ID, resume known polling or downloads, and reconcile an ambiguous submission before deciding to pay again. VibeField's contract requires every resubmission to be a fresh explicit action. Cancelling local work does not imply an upstream refund.

The ad tutorial explicitly hands clips to an editor for trimming, music and effects.[11] VibeField's intended handoff is selected approved media plus a manifest with shot order, missing shots and generation provenance. It is not an edited timeline or a finished ad. Finish pacing, captions, product typography, sound and delivery crops in an editor, then review the assembled advertisement.

The evidence supports reviewable production, not perfect identity, guaranteed prompt obedience or automatic commercial success.

Sources:
[1] https://www.youtube.com/watch?v=ZsrhdgG0I1E  How to Make Consistent AI Characters in Higgsfield AI (Step by Step)
[2] https://www.youtube.com/watch?v=jUiLvgRZC5g  How to Build a $10,000 AI Influencer in 2026 (Claude + Higgsfield)
[3] https://www.youtube.com/watch?v=dJSJMt4ESEU  How to Use Higgsfield AI Better than 99% of People
[4] https://www.youtube.com/watch?v=qdmeVr6hp8c  I Created an AI influencer that broke the internet (full tutorial)
[5] https://www.youtube.com/watch?v=qwr7RbFWRU4  How to Make Your AI Clone With Higgsfield (Full Guide)
[6] https://www.youtube.com/watch?v=oFwfvQpcoBM  Higgsfield AI Consistent Character Tutorial for Beginners (Fast & Easy)
[7] https://www.youtube.com/watch?v=d6spCMcfkew  Dear Higgsfield, I reverse engineered you in 12 hours
[8] https://www.youtube.com/watch?v=OxNlBqHex44  How to Use Higgsfield AI Better than 99% of People
[9] https://www.youtube.com/watch?v=oOR0--DNRFo  How to Create an AI Influencer in Minutes (Higgsfield AI & Genjutsu)
[10] https://www.youtube.com/watch?v=M73BrFnVPA8  STOP Wasting Credits & Master Higgsfield AI in 18 Minutes
[11] https://www.youtube.com/watch?v=YdUa1482_Jo  Higgsfield AI Tutorial: Complete Beginner's Guide (Full Workflow)
[12] https://www.youtube.com/watch?v=9Ykl1y53LIs  Higgsfield AI Full Course for Beginners (Become a Master)
[13] https://higgsfield.ai/ai-influencer-studio  Higgsfield AI Influencer Studio and Motion
[14] https://higgsfield.ai/asset/all  Higgsfield asset library
[15] https://higgsfield.ai/ai/image?model=gpt_image_2  Higgsfield image composer
[16] https://higgsfield.ai/ai/video?model=seedance_2_5  Higgsfield video composer
[17] https://higgsfield.ai/marketing-studio  Higgsfield Marketing Studio
[18] https://higgsfield.ai/generate  Higgsfield Cinema Studio
