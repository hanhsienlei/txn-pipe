# txnpipe — Domain Glossary

## Golden Dataset
A fixed set of 10–15 hand-verified receipts with expected extraction outputs (`amount`, `date`, `category`/`source` scored exactly; `expense`/`income` description scored on format only). Assembled once by the builder, never modified by user interactions. Serves as the immutable eval anchor for detecting regression.

## Correction
A user edit to an AI draft extraction. Signals that the model got something wrong. Stored as a `(input, AI draft, human-corrected)` triple and used to update prompt context.

## Candidate Pool
Extractions accepted by the user without any edit. Treated as likely-correct but **not** promoted to the Golden Dataset — kept separate to avoid contamination between training signal and eval signal.

## Date Format
ISO 8601 (`YYYY-MM-DD`) used uniformly across `ExpenseEntry`, `IncomeEntry`, the extraction prompt, and Google Sheets parsing. Date scoring normalizes to year/month/day numerically before comparing (not string equality) to avoid penalizing the model for format rather than correctness.

## Correction Store
A persistent store of `(image_path, ai_draft, human_corrected)` triples. Written when a user edits a draft. Indexed by an embedding of the AI draft JSON for similarity retrieval.

## Few-Shot Retrieval Loop
At inference: (1) extract a first-pass draft, (2) embed the draft JSON, (3) retrieve top-k most similar past corrections, (4) re-run extraction with those corrections injected as few-shot examples. Only runs when corrections exist in the store.

## Scoring
Field-level accuracy against the Golden Dataset. Exact match on `amount`, `date`, `category`/`source`. Format-only match (not semantic) on `expense`/`income` description text.
