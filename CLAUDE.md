# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start dev server (Express + Vite HMR) on port 3000
npm run build        # Vite SPA build → dist/, then esbuild bundles server.ts → dist/server.cjs
npm run start        # run production bundle (dist/server.cjs)
npm run lint         # tsc --noEmit (TypeScript type-check only; no ESLint configured)
```

Requires either `GEMINI_API_KEY` in `.env.local` or a complete OpenAI-compatible config (`OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`). Without either, the app runs in simulator fallback mode with hardcoded deterministic story branches.

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

Three prebuilt scenarios with fully populated `initialState` and `initialMemory`:
- `cyberpunk-detective` — noir cyberpunk, Sector 7
- `steampunk-airship` — steampunk, airship Zephyr
- `cosmic-horror` — Lovecraftian mystery, Blackwood Manor

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
