// scripts/judge.ts — INR narrative quality judge (PoC: --judge=scenario, 4 dimensions)
// ponytail: LLM-as-judge layer on top of eval harness. Reads eval .jsonl, scores narrative
// quality, and compares against previous run via pairwise A/B comparison (no score-diff delta).
//
// Usage (requires a real LLM key — no simulator fallback):
//   npx tsx scripts/judge.ts <scenarioId>
//
// Output: artifacts/judge/judge-<ts>.md  +  judge-<ts>.json (metadata for pairwise)

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// ponytail: load .env.local first (user secrets), fall back to .env (defaults)
dotenv.config({ path: ".env.local" });
dotenv.config();

import { SCENARIOS } from "../src/scenarios";

const ARTIFACTS_EVAL_DIR = join(process.cwd(), "artifacts", "eval");
const ARTIFACTS_JUDGE_DIR = join(process.cwd(), "artifacts", "judge");
const EVAL_SCRIPTS_DIR = join(process.cwd(), "eval-scripts");
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

// ponytail: colons invalid on Windows filenames
function runTimestamp(): string {
  return new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
}

// ── Interfaces ───────────────────────────────────────────────────────────────

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

interface DimScore {
  score: number;   // 1-5
  rationale: string;
}

interface BlockingIssue {
  severity: "low" | "medium" | "high" | "critical";
  category: "continuity" | "character" | "plot" | "mode_fit" | "voice";
  code: string;
  evidence: string;
  fixSuggestion: string;
}

interface JudgeScores {
  Tension: DimScore;
  Coherence: DimScore;
  Voice: DimScore;
  Consistency: DimScore;
}

interface LLMJudgeResponse {
  scores: JudgeScores;
  blockingIssues: BlockingIssue[];
}

interface RubricOverrides {
  [dim: string]: { weight?: number; mode_fit_criteria?: string; criteria?: string };
}

interface EvalFixture {
  scenarioId: string;
  rubricOverrides?: RubricOverrides;
  events?: string[];
}

// Metadata written alongside each judge report — used by next run for pairwise lookup
interface JudgeMeta {
  ts: string;
  evalTs: string;
  scenarioId: string;
  normalized: number;
}

// Pairwise A/B comparison result (replaces score-diff delta)
interface DimPairwise {
  winner: "A" | "B" | "tie";
  confidence: "slight" | "clear" | "strong";
  rationale: string;
}

interface PairwiseDelta {
  prevEvalTs: string;
  comparisons: Record<keyof JudgeScores, DimPairwise>;
  overall: { winner: "A" | "B" | "tie"; summary: string };
}

// ── Weights (PoC: 4 dimensions) ──────────────────────────────────────────────

const BASE_WEIGHTS: Record<keyof JudgeScores, number> = {
  Tension: 1.5,
  Coherence: 1.0,
  Voice: 1.0,
  Consistency: 1.0,
};
const MAX_SCORE = 5 * (1.5 + 1.0 + 1.0 + 1.0); // 22.5

function verdictFromNorm(n: number): "accepted" | "repairable" | "needs_review" | "low_quality" {
  if (n >= 80) return "accepted";
  if (n >= 60) return "repairable";
  if (n >= 40) return "needs_review";
  return "low_quality";
}

// ── Eval .jsonl readers ───────────────────────────────────────────────────────

/** Find the most recent eval .jsonl containing the given scenarioId. Returns turns + evalTs. */
function loadLatestEvalTurns(scenarioId: string): { turns: EvalTurnRecord[]; evalTs: string } {
  if (!existsSync(ARTIFACTS_EVAL_DIR))
    throw new Error(`No ${ARTIFACTS_EVAL_DIR}/ — run npm run eval first.`);

  const files = readdirSync(ARTIFACTS_EVAL_DIR)
    .filter((f) => f.startsWith("eval-") && f.endsWith(".jsonl"))
    .sort()
    .reverse(); // ISO timestamps sort lexicographically → newest first

  for (const file of files) {
    const lines = readFileSync(join(ARTIFACTS_EVAL_DIR, file), "utf-8")
      .split("\n")
      .filter(Boolean);
    const turns = lines
      .map((l) => JSON.parse(l) as EvalTurnRecord)
      .filter((t) => t.scenarioId === scenarioId);
    if (turns.length > 0) {
      // Extract timestamp from filename: eval-<ts>.jsonl → <ts>
      const evalTs = file.replace(/^eval-/, "").replace(/\.jsonl$/, "");
      return { turns, evalTs };
    }
  }
  throw new Error(`No eval turns found for "${scenarioId}" in ${ARTIFACTS_EVAL_DIR}/`);
}

/** Load eval turns for a specific evalTs (used for pairwise prev-version lookup). */
function loadEvalTurnsForTs(scenarioId: string, evalTs: string): EvalTurnRecord[] | null {
  const file = join(ARTIFACTS_EVAL_DIR, `eval-${evalTs}.jsonl`);
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as EvalTurnRecord)
    .filter((t) => t.scenarioId === scenarioId);
}

// ── Judge metadata — written per run, read by next run for pairwise ───────────

function writeMeta(ts: string, evalTs: string, scenarioId: string, normalized: number): void {
  const meta: JudgeMeta = { ts, evalTs, scenarioId, normalized };
  writeFileSync(
    join(ARTIFACTS_JUDGE_DIR, `judge-${ts}.json`),
    JSON.stringify(meta, null, 2),
    "utf-8"
  );
}

/** Find the most recent prior judge run for this scenario (different evalTs). */
function findPrevJudgeMeta(scenarioId: string, currentEvalTs: string): JudgeMeta | null {
  if (!existsSync(ARTIFACTS_JUDGE_DIR)) return null;
  const metas = readdirSync(ARTIFACTS_JUDGE_DIR)
    .filter((f) => f.startsWith("judge-") && f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(
          readFileSync(join(ARTIFACTS_JUDGE_DIR, f), "utf-8")
        ) as JudgeMeta;
      } catch {
        return null;
      }
    })
    .filter((m): m is JudgeMeta => m !== null && m.scenarioId === scenarioId && m.evalTs !== currentEvalTs)
    .sort((a, b) => b.ts.localeCompare(a.ts)); // newest first
  return metas[0] ?? null;
}

// ── Rubric override loader ────────────────────────────────────────────────────

function loadRubricOverrides(scenarioId: string): RubricOverrides {
  const path = join(EVAL_SCRIPTS_DIR, `${scenarioId}.json`);
  if (!existsSync(path)) return {};
  const fixture = JSON.parse(readFileSync(path, "utf-8")) as EvalFixture;
  return fixture.rubricOverrides ?? {};
}

// ── Prompts ───────────────────────────────────────────────────────────────────

function buildScoringSystemPrompt(genre: string, overrides: RubricOverrides): string {
  const voiceCriteria =
    overrides.Voice?.mode_fit_criteria ??
    overrides.Voice?.criteria ??
    `符合genre「${genre}」的语气和词汇风格，角色台词只有该角色才能说出来`;

  return `你是叙事质量评审员，专门评估AI驱动的互动叙事（TRPG/文字冒险风格）。

评分维度（每项1-5分）：

1. Tension（权重1.5）
   核心问题：叙事是否维持了不确定性？玩家下一步走向有多少可能性？
   ⚠️ AI常见缺陷（命中一条-1）：
   - 叙事末尾明示了下一步结果（张力耗尽）
   - 三个选项语义几乎相同（选择同质化，无真实抉择）
   - 主角只是被事件推着走（能动性低）
   - 相比上一turn，事件张力递进平缓

2. Coherence（权重1.0）
   核心问题：叙事逻辑是否自洽？与上下文是否连贯？
   ⚠️ 常见缺陷（命中一条-1）：因果链断裂 / 同一段重复描述同一状态

3. Voice（权重1.0）
   核心问题：${voiceCriteria}
   ⚠️ AI常见缺陷（命中一条-1）：
   - "他感到/他意识到/他明白了"（情绪直给）
   - 角色语言风格与genre不符（genre drift）
   - 用词不符合世界观/时代背景

4. Consistency（权重1.0）
   核心问题：与已知world状态、memory层和角色设定是否一致？
   ⚠️ 常见缺陷（命中一条-1）：
   - 角色行为与其关系值矛盾
   - 叙事引用了context中不存在的信息

[重要提示]
- 不要因为"语句流畅"就给高分——流畅是AI的默认状态，不是叙事优点
- 重点关注Tension：LLM系统性地在中段耗尽张力，这是最难修复的缺陷
- blockingIssues只列真正影响读者体验的问题，不超过3条
- 返回严格JSON，禁止输出JSON之外的任何内容`;
}

function buildScoringUserPrompt(turns: EvalTurnRecord[], title: string): string {
  const body = turns
    .map((t) => `--- Turn ${t.turn} ---\nEvent: ${t.event}\nNarrative: ${t.narrative}\nChoices: ${t.choices.join(" / ")}`)
    .join("\n\n");
  return `场景：${title}\n以下是本次replay的全部turns（共${turns.length}turn）：\n\n${body}\n\n请对整个replay的叙事质量进行整体评分，返回以下JSON格式：\n{"scores":{"Tension":{"score":<1-5>,"rationale":"<简短中文>"},"Coherence":{"score":<1-5>,"rationale":"<简短中文>"},"Voice":{"score":<1-5>,"rationale":"<简短中文>"},"Consistency":{"score":<1-5>,"rationale":"<简短中文>"}},"blockingIssues":[{"severity":"low|medium|high|critical","category":"continuity|character|plot|mode_fit|voice","code":"TENSION_FLAT|CHOICE_HOMOGENOUS|EMOTION_EXPLICIT|GENRE_DRIFT|CHAR_INCONSISTENT|REPEAT_PHRASE|PACING_STALL|CONTINUITY_BREAK|STATE_MISMATCH|AGENCY_LOW","evidence":"<原文引用片段>","fixSuggestion":"<具体修改建议>"}]}`;
}

function buildPairwiseSystemPrompt(genre: string): string {
  return `你是叙事质量比较员。你收到同一场景的两个不同replay版本（A和B），请按4个维度分别判断哪个版本叙事质量更好。

维度：Tension（张力与不确定性）/ Coherence（叙事逻辑）/ Voice（风格与角色独特性）/ Consistency（与世界设定一致）

[重要]
- 不要因语言流畅而偏袒任何一方
- 只看叙事质量，不看哪个更长
- genre「${genre}」：Voice维度关注风格是否符合该genre
- 返回严格JSON，禁止其他输出`;
}

function buildPairwiseUserPrompt(
  prevTurns: EvalTurnRecord[],
  currTurns: EvalTurnRecord[],
  title: string
): string {
  const fmt = (turns: EvalTurnRecord[], label: string) =>
    `=== 版本${label} ===\n` +
    turns
      .map((t) => `Turn ${t.turn}: ${t.event}\n${t.narrative}\nChoices: ${t.choices.join(" / ")}`)
      .join("\n\n");

  return (
    `场景：${title}\n\n${fmt(prevTurns, "A (上次)")}\n\n${fmt(currTurns, "B (本次)")}\n\n` +
    `请比较A和B，返回JSON：\n` +
    `{"Tension":{"winner":"A"|"B"|"tie","confidence":"slight"|"clear"|"strong","rationale":""}` +
    `,"Coherence":{"winner":"A"|"B"|"tie","confidence":"slight"|"clear"|"strong","rationale":""}` +
    `,"Voice":{"winner":"A"|"B"|"tie","confidence":"slight"|"clear"|"strong","rationale":""}` +
    `,"Consistency":{"winner":"A"|"B"|"tie","confidence":"slight"|"clear"|"strong","rationale":""}` +
    `,"overall":{"winner":"A"|"B"|"tie","summary":"<一句话总结>"}}`
  );
}

// ── LLM caller ────────────────────────────────────────────────────────────────

const useOpenAI =
  !!process.env.OPENAI_BASE_URL &&
  !!process.env.OPENAI_API_KEY &&
  !!process.env.OPENAI_MODEL;

async function callLLM<T>(system: string, user: string): Promise<T> {
  if (useOpenAI) {
    const url = process.env.OPENAI_BASE_URL!.replace(/\/$/, "") + "/chat/completions";
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
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    return JSON.parse(
      raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    ) as T;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY" || !key.trim())
    throw new Error(
      "No LLM configured — set GEMINI_API_KEY or all three OPENAI_BASE_URL/OPENAI_API_KEY/OPENAI_MODEL in .env.local"
    );
  try {
    const ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: user,
      config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0.1 },
    });
    return JSON.parse(result.text ?? "{}") as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause =
      err instanceof Error && (err as NodeJS.ErrnoException).cause
        ? `\n  cause: ${String((err as NodeJS.ErrnoException).cause)}`
        : "";
    throw new Error(`Gemini API call failed: ${msg}${cause}`);
  }
}

// ── Report writer ─────────────────────────────────────────────────────────────

function writeReport(
  scenarioId: string,
  turns: EvalTurnRecord[],
  resp: LLMJudgeResponse,
  ts: string,
  pairwise?: PairwiseDelta
): string {
  mkdirSync(ARTIFACTS_JUDGE_DIR, { recursive: true });

  const weighted_total =
    resp.scores.Tension.score * BASE_WEIGHTS.Tension +
    resp.scores.Coherence.score * BASE_WEIGHTS.Coherence +
    resp.scores.Voice.score * BASE_WEIGHTS.Voice +
    resp.scores.Consistency.score * BASE_WEIGHTS.Consistency;
  const normalized = Math.round((weighted_total / MAX_SCORE) * 1000) / 10;
  const verdict = verdictFromNorm(normalized);

  const VERDICT_EMOJI: Record<string, string> = {
    accepted: "✅", repairable: "🔧", needs_review: "⚠️", low_quality: "❌",
  };

  const dimRows = (Object.entries(resp.scores) as [keyof JudgeScores, DimScore][])
    .map(([dim, d]) => `| **${dim}** | ×${BASE_WEIGHTS[dim]} | ${d.score} | ${d.rationale} |`)
    .join("\n");

  const blockRows =
    resp.blockingIssues.length === 0
      ? "_No blocking issues._"
      : resp.blockingIssues
          .map(
            (b) =>
              `### \`${b.code}\` · ${b.severity}\n` +
              `**Category:** ${b.category}  \n` +
              `**Evidence:** _"${b.evidence}"_  \n` +
              `**Fix:** ${b.fixSuggestion}`
          )
          .join("\n\n");

  // Pairwise delta section
  let pairwiseSection = "";
  if (pairwise) {
    const WINNER_LABEL: Record<string, string> = {
      A: "← 上次更好",
      B: "✅ 本次更好",
      tie: "⟷ 相当",
    };
    const pRows = (Object.entries(pairwise.comparisons) as [keyof JudgeScores, DimPairwise][])
      .map(
        ([dim, c]) =>
          `| ${dim} | ${WINNER_LABEL[c.winner]} | ${c.confidence} | ${c.rationale} |`
      )
      .join("\n");
    const overallLabel =
      pairwise.overall.winner === "B"
        ? "✅ 本次整体更好"
        : pairwise.overall.winner === "A"
        ? "↩️ 上次整体更好"
        : "⟷ 整体相当";
    pairwiseSection =
      `\n## Delta vs eval-${pairwise.prevEvalTs}\n\n` +
      `| Dimension | Winner | Confidence | Rationale |\n` +
      `|-----------|--------|------------|----------|\n` +
      `${pRows}\n\n` +
      `**Overall:** ${overallLabel} — ${pairwise.overall.summary}\n`;
  }

  const content =
    `# INR Judge — ${ts}\n\n` +
    `**Scenario:** ${scenarioId} · **Turns:** ${turns.length} · **Mode:** scenario\n\n` +
    `## Score\n\n` +
    `| Dimension | Weight | Score (1-5) | Rationale |\n` +
    `|-----------|--------|-------------|----------|\n` +
    `${dimRows}\n\n` +
    `**Weighted total:** ${weighted_total.toFixed(2)} / ${MAX_SCORE}  \n` +
    `**Normalized:** ${normalized} / 100  \n` +
    `**Verdict:** ${VERDICT_EMOJI[verdict]} \`${verdict}\`\n\n` +
    `## Blocking Issues\n\n${blockRows}\n` +
    pairwiseSection;

  const outPath = join(ARTIFACTS_JUDGE_DIR, `judge-${ts}.md`);
  writeFileSync(outPath, content, "utf-8");
  return outPath;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const scenarioId = argv.find((a) => !a.startsWith("--"));
  if (!scenarioId) {
    console.error("Usage: npx tsx scripts/judge.ts <scenarioId>");
    process.exit(1);
  }

  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) {
    console.error(`Unknown scenarioId: ${scenarioId}`);
    process.exit(1);
  }

  process.stdout.write(`▶ judge ${scenarioId}… `);

  // 1. Load current eval turns
  const { turns, evalTs } = loadLatestEvalTurns(scenarioId);
  const overrides = loadRubricOverrides(scenarioId);

  // 2. Score current replay
  const scoringResp = await callLLM<LLMJudgeResponse>(
    buildScoringSystemPrompt(scenario.genre ?? scenario.id, overrides),
    buildScoringUserPrompt(turns, scenario.title)
  );

  const weighted_total =
    scoringResp.scores.Tension.score * BASE_WEIGHTS.Tension +
    scoringResp.scores.Coherence.score * BASE_WEIGHTS.Coherence +
    scoringResp.scores.Voice.score * BASE_WEIGHTS.Voice +
    scoringResp.scores.Consistency.score * BASE_WEIGHTS.Consistency;
  const normalized = Math.round((weighted_total / MAX_SCORE) * 1000) / 10;

  // 3. Pairwise delta — find previous judge run, load its eval turns
  let pairwise: PairwiseDelta | undefined;
  const prevMeta = findPrevJudgeMeta(scenarioId, evalTs);
  if (prevMeta) {
    process.stdout.write(`(pairwise vs eval-${prevMeta.evalTs})… `);
    const prevTurns = loadEvalTurnsForTs(scenarioId, prevMeta.evalTs);
    if (prevTurns && prevTurns.length > 0) {
      const pairwiseRaw = await callLLM<
        Record<keyof JudgeScores, DimPairwise> & { overall: { winner: "A" | "B" | "tie"; summary: string } }
      >(
        buildPairwiseSystemPrompt(scenario.genre ?? scenario.id),
        buildPairwiseUserPrompt(prevTurns, turns, scenario.title)
      );
      const { overall, ...comparisons } = pairwiseRaw;
      pairwise = {
        prevEvalTs: prevMeta.evalTs,
        comparisons: comparisons as Record<keyof JudgeScores, DimPairwise>,
        overall,
      };
    }
  }

  // 4. Write report + metadata
  const ts = runTimestamp();
  mkdirSync(ARTIFACTS_JUDGE_DIR, { recursive: true });
  const outPath = writeReport(scenarioId, turns, scoringResp, ts, pairwise);
  writeMeta(ts, evalTs, scenarioId, normalized);

  const verdict = verdictFromNorm(normalized);
  const deltaNote = pairwise
    ? ` · overall ${pairwise.overall.winner === "B" ? "↑" : pairwise.overall.winner === "A" ? "↓" : "→"}`
    : "";
  console.log(`done\n${outPath} · ${normalized}/100 · ${verdict}${deltaNote}`);
}

main().catch((e) => {
  console.error("judge failed:", e instanceof Error ? e.message : e);
  process.exit(2);
});
