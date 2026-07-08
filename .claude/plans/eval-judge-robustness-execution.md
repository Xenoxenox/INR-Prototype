# Eval+Judge Robustness Execution

Branch: `feat/eval-judge-robustness`  
Base: `main` @ `439fe75`  
Executor: Codex  
Date: 2026-07-08

## Step Results

| Step | Status | Evidence |
|---|---|---|
| 1 Branch | PASS | `feat/eval-judge-robustness` created from `439fe75`. |
| 2 Task A fix | PASS | `server.ts` wuxia block now uses default choices/working, with Branch A overriding post-opening choices/working only. `npm run lint` passed. |
| 3 Post-fix 2-turn eval | PASS | `artifacts/eval/eval-2026-07-08T06-34-12.jsonl`: 2 turns, provider `simulator`, both `invariants: []`; T1 choices are old array, T2 choices are post-opening array. |
| 4 Pairwise proof | PASS | `artifacts/judge/judge-2026-07-08T06-35-17.md` + `.json`; meta evalTs `2026-07-08T06-34-12`, delta vs `eval-2026-07-08T01-54-00`. |
| 5 2-turn validate baseline | PASS | `artifacts/judge/validate-2026-07-08T06-43-18.md`: 6/6 caught. |
| 6 Task B branches + fixture | PASS | Added T3-T8 wuxia simulator branches and `eval-scripts/wuxia-trial-long.json`. `npm run lint` passed; collision check passed. |
| 7 8-turn eval | PASS | `artifacts/eval/eval-2026-07-08T06-47-33.jsonl`: 8 turns, provider `simulator`, invariant failures 0, rejected total 0, default marker hits 0, unique choice sets 8. |
| 8 Length experiment | PASS measurement | `artifacts/judge/validate-2026-07-08T06-52-10.md`: 4/6 caught; `CAUSALITY_BREAK` still MISSED. |
| 9 Samples mode | PASS | `artifacts/judge/judge-noise-2026-07-08T07-01-54.md`: 5/5 samples; `judge-*.json` count unchanged at 3. Typo guard `--sample=5` exits 1 and creates no JSON meta. |

## Pairwise Delta

Source: `artifacts/judge/judge-2026-07-08T06-35-17.md`

| Dimension | Winner | Confidence |
|---|---|---|
| Tension | B | clear |
| Coherence | B | strong |
| Voice | B | slight |
| Consistency | B | clear |
| Overall | B | - |

Success criterion A met: Tension winner = B and overall winner = B.

## Validate Tables

2-turn post-fix reference: `artifacts/judge/validate-2026-07-08T06-43-18.md`

| Mutation | Target dim | Baseline | Mutated | Caught? |
|---|---|---:|---:|---|
| CHOICE_HOMOGENOUS | Tension | 5 | 2 | yes |
| TENSION_EXHAUST | Tension | 5 | 1 | yes |
| EMOTION_EXPLICIT | Voice | 5 | 2 | yes |
| GENRE_DRIFT | Voice | 5 | 2 | yes |
| REPEAT_PHRASE | Voice | 5 | 4 | yes |
| CAUSALITY_BREAK | Coherence | 5 | 4 | yes |

8-turn length experiment: `artifacts/judge/validate-2026-07-08T06-52-10.md`

| Mutation | Target dim | Baseline | Mutated | Caught? |
|---|---|---:|---:|---|
| CHOICE_HOMOGENOUS | Tension | 4 | 3 | yes |
| TENSION_EXHAUST | Tension | 4 | 3 | yes |
| EMOTION_EXPLICIT | Voice | 5 | 2 | yes |
| GENRE_DRIFT | Voice | 5 | 2 | yes |
| REPEAT_PHRASE | Voice | 5 | 5 | MISSED |
| CAUSALITY_BREAK | Coherence | 5 | 5 | MISSED |

Readout B: longer 8-turn replay did not restore `CAUSALITY_BREAK` detection in this run. It regressed from 2-turn post-fix caught to 8-turn missed. `REPEAT_PHRASE` also missed on the 8-turn run.

## Noise Stats

Source: `artifacts/judge/judge-noise-2026-07-08T07-01-54.md`

| Metric | Mean | Stddev | Min | Max |
|---|---:|---:|---:|---:|
| Tension | 4.8 | 0.4 | 4.0 | 5.0 |
| Coherence | 4.8 | 0.4 | 4.0 | 5.0 |
| Voice | 5.0 | 0.0 | 5.0 | 5.0 |
| Consistency | 4.8 | 0.4 | 4.0 | 5.0 |
| normalized | 96.9 | 4.3 | 91.1 | 100.0 |

Success criterion C met: dimension and normalized stddevs are recorded. Samples mode wrote only `judge-noise-*.md`; no `judge-*.json` meta was created.

## Deviations

- First post-fix eval accidentally used the OpenAI-compatible provider because `.env.local` contained complete `OPENAI_*`; it was not used as evidence. Re-ran with provider env vars blanked for server startup, producing simulator eval `eval-2026-07-08T06-34-12`.
- First 2-turn validate attempt failed on an LLM JSON parse at `CAUSALITY_BREAK`; reran successfully and used `validate-2026-07-08T06-43-18` as the reference.
- `npm run judge -- wuxia-trial --sample=5` is swallowed by npm into `npm_config_sample` on this Windows/npm setup. The first check therefore ran normal judge and briefly created `judge-2026-07-08T06-55-20.*`; those two generated artifacts were deleted, and `judge.ts` now rejects both argv typo flags and npm-swallowed `npm_config_sample` before any LLM call.
- The 8-turn validate command exited 1 because missed mutations are represented as command failure; this is a measured result, not a harness crash.

## Out-of-plan Findings

- `CAUSALITY_BREAK` is not reliably recovered by longer context on this fixture; the current mutation still scored Coherence 5 on the 8-turn replay.
- `REPEAT_PHRASE` also missed on the 8-turn replay, despite being caught on the 2-turn post-fix baseline.

## Changed Files

- `server.ts`
- `scripts/judge.ts`
- `eval-scripts/wuxia-trial-long.json`
- `.claude/plans/eval-judge-robustness-execution.md`