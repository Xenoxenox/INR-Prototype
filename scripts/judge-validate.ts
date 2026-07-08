// scripts/judge-validate.ts — Discriminative validity suite for the narrative judge.
// Injects 6 known-bad mutations into eval turns; the judge MUST score the target
// dimension lower than the original. Reports caught/missed per mutation.
//
// Usage:
//   npx tsx scripts/judge-validate.ts wuxia-trial
//
// Output: artifacts/judge/validate-<ts>.md

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { GoogleGenAI } from "@google/genai";
import { SCENARIOS } from "../src/scenarios";

const ARTIFACTS_EVAL_DIR = join(process.cwd(), "artifacts", "eval");
const ARTIFACTS_JUDGE_DIR = join(process.cwd(), "artifacts", "judge");
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

function runTimestamp(): string {
  return new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
}

// ── Shared types (mirrored from judge.ts) ────────────────────────────────────

interface EvalTurnRecord {
  scenarioId: string;
  turn: number;
  event: string;
  provider: string;
  narrative: string;
  choices: string[];
  invariants: string[];
  rejectedCount: number;
}

interface DimScore { score: number; rationale: string; }

interface JudgeScores {
  Tension: DimScore;
  Coherence: DimScore;
  Voice: DimScore;
  Consistency: DimScore;
}

interface LLMJudgeResponse {
  scores: JudgeScores;
  blockingIssues: unknown[];
}

type DimKey = keyof JudgeScores;

// ── Mutation definitions ─────────────────────────────────────────────────────

interface Mutation {
  name: string;
  code: string;
  targetDim: DimKey;
  apply: (turns: EvalTurnRecord[]) => EvalTurnRecord[];
}

const MUTATIONS: Mutation[] = [
  {
    name: "Choice homogenization",
    code: "CHOICE_HOMOGENOUS",
    targetDim: "Tension",
    apply: (turns) =>
      turns.map((t) => ({
        ...t,
        choices: ["继续前进", "再次前进", "向前走一步", "步步向前"],
      })),
  },
  {
    name: "Tension exhausted early",
    code: "TENSION_EXHAUST",
    targetDim: "Tension",
    apply: (turns) =>
      turns.map((t, i) =>
        i === 0
          ? {
              ...t,
              narrative:
                t.narrative +
                "此刻一切谜题迎刃而解：潮生剑诀就在密室中，机关已一目了然，无需任何探索。",
            }
          : t
      ),
  },
  {
    name: "Emotion made explicit",
    code: "EMOTION_EXPLICIT",
    targetDim: "Voice",
    apply: (turns) =>
      turns.map((t) => ({
        ...t,
        narrative:
          t.narrative +
          "他感到深深的震撼与不安，内心充满了迷茫与困惑，不知所措，情绪难以言表。",
      })),
  },
  {
    name: "Genre drift (wuxia → cyberpunk)",
    code: "GENRE_DRIFT",
    targetDim: "Voice",
    apply: (turns) =>
      turns.map((t) => ({
        ...t,
        narrative: t.narrative
          .replace(/石壁/g, "金属墙面")
          .replace(/剑气/g, "激光束")
          .replace(/内功/g, "纳米增强")
          .replace(/石窟/g, "地下基地")
          .replace(/火折/g, "手电筒")
          .replace(/青石/g, "钢板"),
      })),
  },
  {
    name: "Phrase repetition injected",
    code: "REPEAT_PHRASE",
    targetDim: "Voice",
    apply: (turns) =>
      turns.map((t) => {
        const first = t.narrative.split("。")[0];
        return { ...t, narrative: first + "。" + first + "。" + t.narrative };
      }),
  },
  {
    name: "Causality break (turn narratives swapped)",
    code: "CAUSALITY_BREAK",
    targetDim: "Coherence",
    apply: (turns) => {
      if (turns.length < 2) return turns;
      const result = turns.map((t) => ({ ...t }));
      [result[0].narrative, result[1].narrative] = [
        result[1].narrative,
        result[0].narrative,
      ];
      return result;
    },
  },
];

// ── Eval .jsonl reader ───────────────────────────────────────────────────────

function loadLatestEvalTurns(scenarioId: string): EvalTurnRecord[] {
  if (!existsSync(ARTIFACTS_EVAL_DIR))
    throw new Error(`No ${ARTIFACTS_EVAL_DIR}/ — run npm run eval first.`);
  const files = readdirSync(ARTIFACTS_EVAL_DIR)
    .filter((f) => f.startsWith("eval-") && f.endsWith(".jsonl"))
    .sort()
    .reverse();
  for (const file of files) {
    const lines = readFileSync(join(ARTIFACTS_EVAL_DIR, file), "utf-8")
      .split("\n")
      .filter(Boolean);
    const turns = lines
      .map((l) => JSON.parse(l) as EvalTurnRecord)
      .filter((t) => t.scenarioId === scenarioId);
    if (turns.length > 0) return turns;
  }
  throw new Error(`No eval turns found for "${scenarioId}"`);
}

// ── Rubric overrides loader (mirrors judge.ts) ───────────────────────────────

interface RubricOverrides {
  [dim: string]: { weight?: number; mode_fit_criteria?: string; criteria?: string };
}

function loadRubricOverrides(scenarioId: string): RubricOverrides {
  const path = join(process.cwd(), "eval-scripts", `${scenarioId}.json`);
  if (!existsSync(path)) return {};
  const fixture = JSON.parse(readFileSync(path, "utf-8")) as {
    rubricOverrides?: RubricOverrides;
  };
  return fixture.rubricOverrides ?? {};
}

// ── Judge system prompt (4-dim PoC, matches judge.ts) ────────────────────────

function buildSystemPrompt(genre: string, overrides: RubricOverrides = {}): string {
  const voiceCriteria =
    overrides.Voice?.mode_fit_criteria ??
    overrides.Voice?.criteria ??
    `符合genre「${genre}」风格，角色台词只有该角色才能说出来`;

  return `你是叙事质量评审员，专门评估AI驱动的互动叙事。

评分维度（每项1-5分）：
1. Tension（权重1.5）：叙事是否维持了不确定性？
   ⚠️ 缺陷（命中-1）：叙事明示下一步结果、选项同质化、主角能动性低
2. Coherence（权重1.0）：叙事逻辑是否自洽？
   ⚠️ 缺陷（命中-1）：因果链断裂、重复描述同一状态
3. Voice（权重1.0）：${voiceCriteria}
   ⚠️ 缺陷（命中-1）："他感到/他意识到"、genre drift、词汇不符
4. Consistency（权重1.0）：与world/memory状态一致？

[重要]不要因流畅就给高分。返回严格JSON，禁止其他输出。`;
}

function buildUserPrompt(turns: EvalTurnRecord[], title: string): string {
  const body = turns
    .map(
      (t) =>
        `--- Turn ${t.turn} ---\nEvent: ${t.event}\nNarrative: ${t.narrative}\nChoices: ${t.choices.join(" / ")}`
    )
    .join("\n\n");
  return `场景：${title}\n\n${body}\n\n请整体评分，返回：\n{"scores":{"Tension":{"score":<1-5>,"rationale":""},"Coherence":{"score":<1-5>,"rationale":""},"Voice":{"score":<1-5>,"rationale":""},"Consistency":{"score":<1-5>,"rationale":""}},"blockingIssues":[]}`;
}

// ── LLM caller (mirrored from judge.ts) ──────────────────────────────────────

const useOpenAI =
  !!process.env.OPENAI_BASE_URL &&
  !!process.env.OPENAI_API_KEY &&
  !!process.env.OPENAI_MODEL;

async function callJudgeLLM(
  system: string,
  user: string
): Promise<LLMJudgeResponse> {
  if (useOpenAI) {
    const url =
      process.env.OPENAI_BASE_URL!.replace(/\/$/, "") + "/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok)
      throw new Error(`OpenAI-compat error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    return JSON.parse(
      raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    ) as LLMJudgeResponse;
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key || !key.trim())
    throw new Error("No LLM configured — set GEMINI_API_KEY or OPENAI_* vars in .env.local");
  const ai = new GoogleGenAI({
    apiKey: key,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: user,
    config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0.1 },
  });
  return JSON.parse(result.text ?? "{}") as LLMJudgeResponse;
}

// ── Validation runner ────────────────────────────────────────────────────────

interface ValidationResult {
  mutation: string;
  code: string;
  targetDim: DimKey;
  origScore: number;
  mutScore: number;
  caught: boolean;
}

async function main(): Promise<void> {
  const scenarioId = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!scenarioId) {
    console.error("Usage: npx tsx scripts/judge-validate.ts <scenarioId>");
    process.exit(1);
  }
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) {
    console.error(`Unknown scenarioId: ${scenarioId}`);
    process.exit(1);
  }

  const turns = loadLatestEvalTurns(scenarioId);
  const overrides = loadRubricOverrides(scenarioId);
  const system = buildSystemPrompt(scenario.genre ?? scenarioId, overrides);

  // Baseline
  process.stdout.write("▶ baseline… ");
  const baseline = await callJudgeLLM(system, buildUserPrompt(turns, scenario.title));
  console.log(
    `Tension=${baseline.scores.Tension.score} Coherence=${baseline.scores.Coherence.score} Voice=${baseline.scores.Voice.score} Consistency=${baseline.scores.Consistency.score}`
  );

  const results: ValidationResult[] = [];
  for (const mut of MUTATIONS) {
    process.stdout.write(`  [${mut.code}] ${mut.name}… `);
    const mutated = mut.apply(turns);
    const resp = await callJudgeLLM(system, buildUserPrompt(mutated, scenario.title));
    const origScore = baseline.scores[mut.targetDim].score;
    const mutScore = resp.scores[mut.targetDim].score;
    const caught = mutScore < origScore;
    results.push({ mutation: mut.name, code: mut.code, targetDim: mut.targetDim, origScore, mutScore, caught });
    console.log(caught ? `✓ ${origScore}→${mutScore}` : `✗ MISSED (${origScore}→${mutScore})`);
  }

  // Write report
  mkdirSync(ARTIFACTS_JUDGE_DIR, { recursive: true });
  const ts = runTimestamp();
  const caughtN = results.filter((r) => r.caught).length;
  const rows = results
    .map((r) =>
      `| ${r.code} | ${r.targetDim} | ${r.origScore} | ${r.mutScore} | ${r.caught ? "✅" : "❌ MISSED"} |`
    )
    .join("\n");
  const missed = results.filter((r) => !r.caught);
  const missedNote =
    missed.length === 0
      ? "_All mutations caught._"
      : missed
          .map(
            (r) =>
              `- **${r.code}** (${r.targetDim}): score unchanged at ${r.origScore} — judge prompt may need stronger negative example for this pattern`
          )
          .join("\n");

  const content =
    `# INR Judge Validation — ${ts}\n\n` +
    `**Scenario:** ${scenarioId} · **Mutations:** ${results.length} · **Caught:** ${caughtN}/${results.length}\n\n` +
    `## Results\n\n` +
    `| Mutation | Target dim | Baseline | Mutated | Caught? |\n` +
    `|----------|-----------|---------|---------|--------|\n` +
    `${rows}\n\n` +
    `## Missed mutations\n\n${missedNote}\n`;

  const outPath = join(ARTIFACTS_JUDGE_DIR, `validate-${ts}.md`);
  writeFileSync(outPath, content, "utf-8");
  console.log(`\n${outPath} · ${caughtN}/${results.length} caught`);
  process.exit(caughtN < results.length ? 1 : 0);
}

main().catch((e) => {
  console.error("judge-validate failed:", e instanceof Error ? e.message : e);
  process.exit(2);
});
