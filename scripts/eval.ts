// scripts/eval.ts — INR replay harness (correctness + narrative log)
// ponytail: no test framework — this is a local loop-engineering tool, not CI.
// Patterns borrowed from RPG-Harness: state injection + typed inputs + jsonl replay log.
//
// Usage (requires `npm run dev` running on :3000):
//   npx tsx scripts/eval.ts                 # run every eval-scripts/*.json
//   npx tsx scripts/eval.ts <scenarioId>    # run one fixture, or auto-derive if none exists
//
// Output: eval-latest.md (human review) + eval-latest.jsonl (raw, diff/replay).

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { SCENARIOS } from "../src/scenarios";
import type { RuntimeState, MemoryLayers, Scenario } from "../src/types";

const BASE_URL = "http://localhost:3000";
const EVAL_DIR = join(process.cwd(), "eval-scripts");
const ARTIFACTS_DIR = join(process.cwd(), "artifacts", "eval");

// ponytail: colons invalid on Windows filenames; replace with hyphens
function runTimestamp(): string {
  return new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
}

function evalPaths(ts: string) {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  return {
    md: join(ARTIFACTS_DIR, `eval-${ts}.md`),
    jsonl: join(ARTIFACTS_DIR, `eval-${ts}.jsonl`),
  };
}

interface EvalScript {
  scenarioId: string;
  mode?: "manual" | "auto";
  events?: string[];
}

interface V2Response {
  provider: string;
  narrative: string;
  state: RuntimeState;
  memory: MemoryLayers;
  playerChoices: string[];
  runtimeOperations: string[];
  executionLogs: string[];
}

interface TurnResult {
  scenarioId: string;
  turn: number;
  event: string;
  provider: string;
  narrative: string;
  choices: string[];
  invariants: string[]; // failures; empty array = pass
  rejectedCount: number;
}

// Correctness — mirrors RuntimeController.checkInvariants(), run against the returned state.
function checkInvariants(state: RuntimeState): string[] {
  const fail: string[] = [];
  const { hp, maxHp, inventory } = state.player;
  if (hp < 0 || hp > maxHp) fail.push(`HP out of bounds: ${hp}/${maxHp}`);
  for (const [id, ch] of Object.entries(state.characters)) {
    if (ch.relationship < -100 || ch.relationship > 100)
      fail.push(`${id} relationship=${ch.relationship} out of -100..100`);
  }
  if (inventory.length !== new Set(inventory).size)
    fail.push(`Duplicate inventory items: ${inventory.join(", ")}`);
  return fail;
}

// Auto mode — derive probe events from a scenario's initialState (no LLM, no hardcoding per scenario).
function deriveAutoEvents(s: Scenario): string[] {
  const { world, player, characters, story } = s.initialState;
  const events = [`Survey ${world.location} and assess the situation`];
  const firstChar = Object.values(characters)[0];
  if (firstChar) events.push(`Approach ${firstChar.name} and start a conversation`);
  events.push(
    player.inventory.length > 0
      ? `Examine the ${player.inventory[0]}`
      : `Search the surroundings for anything useful`
  );
  const quest = story.activeQuests[0];
  if (quest) events.push(`Take the next step toward: ${quest.title}`);
  return events;
}

async function runScript(script: EvalScript): Promise<TurnResult[]> {
  const scenario = SCENARIOS.find((s) => s.id === script.scenarioId);
  if (!scenario) throw new Error(`Unknown scenarioId: ${script.scenarioId}`);

  const events =
    script.mode === "auto" || !script.events?.length
      ? deriveAutoEvents(scenario)
      : script.events;

  // State injection: seed from the scenario's initialState, carry forward each turn.
  let state: RuntimeState = structuredClone(scenario.initialState);
  let memory: MemoryLayers = structuredClone(scenario.initialMemory);
  const results: TurnResult[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const res = await fetch(`${BASE_URL}/api/inr/event/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: scenario.id, state, memory, event }),
    });
    if (!res.ok) throw new Error(`event/v2 ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as V2Response;

    state = data.state;
    memory = data.memory;
    results.push({
      scenarioId: scenario.id,
      turn: i + 1,
      event,
      provider: data.provider,
      narrative: data.narrative,
      choices: data.playerChoices ?? [],
      invariants: checkInvariants(state),
      rejectedCount: (data.runtimeOperations ?? []).filter((o) => o.startsWith("Rejected")).length,
    });
  }
  return results;
}

function writeReport(all: TurnResult[], ts: string): { md: string; jsonl: string } {
  const { md, jsonl } = evalPaths(ts);
  const failed = all.filter((t) => t.invariants.length > 0);
  const rejected = all.reduce((n, t) => n + t.rejectedCount, 0);

  const rows = all
    .map(
      (t) =>
        `| ${t.scenarioId} | ${t.turn} | ${t.event.slice(0, 44)} | ${
          t.invariants.length ? "✗ " + t.invariants.join("; ") : "✓"
        } | ${t.provider} |`
    )
    .join("\n");

  const log = all
    .map(
      (t) =>
        `### ${t.scenarioId} · Turn ${t.turn}\n` +
        `**Event:** ${t.event}\n\n` +
        `${t.narrative}\n\n` +
        (t.choices.length ? `_Choices:_ ${t.choices.map((c) => `\`${c}\``).join(" · ")}\n` : "")
    )
    .join("\n");

  const content =
    `# INR Eval — ${ts}\n\n` +
    `**Turns:** ${all.length} · **Invariant failures:** ${failed.length} · **Rejected operations:** ${rejected}\n\n` +
    `## Correctness\n\n` +
    `| Scenario | Turn | Event | Invariants | Provider |\n` +
    `|---|---|---|---|---|\n${rows}\n\n` +
    `## Narrative Log (human review)\n\n${log}\n`;

  writeFileSync(md, content, "utf-8");
  writeFileSync(jsonl, all.map((t) => JSON.stringify(t)).join("\n") + "\n", "utf-8");
  return { md, jsonl };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const forceAuto = argv.includes("--auto");
  const arg = argv.find((a) => !a.startsWith("--"));
  let scripts: EvalScript[];

  if (arg) {
    const file = join(EVAL_DIR, `${arg}.json`);
    scripts = existsSync(file)
      ? [JSON.parse(readFileSync(file, "utf-8"))]
      : [{ scenarioId: arg, mode: "auto" as const }];
  } else if (forceAuto) {
    // --auto with no scenarioId → run all three scenarios in auto mode
    scripts = SCENARIOS.map((s) => ({ scenarioId: s.id, mode: "auto" as const }));
  } else {
    if (!existsSync(EVAL_DIR)) throw new Error(`No ${EVAL_DIR}/ — pass a scenarioId for auto mode.`);
    scripts = readdirSync(EVAL_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(EVAL_DIR, f), "utf-8")));
  }
  // --auto flag overrides mode on any loaded fixture
  if (forceAuto) scripts = scripts.map((s) => ({ ...s, mode: "auto" as const }));

  const all: TurnResult[] = [];
  for (const s of scripts) {
    process.stdout.write(`▶ ${s.scenarioId} (${s.mode ?? "manual"})… `);
    all.push(...(await runScript(s)));
    console.log("done");
  }

  const ts = runTimestamp();
  const { md } = writeReport(all, ts);
  const failed = all.filter((t) => t.invariants.length > 0).length;
  console.log(`\n${md} · ${all.length} turns · ${failed} invariant failure(s)`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("eval failed:", e instanceof Error ? e.message : e);
  process.exit(2);
});
