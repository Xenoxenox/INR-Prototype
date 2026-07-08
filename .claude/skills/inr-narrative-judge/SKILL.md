---
name: inr-narrative-judge
description: Run LLM-as-judge narrative quality scoring on an INR eval replay. Use after `npm run eval` when you want a scored assessment of narrative tension, coherence, voice, and consistency — not just correctness. Produces judge-<ts>.md + judge-<ts>.jsonl with per-turn scores, verdict, blockingIssues, and delta vs last run. Project is at F:\Interactive Narrative Runtime\INR-Prototype.
---

# inr-narrative-judge

LLM-as-judge layer on top of the eval harness. Reads the latest eval `.jsonl` replay,
sends each turn's narrative to an LLM rubric judge, and produces a scored report covering
6 dimensions, a verdict tier, and actionable `blockingIssues`.

**Requires:** `npm run dev` on `:3000` AND at least one prior `npm run eval` run for the target scenario.

---

## Commands

```bash
# Judge the latest eval replay for one scenario (scenario-level, 1 LLM call)
npx tsx scripts/judge.ts wuxia-trial

# Judge turn-by-turn (one LLM call per turn — more granular, higher cost)
npx tsx scripts/judge.ts wuxia-trial --judge=turn

# Judge all scenarios found in latest eval artifacts
npx tsx scripts/judge.ts --all

# Judge scenario-level only (default when --judge flag is omitted)
npx tsx scripts/judge.ts wuxia-trial --judge=scenario
```

Reports → `artifacts/judge/judge-<ts>.md` + `judge-<ts>.jsonl` (gitignored).

LLM source: uses the same `llmConfig` as the runtime (`.env.local` or frontend Settings modal).
No judge model override yet — leave `JUDGE_MODEL` env var unset.

---

## Rubric — 6 Dimensions

| Dimension | Weight | Core question |
|-----------|--------|---------------|
| **Tension** | 1.5× | Is uncertainty maintained? Does the player still have multiple plausible next turns? |
| **Coherence** | 1.0× | Is the causal chain intact? Does this turn follow from the last? |
| **Voice** | 1.0× | Could only *this* character say this line? Does the prose match the genre? |
| **Consistency** | 1.0× | Is the narrative consistent with `memory.working` and `world` state? |
| **Repetition** | 0.8× | No repeated phrases/clauses within the same turn? (5 = zero repetition) |
| **Pacing** | 0.8× | Is narrative momentum maintained? No large expository blocks with zero event push? |

**Scoring:** each dimension 1–5.  
`weighted_total = Σ(score × weight)`  
`max = 5 × (1.5 + 1 + 1 + 1 + 0.8 + 0.8) = 30.5`  
`normalized = weighted_total / 30.5 × 100`

**Verdict tiers:**

| normalized | verdict |
|-----------|---------|
| ≥ 80 | `accepted` — ship it |
| 60–79 | `repairable` — specific issues identified, fixable with targeted edits |
| 40–59 | `needs_review` — requires manual rework of prompt or simulator branch |
| < 40 | `low_quality` — redesign scenario structure or system prompt |

---

## Judge System Prompt (embed verbatim in `scripts/judge.ts`)

```
[System]
你是叙事质量评审员，专门评估AI驱动的互动叙事（TRPG/文字冒险风格）。

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
   ⚠️ 常见缺陷（命中一条-1）：
   - 因果链断裂（行为无合理原因）
   - 同一段重复描述同一状态/情绪

3. Voice（权重1.0）
   核心问题：角色台词是否只有该角色才能说出来？genre风格是否在场？
   ⚠️ AI常见缺陷（命中一条-1）：
   - "他感到/他意识到/他明白了"（情绪直给，未通过细节呈现）
   - 角色语言风格与genre不符（genre drift）
   - 用词不符合世界观/时代背景
   - mode_fit：{genre}场景特定标准：{mode_fit_criteria}

4. Consistency（权重1.0）
   核心问题：与已知world状态、memory层和角色设定是否一致？
   ⚠️ 常见缺陷（命中一条-1）：
   - 角色行为与其relationship值矛盾
   - 叙事引用了memory中不存在的信息

5. Repetition（权重0.8）
   核心问题：是否存在同段内重复词汇/句式/状态描述？（0重复=5分，每处重复-1）

6. Pacing（权重0.8）
   核心问题：叙事节奏是否合适？
   ⚠️ 常见缺陷（命中一条-1）：
   - 大段背景描写但无事件推进（PACING_STALL）
   - 单段叙事超过300字但events数量为0

[重要提示]
- 不要因为"语句流畅"就给高分——流畅是AI的默认状态，不是叙事优点
- 重点关注Tension：LLM系统性地在中段耗尽张力，这是最难修复的缺陷
- blockingIssues只列出真正影响读者体验的问题，不要列表面瑕疵
- 返回严格JSON，格式见schema，禁止输出任何JSON之外的内容

[Input格式]
{input_block}

[JSON Schema]
{schema_block}
```

---

## Per-scenario `rubricOverrides`

Add an optional `rubricOverrides` key to `eval-scripts/<id>.json`.
The judge script merges these into the system prompt's `{mode_fit_criteria}` placeholder.

**`eval-scripts/wuxia-trial.json` example:**

```json
{
  "scenarioId": "wuxia-trial",
  "rubricOverrides": {
    "Voice": {
      "weight": 1.3,
      "mode_fit_criteria": "叙述必须使用文言/古白话风格，含武侠术语（剑诀/内功/江湖/运功）；白话口语-1；缺少武学意象-1"
    }
  },
  "events": [...]
}
```

**`eval-scripts/cosmic-horror.json` example:**

```json
{
  "rubricOverrides": {
    "Tension": {
      "mode_fit_criteria": "悬疑/cosmic-horror场景：不允许直接满足感，奖励是线索/悬念；若叙事提前揭示谜底-2"
    },
    "Voice": {
      "mode_fit_criteria": "Lovecraftian风格：外貌/感官描写必须暗示深层恐惧，避免直接命名恐惧对象"
    }
  },
  "events": [...]
}
```

If `rubricOverrides` is absent, the global rubric applies with default weights.
Overriding `weight` is optional; only `mode_fit_criteria` is required if you add the key.

---

## Reading the Report

### Score table

```
| Turn | Event                          | Tension | Coherence | Voice | Consistency | Repetition | Pacing | Normalized | Verdict    |
|------|--------------------------------|---------|-----------|-------|-------------|------------|--------|------------|------------|
| 1    | 仔细辨认石壁上的碑文残诗         | 4       | 5         | 4     | 5           | 5          | 4      | 87.2       | accepted   |
| 2    | 按方位顺序触碰发光的符文机关      | 3       | 4         | 4     | 4           | 4          | 5      | 76.4       | repairable |
```

### blockingIssues

```json
[
  {
    "severity": "medium",
    "category": "plot",
    "code": "TENSION_FLAT",
    "evidence": "当最后一字落定，整面石壁轰然中分——这句话直接给出了结局，张力提前耗尽",
    "fixSuggestion": "改为「当最后一字触碰之际，石壁发出一声异响……」，留悬念给下一turn"
  }
]
```

### Verdict action guide

| verdict | action |
|---------|--------|
| `accepted` | No action needed. Archive narrative as reference. |
| `repairable` | Read `blockingIssues`, fix simulator branch or LLM prompt for flagged turns. Re-run eval + judge. |
| `needs_review` | Manual rewrite of narrative turn. Consider broadening or restructuring simulator keyword branches. |
| `low_quality` | Scenario design issue — revisit `initialState`, `initialMemory`, or the system prompt genre framing. |

---

## Delta Interpretation

The judge script auto-scans `artifacts/judge/judge-*.jsonl` for the same `scenarioId`
and computes dimension-level diffs:

```
## Delta vs 2026-07-06T22-14-33

| Dimension   | Prev avg | Curr avg | Δ    | Trend |
|-------------|----------|----------|------|-------|
| Tension     | 3.2      | 3.8      | +0.6 | ↑     |
| Coherence   | 4.5      | 4.5      | 0    | →     |
| Voice       | 4.0      | 3.5      | -0.5 | ↓     |
| Overall     | 71.3     | 76.4     |+5.1  | ↑     |
```

**Reading delta:**
- `↑` on Tension after a simulator branch edit = the guard/branch reorder worked
- `↓` on Voice after a prompt change = the new prompt drifted from genre style
- All `→` after a non-narrative change (e.g. bug fix) = no regression introduced

---

## Issue Code Reference

| code | category | dimension | trigger |
|------|---------|-----------|---------|
| `TENSION_FLAT` | `plot` | Tension | Narrative end-state明示了下一步结果 |
| `CHOICE_HOMOGENOUS` | `plot` | Tension | 3个选项语义几乎相同，无真实抉择 |
| `AGENCY_LOW` | `character` | Tension | 主角仅被事件推着走，无主动决策 |
| `EMOTION_EXPLICIT` | `voice` | Voice | "他感到/他意识到"情绪直给 |
| `GENRE_DRIFT` | `mode_fit` | Voice | 风格明显偏离scenario的genre |
| `CHAR_INCONSISTENT` | `character` | Consistency | 角色行为与relationship值矛盾 |
| `REPEAT_PHRASE` | `voice` | Repetition | 同段内相同词汇/句式重复出现 |
| `PACING_STALL` | `plot` | Pacing | 大段铺垫无事件推进 |
| `CONTINUITY_BREAK` | `continuity` | Coherence | 因果链断裂，turn之间缺乏连接 |
| `STATE_MISMATCH` | `continuity` | Consistency | 叙事引用了memory中不存在的信息 |

---

## Loop Engineering Workflow

```bash
# 1. Edit simulator branch or LLM system prompt
# 2. Re-run eval (correctness check)
npm run eval wuxia-trial

# 3. Run judge on the new eval output
npx tsx scripts/judge.ts wuxia-trial

# 4. Read artifacts/judge/judge-<ts>.md — check delta section
#    Tension↑? Voice stable? Any new blockingIssues?
# 5. If repairable: fix the specific code flagged, repeat
```

The judge report pairs with the eval report: eval catches **correctness regressions**,
judge catches **narrative quality regressions**.
