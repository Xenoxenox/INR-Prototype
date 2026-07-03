// e2e smoke: POST real scenario state to /api/inr/event/v2, verify runtime-owned state comes back.
// Run with dev server up: npx tsx src/runtime/smoke.ts
import assert from "assert";
import { SCENARIOS } from "../scenarios";

const scenario = SCENARIOS.find((s) => s.id === "cyberpunk-detective")!;

const res = await fetch("http://localhost:3000/api/inr/event/v2", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    scenarioId: scenario.id,
    state: scenario.initialState,
    memory: scenario.initialMemory,
    event: "Decrypt the Saito Datacore immediately inside the noodle alley",
  }),
});
assert.equal(res.status, 200);
const data = await res.json();

assert.ok(typeof data.narrative === "string" && data.narrative.length > 0, "narrative present");
assert.ok(data.state?.player, "state present");
assert.ok(data.state.player.hp >= 0 && data.state.player.hp <= data.state.player.maxHp, "HP within bounds");
assert.ok(Array.isArray(data.playerChoices) && data.playerChoices.length > 0, "choices present");
assert.ok(Array.isArray(data.runtimeOperations), "runtimeOperations present");
assert.ok(data.memory.episode.length >= scenario.initialMemory.episode.length, "episode memory appended or kept");

const mode = data.executionLogs?.some((l: string) => l.includes("API Error")) ? "SIMULATOR-FALLBACK" : "LLM";
console.log(`✅ e2e smoke passed (mode: ${mode})`);
console.log(`   narrative: ${data.narrative.slice(0, 80)}...`);
console.log(`   hp: ${scenario.initialState.player.hp} -> ${data.state.player.hp}`);
console.log(`   runtimeOperations:`);
for (const op of data.runtimeOperations) console.log(`     - ${op}`);
