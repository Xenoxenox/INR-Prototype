---
name: inr-scenario-author
description: Author INR scenarios and simulator branches for the Interactive Narrative Runtime Prototype. Use when the user wants to add a new scenario, extend an existing one, add simulator keyword branches, balance character relationships or quest flow, or update initialState/initialMemory. Project is at F:\Interactive Narrative Runtime\INR-Prototype.
---

# inr-scenario-author

You're authoring content for the **INR Prototype** — a stateless LLM-driven narrative engine.
Game-specific content lives in two places: `src/scenarios.ts` (data) and the `runSimulatorFallback()`
block in `server.ts` (deterministic keyword branches for offline play/eval).

## Where things live

| File | What to edit |
|------|-------------|
| `src/scenarios.ts` | `SCENARIOS` array — add/extend `Scenario` objects |
| `server.ts` | `runSimulatorFallback()` — add keyword branches for the new scenario |
| `eval-scripts/<id>.json` | Eval fixture — events that hit the new simulator branches |
| `src/types.ts` | Read-only reference — do not modify |

## Scenario skeleton

```ts
{
  id: 'kebab-case-id',
  title: 'Display Title',
  genre: 'Genre Label',
  description: 'One-sentence hook shown on the scenario card.',
  coverImagePrompt: 'Stable-Diffusion-style prompt (not implemented, placeholder only)',
  initialState: {
    world: { currentDay: 1, weather: '', time: '', location: '', details: {} },
    player: { name: '', hp: 100, maxHp: 100, inventory: [], statusEffects: [], attributes: {} },
    characters: {
      npc_id: { name: '', relationship: 0, goals: '', status: '', currentActivity: '' }
    },
    story: { activeQuests: [{ id: '', title: '', description: '', status: 'active' }], completedEvents: [], flags: {} }
  },
  initialMemory: {
    working: [],   // immediate focus items
    episode: [],   // chronological event history
    semantic: [],  // stable world facts
    archive: []    // cold backstory
  }
}
```

**Relationship range:** −100 to 100. Start between −20 and 60 for interesting LLM delta space.  
**HP:** set `hp < maxHp` if the opening scene should convey pressure.

## Simulator branch pattern

Each branch in `runSimulatorFallback()` follows this shape — mirror an existing scenario's
block (`cyberpunk-detective`, `steampunk-airship`, `cosmic-horror`) for the full structure:

```ts
} else if (scenarioId === 'your-scenario-id') {
  if (cleanEvent.includes('keyword1') || cleanEvent.includes('keyword2')) {
    narrative = "...";
    nextState.player.hp = Math.max(10, nextState.player.hp - N);
    nextState.characters.npc_id.relationship = Math.min(100, ... + delta);
    // guard inventory pushes: if (!nextState.player.inventory.includes('Item')) push(...)
    runtimeOperations = ["..."];
  } else {
    narrative = `Generic fallback for "${event}".`;
    nextState.player.hp = Math.max(10, nextState.player.hp - 2);
    runtimeOperations = ["State Update: no specific trigger"];
  }
  nextMemory.episode.push(`Player executed: ${event}`);
  return { provider: "simulator", narrative, state: nextState, memory: nextMemory,
           playerChoices: [...], runtimeOperations, executionLogs: [...executionLogs, "State Commited successfully."] };
}
```

**Inventory guard:** always check `includes()` before `push()` — duplicate items fail the eval invariant.

### Keyword ordering trap

Single-character keywords (`诗`, `书`, `剑`) will match compound words (`诗句`, `书架`, `剑气`).
If a later-level event contains a compound word that triggers an earlier branch, the player
gets the wrong narrative.  Two rules prevent this:

1. **Order more-specific branches first.**  Place `符文`/`机关`/`触碰` before `石壁`/`诗`/`碑文`
   so compound matches ("触碰……符文") reach the right branch.
2. **Keep eval fixture events narrow.**  Prefer `按方位顺序触碰发光的符文机关` over
   `按照诗句暗示的方位顺序触碰石壁上的符文机关` — the latter contains `诗` and `石壁`,
   leaking into the earlier branch even after reordering.

### Frontend initial choices

`src/App.tsx` `handleSelectScenario()` hardcodes a ternary chain for initial `playerChoices`.
Every new scenario MUST add its own branch or the cosmic-horror fallback choices will appear
instead.  Match the four choices to your simulator's `playerChoices` return value.

## Authoring checklist

- [ ] Scenario object added to `SCENARIOS` array in `src/scenarios.ts`
- [ ] Simulator branch added to `runSimulatorFallback()` for the new `scenarioId`
- [ ] Simulator branches ordered most-specific-first to avoid keyword collision
- [ ] At least one `else` fallback branch in the simulator block
- [ ] All inventory `push()` calls guarded against duplicates
- [ ] `eval-scripts/<id>.json` created with events that target the new keyword branches
- [ ] `eval-scripts/<id>.json` events are narrow — avoid compound words containing earlier-branch keywords
- [ ] `src/App.tsx` `handleSelectScenario()` — add `playerChoices` ternary branch for the new `scenarioId`
- [ ] `npm run eval` passes 0 invariant failures for the new scenario
