# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start dev server (Express + Vite HMR) on port 3000
npm run build        # Vite SPA build → dist/, then esbuild bundles server.ts → dist/server.cjs
npm run start        # run production bundle (dist/server.cjs)
npm run lint         # tsc --noEmit (TypeScript type-check only; no ESLint configured)
npm run eval         # replay fixtures through /api/inr/event/v2, check correctness invariants
npm run judge <id>   # LLM-as-judge narrative quality score + pairwise delta (needs LLM key)
npm run judge:validate <id>  # synthetic-negative validity suite for the judge prompt
```

Requires either `GEMINI_API_KEY` in `.env.local` or a complete OpenAI-compatible config (`OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`). Without either, the app runs in simulator fallback mode with hardcoded deterministic story branches. Note: `npm run eval` works in simulator mode (calls localhost), but `npm run judge` requires a real LLM key — it calls the provider directly with no simulator fallback.

## Architecture

Full-stack TypeScript monolith: a single Express process serves both the REST API and the React SPA (via Vite middleware in dev, static files in prod).

### Backend — `server.ts`

Two API endpoints:

- `POST /api/inr/init` — stateless, just echoes `{ status: "ready", scenarioId }`.
- `POST /api/inr/event` — legacy core engine. Receives `{ scenarioId, state, memory, event }`, calls Gemini/OpenAI-compatible LLM with a structured JSON schema response, returns a full replacement `RuntimeState` + `MemoryLayers`. Falls back to `runSimulatorFallback()` on API key absence or error.
- `POST /api/inr/event/v2` — current frontend path. Receives `{ scenarioId, state, memory, event, llmConfig? }`, asks the LLM for typed operations, validates/applies them through `RuntimeController`, then returns updated state/memory. `llmConfig` wins over env vars only when all three OpenAI-compatible fields are present.

The server is **stateless** — the entire game state round-trips on every event call. No session storage or database.

### Frontend — `src/App.tsx`

Single large component (~1155 lines) holding all UI and state logic via `useState`. No sub-components are extracted. The full `gameState` and `memoryState` are replaced on each API response (not delta-patched).

**Event flow:** user picks a choice or types a custom event → `handleExecuteEvent()` POSTs to `/api/inr/event/v2` → response replaces `gameState` + `memoryState` → new `NarrativeTurn` appended to `history`.

The Custom API fields live in the header Settings modal and are frontend-only storage (`localStorage`) until an event is executed. Do not assume an external provider is active just because fields are configured; verify the `/api/inr/event/v2` request includes redacted `llmConfig` and the response `provider` is not `"simulator"`.

**UI layout (3-column when a scenario is active):**
- Left sidebar — world state, player state (HP bar, attributes, inventory, status effects), actors (relationship meters), quests
- Center panel — narrative timeline scroll, choice buttons (2-col grid), custom event input
- Right panel (4 tabs) — Turn Logs, Memory Layers (4 tiers), Telemetry, Sandbox/State-Editor (dev overrides)

### Data model — `src/types.ts`

```
RuntimeState
  world: WorldState       (day, weather, time, location, details{})
  player: PlayerState     (name, hp, maxHp, inventory[], statusEffects[], attributes{})
  characters: Record<id, CharacterState>  (relationship -100..100, goals, status, currentActivity)
  story: StoryState       (activeQuests: Quest[], completedEvents[], flags{})

MemoryLayers
  working[]    — immediate focus (short-lived)
  episode[]    — chronological event history
  semantic[]   — stable world facts
  archive[]    — cold/inactive backstory
```

### Scenarios — `src/scenarios.ts`

Four prebuilt scenarios with fully populated `initialState` and `initialMemory`:
- `cyberpunk-detective` — noir cyberpunk, Sector 7
- `steampunk-airship` — steampunk, airship Zephyr
- `cosmic-horror` — Lovecraftian mystery, Blackwood Manor
- `wuxia-trial` — 武侠解谜, 石壁遗珠 (poem-decipher puzzle in a hidden grotto)

Each scenario with keyword-matched simulator branches in `runSimulatorFallback()` also has hardcoded initial `playerChoices` in `src/App.tsx`. When adding a scenario, add its choices there too or it falls back to another scenario's choices.

### Evaluation tooling — `scripts/`

Local loop-engineering harness (no CI, no test framework — deliberate). Full workflow in README's "Loop Engineering Workflow" section.

- `scripts/eval.ts` — replays scripted events (`eval-scripts/<id>.json`) through `/api/inr/event/v2`, mirrors `RuntimeController.checkInvariants()` on the response. State injection: seeds from `scenario.initialState`, carries forward each turn. Output: `artifacts/eval/eval-<ts>.md` + `.jsonl`. Arg is a `scenarioId` string, not a file path.
- `scripts/judge.ts` — LLM-as-judge over the latest eval `.jsonl`. Scores 4 dims (Tension ×1.5, Coherence/Voice/Consistency ×1.0), normalised 0–100, verdict tiers. Default mode writes `judge-<ts>.md` + `judge-<ts>.json` (metadata). `--samples=N` writes `judge-noise-<ts>.md` only, with mean/stddev and no pairwise/meta pollution. On the next normal run, loads prev `.json` → prev eval `.jsonl` → one **pairwise A/B LLM call**. `rubricOverrides` in `eval-scripts/<id>.json` inject per-scenario Voice criteria.
- `scripts/judge-validate.ts` — discriminative-validity suite. Injects 6 known-bad mutations, asserts the judge's target dimension drops. Turns the judge from an unverifiable oracle into a falsifiable instrument. Run after editing the judge prompt.

Three agent skills document these workflows: `.claude/skills/inr-scenario-author`, `inr-eval-reviewer`, `inr-narrative-judge`.

### Styling

TailwindCSS v4 via Vite plugin (`@tailwindcss/vite`). Fonts: Inter, JetBrains Mono, Space Grotesk (Google Fonts, loaded in `index.css`). Icons: `lucide-react`. Transitions: `motion/react` (Framer Motion v12) with `AnimatePresence`.

## Known Issues / Notes

- `coverImagePrompt` field on each scenario is defined but no image generation is implemented.
- `/api/inr/event/v2` returns `provider: "gemini" | "openai-compat" | "simulator"`; the frontend mode indicator reads that field. If UI mode looks stale after server edits, restart `npm run dev` because Vite HMR does not reload `server.ts`.
- No test framework is configured.
- `npm run dev` is `tsx server.ts`; server-side edits require restarting the dev server. Vite HMR only refreshes frontend changes.
- When adding optional OpenAI-compatible env examples, keep `.env.example` values blank. Non-empty fake placeholders make fresh checkouts choose the OpenAI path and fail before Gemini fallback.
- Do not call `getGeminiClient()` before provider dispatch. It blocks OpenAI-compatible runs on machines without `GEMINI_API_KEY`.
- Chrome DevTools network exports include request bodies. Redact or delete raw request evidence before saving artifacts because `llmConfig.apiKey` is sent in the request body. Put screenshots and smoke evidence under `artifacts/<semantic-run-name>/`, not the repo root.
- Background dev servers started from Codex sandboxed `Start-Process` may be reaped after the command exits. For browser smoke tests, prefer a user-started `npm run dev` or explicitly approved unsandboxed process.
- `scripts/judge.ts` calls the LLM provider directly (not via localhost), so it loads `.env.local` with its own `dotenv.config()` and needs network reachability to the provider. Node's built-in `fetch()` ignores `http_proxy`/`https_proxy` env vars — on networks where Gemini is unreachable (e.g. mainland China), use the OpenAI-compat path instead of a proxy.
- Judge pairwise delta only triggers from the **second** judge run onward — it needs a prior `judge-<ts>.json` for the same scenario with a *different* `evalTs`. Run `npm run eval` again between judge runs to produce a new `evalTs`, or the two runs compare the same eval and skip pairwise.
- Judge score noise is now measured, not anecdotal: on `wuxia-trial` 8-turn replay with `--samples=5`, Tension/Coherence/Consistency each had stddev `0.4` on the 1-5 scale, Voice `0.0`, normalized `±4.3`. Treat changes inside that band as noise; prefer pairwise direction and large gaps.
- `CAUSALITY_BREAK` is not fixed by longer replay length. Post-fix 2-turn validate caught it once (`5→4`), but the 8-turn replay missed it (`5→5`), and `REPEAT_PHRASE` also missed on 8 turns. Treat short-replay results as rough-edged, not proof of robustness.
- Eval artifacts can silently use the OpenAI-compatible provider if `.env.local` has complete `OPENAI_*`. For simulator evidence, start the dev server with provider env vars blanked and verify `provider: "simulator"` in the `.jsonl`.
- On this Windows/npm setup, `npm run judge -- wuxia-trial --sample=5` is swallowed by npm into `npm_config_sample`; `judge.ts` rejects it, but older branches may accidentally run normal judge and create pairwise metadata.
- `judge:validate` can fail on malformed provider JSON without writing a report. Rerun the same validation step and only cite a completed `validate-<ts>.md`.
- A validation command may exit non-zero because mutations were missed, not because the harness crashed. Read the generated report before classifying the run.
