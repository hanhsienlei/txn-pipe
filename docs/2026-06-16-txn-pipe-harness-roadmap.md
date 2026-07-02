# txn-pipe → Agentic Harness: Phased Build Roadmap

*Created 2026-06-16. Companion to the architecture diagram (runtime path + learning loop / data flywheel).*

The goal isn't more features — it's to turn txn-pipe from "I called an AI API" into **"I engineered a reliable system around a probabilistic model."** Build in phases. Each phase is shippable on its own and proves one named capability to a recruiter or interviewer.

目標不是加功能，而是把 txn-pipe 從「我串了一個 AI API」變成「**我在一個機率性模型外面工程化出一個可靠系統**」。分階段做，每一階段都能單獨上線，且各自證明一項明確能力。

---

## Phase 0 — Baseline & honest metrics first
**Goal / 目標:** Measure what you have now, before changing anything. You can't claim improvement without a "before."
先量測現狀，沒有「before」就無法宣稱「進步」。

Build:
- [x] Assemble a **golden dataset**: 30–50 real receipts with hand-verified correct extraction (field-level ground truth). *(10 receipts in `golden-dataset/`.)*
- [x] Write a scoring script: field-level accuracy (% fields correct), not just "did it run." *(`lib/scoring.ts` + `scripts/score.ts`, run via `npm run eval`; unit-tested in `__tests__/scoring.test.ts`.)*
- [x] Record baseline: accuracy, avg fields wrong per receipt, token cost/receipt, p50/p95 latency. *(`evals/baseline.json`: **90.3%** field accuracy, **0.70** fields wrong/receipt, **$0.0075**/receipt, p50 **3.2s** / p95 **7.3s**. Weakest field: `date` at 40%.)*

**Proves / 證明:** You measure before you optimise — the opposite of vibe coding. 你會先量測再優化，這正是 vibe coding 的反面。

---

## Phase 1 — Schema-enforced extraction (structured outputs / tool use)
**Goal:** Make a malformed response *impossible*, instead of parsing free text and hoping.
讓壞格式「不可能」發生，而不是事後 parse 自由文字再祈禱。

Build:
- [x] Define the output contract as a JSON schema; mirror it with a `zod` schema for runtime type validation. *(`lib/schema.ts`; enum fields constrained to the known category/account/source/tax lists. JSON schema derived from the zod schema via `zodOutputFormat`, so the two can't drift.)*
- [x] Switch extraction to the Anthropic SDK **tool use / structured output** so the model returns to the schema. *(`lib/claude.ts` now uses `messages.parse` + `output_config.format`.)*
- [x] Reject + log any response that fails `zod` parsing (should now be near-zero). *(`parsed_output === null` → logs raw response + `stop_reason`, then throws. `evals/phase1.json`: 90.3% accuracy held, **0 malformed responses** — format risk eliminated by design; accuracy parity confirms no regression.)*

**Proves:** Format risk eliminated by design. Named technique: *constrained / structured decoding*. 用設計消除格式風險。

---

## Phase 2 — Validation layer & guardrails (business rules)
**Goal:** Catch *semantically* wrong data, not just badly-shaped data.
抓「語意上錯」的資料，而不只是「格式上錯」。

Build:
- [ ] Business rules: line items sum to total (± tolerance), date is plausible, currency valid, no negative quantities.
- [ ] Attach a **confidence score** per extraction; threshold low-confidence items for mandatory human review.
- [ ] Anything failing rules is flagged, never silently written downstream.

**Proves:** Guardrails / risk awareness. You think about *bad data*, not just the happy path. 護欄與風險意識——你會想到髒資料，不只 happy path。

---

## Phase 3 — Self-correction loop (reflection / validator-in-the-loop)
**Goal:** When validation fails, let the model react to the error and retry — bounded.
驗證失敗時，讓模型對錯誤訊息做反應並重試——但有界。

Build:
- [ ] On validation failure, feed the specific error back to the model and re-run extraction.
- [ ] **Cap retries (e.g. 2).** Beyond the cap → route to human, never loop forever.
- [ ] Log every retry: what failed, what changed, final outcome.

**Proves:** *Agentic* engineering with **bounded autonomy** — the model acts, but the harness holds the limits. agentic 工程＋有界自主：模型會行動，但 harness 守住邊界。

---

## Phase 4 — Eval harness in CI (the strongest signal)
**Goal:** Never change a prompt and pray. Gate every prompt change on the golden dataset.
改 prompt 不再靠祈禱——每次改動都用 golden dataset 把關。

Build:
- [ ] Wire the Phase 0 scoring script into **GitHub Actions**: run evals on every PR that touches a prompt.
- [ ] Fail the build if field accuracy drops below the current baseline (regression gate).
- [ ] Print an accuracy diff in the PR so reviewers see the impact.

**Proves:** This is the line that separates you from a vibe coder in interviews: *"I have evals gating prompt changes in CI."* 面試裡這句話直接把妳和 vibe coder 分開。

---

## Phase 5 — Human-gated side effects (irreversible-action safety)
**Goal:** Nothing irreversible happens without a human OK, and re-runs don't duplicate data.
不可逆的動作沒有人類同意不會發生，重跑也不會寫重複資料。

Build:
- [ ] Human approval step before any write to Google Sheets.
- [ ] **Idempotency:** a stable key per receipt so re-processing never double-writes.
- [ ] Audit log of who approved what, when.

**Proves:** You design for safe side effects and re-runs — production thinking. 為安全副作用與重跑而設計——production 思維。

---

## Phase 6 — The data flywheel (HITL learning loop)
**Goal:** Make every human correction make the next run more accurate.
讓每一次人類修正都讓下一次更準。

Build:
- [ ] Store `(input, AI draft, human-corrected)` triples in the **correction store**.
- [ ] At inference, retrieve the **top-k most similar** past corrections as dynamic few-shot examples (RAG-style few-shot) — don't dump everything into the prompt.
- [ ] Reuse the same store as a growing eval set for Phase 4.
- [ ] Track the accuracy curve over time and the falling human-edit rate.

**Proves:** *Human-in-the-loop + data flywheel + retrieval-augmented few-shot.* The system compounds. 系統會隨使用越用越準。

---

## Phase 7 — Observability / tracing
**Goal:** When something breaks, you can see exactly where.
出錯時看得到斷在哪。

Build:
- [ ] Trace every step: input, retrieved examples, model output, validation result, retries, cost, latency.
- [ ] A simple dashboard or log view (even a Sheets/Grafana-lite is fine for a portfolio).

**Proves:** Observability — debugging risk down, operability up. 可觀測性。

---

## Numbers to publish on the portfolio (no fabrication)
Pull these straight from your own runs:

- Extraction **accuracy curve over time** (week 1 vs week N) — proof the flywheel works.
- **Human-edit rate** dropping (avg fields edited/receipt: X → Y).
- **Cost per receipt** (tokens → $) and **p50/p95 latency**.
- (optional) **concurrency throughput** from a load test when N receipts upload at once.

每一項都從妳自己的執行紀錄拿，不要編。

---

## One-line positioning for the case study
> "I built a human-in-the-loop receipt-extraction pipeline that treats the LLM as an unreliable component — schema-enforced outputs, a validation + business-rules layer, a capped self-correction loop, evals gating every prompt change in CI, and a correction-driven data flywheel that lifted field accuracy from X% to Y%."

> 「我做了一條 human-in-the-loop 的收據抽取管線，把 LLM 當成不可靠零件來工程化——schema 強制輸出、驗證＋業務規則層、有上限的自我修正迴圈、CI 裡用 eval 把關每次 prompt 改動，以及由修正資料驅動的飛輪，把欄位準確率從 X% 拉到 Y%。」

**Suggested build order if time is tight:** Phase 0 → 1 → 4 → 2 → 6. (Baseline, lock the format, get the eval gate up early, then guardrails and the flywheel.)
