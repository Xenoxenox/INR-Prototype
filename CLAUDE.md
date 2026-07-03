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

Requires `GEMINI_API_KEY` in `.env.local`. Without it, the app runs in simulator fallback mode with hardcoded deterministic story branches.

## Architecture

Full-stack TypeScript monolith: a single Express process serves both the REST API and the React SPA (via Vite middleware in dev, static files in prod).

### Backend — `server.ts`

Two API endpoints:

- `POST /api/inr/init` — stateless, just echoes `{ status: "ready", scenarioId }`.
- `POST /api/inr/event` — core engine. Receives `{ scenarioId, state, memory, event }`, calls Gemini (`gemini-2.0-flash`) with a structured JSON schema response, returns a full replacement `RuntimeState` + `MemoryLayers`. Falls back to `runSimulatorFallback()` on API key absence or error.

The server is **stateless** — the entire game state round-trips on every event call. No session storage or database.

### Frontend — `src/App.tsx`

Single large component (~1155 lines) holding all UI and state logic via `useState`. No sub-components are extracted. The full `gameState` and `memoryState` are replaced on each API response (not delta-patched).

**Event flow:** user picks a choice or types a custom event → `handleExecuteEvent()` POSTs to `/api/inr/event` → response replaces `gameState` + `memoryState` → new `NarrativeTurn` appended to `history`.

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
- `isSimulatorMode` is inferred client-side by checking if `executionLogs` contains `"API Error:"` — there's no explicit flag from the server.
- No test framework is configured.
