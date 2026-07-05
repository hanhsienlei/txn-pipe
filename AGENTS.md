<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# txn-pipe — agent contract

Receipt/transaction parser: image → Claude extraction → zod validation → Google Sheets.
Sole-user production app (live at txn-pipe.vercel.app). Correctness > features.

## Architecture

- `lib/claude.ts` — extraction. `client.messages.parse()` with a zod-derived structured-output constraint (`zodOutputFormat`), model `claude-sonnet-4-6`.
- `lib/schema.ts` — THE output contract. One zod schema used twice: sent to the model as a decoding constraint AND run as a runtime validator. Enum fields are locked to `lib/categories.ts` vocabularies, so out-of-vocabulary values are impossible.
- `lib/scoring.ts` + `scripts/score.ts` — eval harness: field accuracy, wrong fields/receipt, cost/receipt, p50/p95 latency against `golden-dataset/`.
- `lib/sheets.ts` — Google Sheets append + analytics reads.
- `app/api/{extract,sheets,auth,analytics}/route.ts` — API surface. `middleware.ts` gates everything behind the `txnpipe_auth` cookie (`AUTH_TOKEN` env).
- `evals/baseline.json` — committed accuracy baseline. CI (`.github/workflows/eval.yml`) blocks prompt/schema PRs that regress field accuracy beyond the tolerance.

## Commands

- `npm run dev` / `npm run build`
- `npm run test` (Vitest) · `npm run typecheck` · `npm run lint`
- `npm run eval -- --baseline evals/baseline.json --tolerance 0.05` — needs `ANTHROPIC_API_KEY`; ~US$0.08 per full run — ask before running.

## Invariants — do not break these

1. Every LLM output passes `ExtractionSchema.parse()` before ANY side effect (Sheets write, UI display). No exceptions.
2. Never modify `lib/schema.ts`, the system prompt in `lib/claude.ts`, `lib/categories.ts`, or `golden-dataset/` without running the eval and reporting the accuracy delta.
3. Never update `evals/baseline.json` silently — state the before/after numbers and why the change is acceptable.
4. New enum values (categories/accounts/sources) are added in `lib/categories.ts`, never inlined elsewhere.
5. Amounts stay `number` end-to-end as extracted; no silent currency conversion.
6. Don't weaken `middleware.ts` auth or add public paths.

## Adding a golden case

1. Drop `NNN.png` + `NNN.json` (expected `Entry[]`) into `golden-dataset/`.
2. Run the eval; review per-field diffs.
3. If accuracy drops: it's a prompt/schema problem or a bad label — investigate before touching the baseline.

## Definition of done

`typecheck` + `lint` + `test` green. Eval run (with delta reported) if anything in Invariant 2's list changed. Small PRs, one concern each.
