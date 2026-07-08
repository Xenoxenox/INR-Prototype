---
name: inr-eval-reviewer
description: Run and interpret the INR eval harness to assess correctness and narrative quality. Use when the user wants to run eval, review eval results, fix invariant failures, compare before/after a feature change, or interpret narrative log output. Project is at F:\Interactive Narrative Runtime\INR-Prototype.
---

# inr-eval-reviewer

The INR eval harness replays scripted events through `/api/inr/event/v2` and produces a
markdown report covering **correctness** (invariants) and **narrative log** (human review).
Requires `npm run dev` running on `:3000`.

## Commands

```bash
npm run eval              # run all eval-scripts/*.json (manual fixtures)
npm run eval:auto         # auto-derive events from each scenario's initialState
npx tsx scripts/eval.ts cyberpunk-detective   # single scenario
```

Reports → `artifacts/eval/eval-<ts>.md` + `eval-<ts>.jsonl` (gitignored).

## Reading the report

### Correctness table

```
| Scenario            | Turn | Event                        | Invariants | Provider  |
|---------------------|------|------------------------------|------------|-----------|
| cosmic-horror       | 2    | Descend into the passage...  | ✗ Duplicate inventory: Torn Diary Page x2 | simulator |
```

**Invariant checks (mirrors `RuntimeController.checkInvariants()`):**

| Check | Condition |
|-------|-----------|
| HP bounds | `0 ≤ player.hp ≤ player.maxHp` |
| Relationship bounds | `−100 ≤ character.relationship ≤ 100` |
| Inventory duplicates | `inventory.length === new Set(inventory).size` |

**Rejected operations** are surfaced as `"Rejected <OpType>: <reason>"` in `runtimeOperations`.
Count appears in the report header.

### Narrative log

Below the correctness table. Read each turn's narrative for:
- Does it continue coherently from the prior turn?
- Does tone match the scenario genre?
- Do the offered choices feel meaningful?

## Failure taxonomy and fixes

### Invariant failure — duplicate inventory

**Symptom:** `✗ Duplicate inventory items: X, X`  
**Cause:** Simulator branch `push()` fires on multiple events matching the same keyword.  
**Fix:** Guard in `server.ts`:
```ts
if (!nextState.player.inventory.includes('Item Name'))
  nextState.player.inventory.push('Item Name');
```

### Invariant failure — HP / relationship out of bounds

**Symptom:** `✗ HP out of bounds: 110/100` or `✗ viktor relationship=101`  
**Cause:** Simulator arithmetic missing `Math.min`/`Math.max` clamp.  
**Fix:** Wrap in `server.ts`:
```ts
nextState.player.hp = Math.min(nextState.player.maxHp, Math.max(0, nextState.player.hp + delta));
nextState.characters.id.relationship = Math.min(100, Math.max(-100, ... + delta));
```

### Rejected operations (LLM path only)

**Symptom:** `Rejected operations: N` in report header  
**Cause:** LLM emitted an operation the `OperationValidator` rejected (bad characterId, unknown questId, etc.)  
**Fix:** Check `OperationValidator.ts` for the rejection reason; update the LLM system prompt in `server.ts` to constrain the operation or widen the validator.

### Keyword collision — Turn N+1 narrative identical to Turn N (simulator path only)

**Symptom:** The eval narrative log shows the same story text for two consecutive turns
despite different events.  e.g. Turn 1 "辨认碑文" and Turn 2 "触碰符文" both produce the
"举起火折，凑近石壁…" paragraph.

**Cause:** A compound word (`诗句`, `剑气`) in the Turn 2 event contains a broader
single-character keyword (`诗`, `剑`) from an earlier branch.  The `if`/`else if` chain
matches the first branch before reaching the correct one.

**Fix in `server.ts`:** Reorder branches most-specific-first — e.g. `符文`/`机关`/`触碰`
before `石壁`/`诗`/`碑文`.

**Fix in `eval-scripts/<id>.json`:** Narrow the event text to avoid compound words —
e.g. `按方位顺序触碰发光的符文机关` instead of `按照诗句暗示的方位顺序触碰石壁上的符文机关`.

### Narrative quality issues

Narrative log is for **human review only** — no automated score. Flag turns where:
- Narrative ignores the player's action entirely
- Character behaves inconsistently with their `relationship` value
- Scenario tone drifts (e.g. cosmic horror sounds like cyberpunk)

These point to LLM prompt issues in `server.ts` (`systemPrompt` string).

## Before/after diff workflow

```bash
# Before a feature change
npm run eval
cp "$(ls -t artifacts/eval/*.md | head -1)" eval-before.md

# Make the change, then:
npm run eval
diff eval-before.md "$(ls -t artifacts/eval/*.md | head -1)"
```

Lines added (`+`) show new narrative or fixed invariants.  
Lines removed (`−`) show regressions.
