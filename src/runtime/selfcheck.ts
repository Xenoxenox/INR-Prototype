// Minimal runnable check for runtime modules (no test framework configured).
// Run: npx tsx src/runtime/selfcheck.ts
import assert from "assert";
import { StateReducer } from "./StateReducer";
import { OperationValidator, isOperation } from "./OperationValidator";
import { RuntimeController } from "./RuntimeController";
import { RuntimeState, MemoryLayers } from "../types";

const baseState = (): RuntimeState => ({
  world: { currentDay: 1, weather: "Rain", time: "Night", location: "Sector 7", details: {} },
  player: { name: "Kaelen", hp: 50, maxHp: 100, inventory: ["Datacore"], statusEffects: [], attributes: { tech: 8 } },
  characters: { aria: { name: "A.R.I.A.", relationship: 95, goals: "", status: "ok", currentActivity: "" } },
  story: { activeQuests: [{ id: "q1", title: "T", description: "D", status: "active" }], completedEvents: [], flags: {} },
});
const baseMemory = (): MemoryLayers => ({ working: [], episode: [], semantic: [], archive: [] });

const reducer = new StateReducer();
const validator = new OperationValidator();

// DamagePlayer reduces HP correctly
assert.equal(reducer.reduce(baseState(), { type: "DamagePlayer", amount: 10, source: "test" }).player.hp, 40);

// HealPlayer clamps at maxHp
assert.equal(reducer.reduce(baseState(), { type: "HealPlayer", amount: 999 }).player.hp, 100);

// ModifyRelationship clamps at [-100, 100]
assert.equal(reducer.reduce(baseState(), { type: "ModifyRelationship", characterId: "aria", delta: 50 }).characters.aria.relationship, 100);
assert.equal(reducer.reduce(baseState(), { type: "ModifyRelationship", characterId: "aria", delta: -300 }).characters.aria.relationship, -100);

// Reducer is pure — input state untouched
const s0 = baseState();
reducer.reduce(s0, { type: "DamagePlayer", amount: 10, source: "test" });
assert.equal(s0.player.hp, 50);

// RemoveItem validation fails when item absent
assert.equal(validator.validate({ type: "RemoveItem", itemId: "Ghost" }, baseState()).valid, false);
assert.equal(validator.validate({ type: "RemoveItem", itemId: "Datacore" }, baseState()).valid, true);

// Negative amounts rejected
assert.equal(validator.validate({ type: "DamagePlayer", amount: -5, source: "x" }, baseState()).valid, false);
assert.equal(validator.validate({ type: "HealPlayer", amount: -5 }, baseState()).valid, false);

// Unknown character / quest rejected
assert.equal(validator.validate({ type: "ModifyRelationship", characterId: "ghost", delta: 1 }, baseState()).valid, false);
assert.equal(validator.validate({ type: "UpdateQuestStatus", questId: "nope", status: "completed" }, baseState()).valid, false);

// Invariant proof: lethal damage (amount > hp) is rejected, state stays valid
const rt = new RuntimeController(baseState(), baseMemory());
const { applied, rejected } = rt.applyOperations([
  { type: "DamagePlayer", amount: 9999, source: "overkill" },
  { type: "HealPlayer", amount: 10 },
]);
assert.equal(applied.length, 1);
assert.equal(rejected.length, 1);
assert.equal(rt.getState().player.hp, 60);
assert.ok(rt.checkInvariants());

// isOperation guards malformed LLM output
assert.ok(isOperation({ type: "SetFlag", key: "k", value: true }));
assert.ok(!isOperation({ type: "SetFlag", key: "k" }));
assert.ok(!isOperation({ type: "Explode" }));
assert.ok(!isOperation(null));

console.log("✅ runtime selfcheck: all assertions passed");
