# Downscale images client-side before extraction

Receipt images are resized in the browser to a 1568px long edge (JPEG, shrink-only-if-larger) before being sent to `/api/extract`. A full-resolution phone photo is 3–5MB; base64-encoded in a JSON body it exceeds Vercel's ~4.5MB serverless request-body cap, so large photos fail outright — and batching 5–20 of them multiplies both the bandwidth and the per-image token cost. 1568px is chosen because the Anthropic API downsizes images to roughly that long edge anyway, so anything larger is bytes the model never sees.

## Consequences

- The app deliberately sends the model a degraded image. This is intended, not an oversight — a future reader should not "fix" it by sending originals.
- The threshold and the "does this image need resizing?" rule live in shared code; only the encode step is browser-specific (canvas), so the eval harness stays free of a Node image dependency. The harness therefore sends golden images at their stored size while the app resizes first. The golden set is 750×1624 screenshots, so the app would shrink them by 3.4% — a resampling difference rather than a resolution one, small enough that the committed baseline still describes production. A test pins that divergence at ≤5% and fails loudly if a golden case is added that is large enough to break the equivalence (a 4032px camera photo would be a 2.6× reduction).
- That also means the eval has **no coverage of the downscaled camera-photo path**, which is the case this change actually affects. Closing that gap needs real camera photos added to `golden-dataset/`; until then, the claim that 1568px is lossless rests on the API's own resizing behaviour rather than on measurement.
