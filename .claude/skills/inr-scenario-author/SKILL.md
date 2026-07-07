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

## Authoring checklist

- [ ] Scenario object added to `SCENARIOS` array in `src/scenarios.ts`
- [ ] Simulator branch added to `runSimulatorFallback()` for the new `scenarioId`
- [ ] At least one `else` fallback branch in the simulator block
- [ ] All inventory `push()` calls guarded against duplicates
- [ ] `eval-scripts/<id>.json` created with events that target the new keyword branches
- [ ] `npm run eval` passes 0 invariant failures for the new scenario
