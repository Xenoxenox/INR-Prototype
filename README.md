<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f69577cd-33e9-4ef1-be26-708ff0972ae6

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Local Evaluation

Requires the dev server running on `:3000`.

```bash
npm run eval                                  # replay all manual fixtures
npm run eval:auto                             # auto-derive events from initialState
npx tsx scripts/eval.ts cyberpunk-detective   # single scenario
```

Reports → `artifacts/eval/eval-<ts>.md` + `eval-<ts>.jsonl` (gitignored).  
Checks: schema validity, HP/relationship bounds, inventory duplicates.

## Narrative Quality Judge

Requires a real LLM key (no simulator fallback) — set `GEMINI_API_KEY` or
the three `OPENAI_*` vars in `.env.local`. Run **after** `npm run eval`.

```bash
npm run judge wuxia-trial      # score latest eval replay, write judge-<ts>.md
```

Scores 4 dimensions (Tension ×1.5, Coherence, Voice, Consistency) on a
1–5 scale, normalised to 0–100. Verdict tiers: `accepted` ≥80 / `repairable`
60–79 / `needs_review` 40–59 / `low_quality` <40.

On the second run, a **pairwise delta** section is appended automatically:
the judge compares the current eval replay against the previous one and
reports A / B / tie per dimension — without relying on noisy absolute score diffs.

Reports → `artifacts/judge/judge-<ts>.md` + `judge-<ts>.json` (gitignored).

### Judge validity suite

Injects 6 known-bad mutations (choice homogenisation, early tension exhaust,
explicit emotion, genre drift, phrase repetition, causality break) and checks
that the judge detects each one. Use after editing the judge system prompt.

```bash
npm run judge:validate wuxia-trial   # exit 0 = all mutations caught
```

## Loop Engineering Workflow

Full cycle for iterating on a scenario or simulator branch:

```bash
# 1. Make a change (edit server.ts simulator branch or src/scenarios.ts)

# 2. Correctness check
npm run eval wuxia-trial

# 3. Narrative quality score + pairwise delta vs last run
npm run judge wuxia-trial
# → artifacts/judge/judge-<ts>.md
# Look for: verdict, blockingIssues, Delta section (A/B/tie per dimension)

# 4. If repairable — fix the flagged issue, repeat from step 1
# If accepted — commit

# Optional: verify judge prompt sensitivity after rubric changes
npm run judge:validate wuxia-trial
```
