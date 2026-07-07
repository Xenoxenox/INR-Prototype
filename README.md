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
npm run eval        # replay manual fixtures → artifacts/eval/eval-<ts>.md
npm run eval:auto   # auto-derive events from each scenario's initial state
npx tsx scripts/eval.ts cyberpunk-detective   # single scenario
```

Reports are written to `artifacts/eval/` (gitignored). Compare two runs:

```bash
# before a change
npm run eval && cp artifacts/eval/$(ls -t artifacts/eval/*.md | head -1 | xargs basename) eval-before.md

# after the change
npm run eval
diff eval-before.md artifacts/eval/$(ls -t artifacts/eval/*.md | head -1 | xargs basename)
```
