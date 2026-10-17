# From character to ad

Build the ad in this order: character candidates → approved canonical image → supporting references → campaign shots → approved stills → approved clips → editing handoff.

This guide follows VibeField's [current workflow contract](CONTRACT.md). It describes the production decisions and review gates, not a claim that every feature demonstrated in the [research sources](research.md) exists in VibeField. The video path is image-to-video from a selected still. Voice cloning, source-video motion transfer, object replacement and timeline editing are outside that contract.

## 1. Define the character and the ad separately

Write a short appearance description with an adult age description, face, hair, build and distinctive marks. Keep the persona separate: audience, tone, subjects, words to use and claims to avoid.

In the campaign brief, record the product, audience, offer, approved facts and call to action. Choose the delivery format before composing shots. Use owned or authorized likenesses, product images and other reference material. A fictional persona is not evidence of real product use or expertise.

Prepare provider access before generating. Local project storage does not make generation local: submitted references and prompts leave the machine for the selected provider. Check provider availability and the video submission budget before an external job.

For Codex images, `gpt-image-2` is a requested model identifier. The exact executed model and reliable quality/size control remain unverified. Plan framing deliberately and inspect the actual returned image dimensions; do not assume a requested ratio or size was delivered.

## 2. Approve one visual identity

Generate portrait candidates or import an authorized image. Start with a readable face, visible hairline, relaxed expression and uncomplicated light. Compare candidates for the identity you want, not merely the most polished skin.

Review the chosen image in the character context, then explicitly promote it to canonical. The canonical is the approved identity reference for later work. A name, written description or seed is not a replacement for it.

Check the face at useful viewing size:

- Are the eyes, nose, jaw, hairline and distinctive marks clear and coherent?
- Are apparent age, body proportions and skin texture appropriate?
- Is the expression neutral enough to avoid copying the same smile into every scene?
- Are there defects you would otherwise carry into every shot?

Changing the canonical image or appearance changes the identity version under the contract. Persona edits do not. Previously selected stills and supporting references may then be stale; they must not silently represent the new identity.

## 3. Add only useful supporting references

Derive a sheet or angle directly from the canonical. Review it against the canonical before approving it as a reference. An expression study is a candidate to inspect, not an automatically trusted identity image.

VibeField's sheet recipe separates a face close-up from front and rear body views. Use it to clarify proportions and wardrobe, not to average several different faces. A generated back view is an inference, not a documented view of a real person.

For a different outfit, keep the character and write shot-specific wardrobe direction. Do not regenerate the identity just to change a jacket. Keep scene references free of people when possible, and treat products as product references rather than identity inputs.

The still compiler's intended order is:

1. Canonical image.
2. First approved current-version sheet or angle, if available.
3. Campaign product images.
4. Shot extras.
5. Empty scene plates last.

Only the first two positions define identity. A scene plate must be identified as a scene reference, not merely uploaded as an unlabeled extra. Confirm the actual roles and attachment order in the request preview. Resolve stale-reference and dropped-reference warnings before spending on a shot.

## 4. Plan one readable action per shot

An illustrative reusable-bottle ad could use an establishing shot at a workbench, a close view of opening the cap, and a held product view for the call to action. Each needs its own still and review. The current contract gives each shot one primary character.

Write the shot fields as direction someone could photograph:

| Field | Example direction |
| --- | --- |
| Scene | Workbench near a side window, background clear of other people |
| Action | Character rests one hand on the bottle and looks toward the camera |
| Camera | Eye-level medium shot, enough space below the hands, restrained perspective |
| Lighting | Soft daylight from camera left, weaker room fill, consistent bottle reflections |
| Wardrobe | Plain dark overshirt, sleeves clear of the product |
| Dialogue | Only the approved line, without invented personal experience |
| Motion | A small glance toward the bottle, then back to camera; camera stays still |

Camera and lens descriptions communicate intent, not guaranteed physical settings. Give the product a plausible scale, hand contact and readable silhouette. Leave space for editorial text. Realistic detail comes from light, material and action; extra sharpness or random grain will not fix a floating hand.

## 5. Review and select the still

Generate the still from the clean canonical and selected references. Inspect it beside the canonical, not beside the last failed result.

Record a decision of approved, rejected or needs changes. Use pass, fail, unsure or not applicable for individual checks. A useful checklist is:

| Check | What to inspect |
| --- | --- |
| Identity | Face shape, eyes, jaw, hairline, age and distinctive marks |
| Body and action | Anatomy, hand side, fingers, contact, weight and a plausible starting pose |
| Wardrobe | Correct clothing, accessories and fabric behavior |
| Product | Shape, scale, orientation, logo, visible words and contact with the hand |
| Composition | Intended crop, camera height, background and space for overlays |
| Light and texture | Matching light direction, reflections, shadows, skin and material detail |

Record specific correction notes, such as "The supporting hand floats above the table" rather than "make it more realistic." Needs-changes notes guide the next shot request; they do not redefine the character.

Only select an approved still belonging to this exact shot. A familiar face in the wrong composition is not ready for animation. If the identity version changed, make and review a current-version still first. Do not pay for video hoping it will repair the still.

## 6. Animate the selected still

Preview the video request. Its start frame must be the exact approved shot still, not the character sheet or a nearby library image. The image already supplies the face, outfit, product and setting. Use the motion request for action, timing and camera movement.

Check the selected model's supported duration, resolution and start-frame capability. Audio requires explicit support and intent. A saved dialogue field does not itself enable audio, preserve a voice or guarantee the exact words.

Confirm the external submission and available budget. Every generation or resubmission is an explicit action. VibeField's contract prohibits automatic paid retries for images, text and video, including retries triggered by a low quality label.

Image-to-video invents motion from a still. Motion transfer instead needs an existing performance video and a provider operation that can use it. Naming a video model or writing "copy this motion" does not turn the current route into motion transfer.

## 7. Watch the whole clip

Play the result from beginning to end with sound when present. Pause at the beginning, middle, ending and difficult interactions.

- Compare identity during head turns, smiles, occlusion and movement, not just the opening frame.
- Inspect fingers, hand contact, product geometry and labels as they move.
- Check for flicker, face changes, unnatural acceleration, impossible camera movement and unwanted cuts.
- Listen to the actual words, pronunciation, voice and delivery. Check mouth timing against the sound. A transcript alone cannot approve lip synchronization.
- Confirm there is a usable section long enough for the intended edit.

Approve and select the video only after this review. Keep rejected takes and their notes for diagnosis. A successful job status means media was produced, not that the take is usable.

## Recover without paying twice

| Symptom | Next decision |
| --- | --- |
| Face drifts in a new still | Check the canonical, reference roles and version. Remove a conflicting reference and create a new candidate from the clean master. |
| Identity is right but framing or product is wrong | Correct shot direction and still selection. Do not replace the character identity. |
| A request times out with a known provider job ID | Resume status checks or download of that job. Do not submit another generation merely to retrieve its result. |
| Submission outcome is unknown | Reconcile the existing job. Use a verified provider job ID if available, or explicitly resolve the failure before deciding on a new submission. |
| A take is unusable | Record the reason, change a specific input and explicitly choose whether to spend on another job. |

Cancellation does not establish that a provider stopped work or refunded a charge. Under the contract, attempted video submissions still count toward the cap, including failed or ambiguous attempts. A new submission gets its own job and request snapshot.

## 8. Hand off to an editor

Export the selected approved media and manifest. Check shot order, missing shots and provenance before treating the package as complete. The handoff contains source clips and generation records, not a finished edited advertisement.

In an editor, trim unusable beginnings and endings, set the pace, add accurate captions and product typography, mix authorized voice/music/effects, and check the final delivery crop. Review the assembled ad for continuity, readable labels, exact claims and a clear call to action. Keep the clean selected source clips when making finishing changes.
