import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { RuntimeController } from "./src/runtime/RuntimeController";
import { isOperation } from "./src/runtime/OperationValidator";
import { Operation } from "./src/runtime/types";
import type { INREventResponse } from "./src/types";

// ponytail: load .env.local first (user secrets), fall back to .env (defaults)
dotenv.config({ path: ".env.local" });
dotenv.config();

const app = express();
const PORT = 3000;
const GEMINI_MODEL = "gemini-3.5-flash";
const openaiBaseUrl = process.env.OPENAI_BASE_URL ?? "";
const openaiApiKey = process.env.OPENAI_API_KEY ?? "";
const openaiModel = process.env.OPENAI_MODEL ?? "";
type OpenAICompatConfig = { baseUrl: string; apiKey: string; model: string };

function readOpenAIConfig(raw: unknown): OpenAICompatConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const cfg = raw as Record<string, unknown>;
  const baseUrl = typeof cfg.baseUrl === "string" ? cfg.baseUrl.trim() : "";
  const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey.trim() : "";
  const model = typeof cfg.model === "string" ? cfg.model.trim() : "";
  return baseUrl && apiKey && model ? { baseUrl, apiKey, model } : null;
}

const envOpenAIConfig = readOpenAIConfig({ baseUrl: openaiBaseUrl, apiKey: openaiApiKey, model: openaiModel });
const useOpenAI = !!envOpenAIConfig;

app.use(express.json());

// Resolve paths for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy initialize Gemini API client
let aiClient: GoogleGenAI | null = null;
let isSimulatorMode = false;

function getGeminiClient(): GoogleGenAI {
  if (aiClient) return aiClient;

  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY" || key.trim() === "") {
    console.warn("⚠️ GEMINI_API_KEY is not configured or left as default. Running in SIMULATOR fallback mode.");
    isSimulatorMode = true;
    throw new Error("Missing GEMINI_API_KEY");
  }

  try {
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    isSimulatorMode = false;
    return aiClient;
  } catch (err) {
    console.error("❌ Failed to initialize GoogleGenAI. Falling back to simulator.", err);
    isSimulatorMode = true;
    throw err;
  }
}

// Ensure first probe is done gently
if (useOpenAI) {
  console.log("✅ OpenAI-compatible provider configured.");
} else {
  try {
    getGeminiClient();
    console.log("✅ GoogleGenAI client initialized successfully.");
  } catch {
    console.log("ℹ️ Server running in Simulator Mode until key is provided.");
  }
}

// ponytail: inline, extract to src/server/openaiCompatService.ts when >80 lines
async function callOpenAICompat(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  config: OpenAICompatConfig
): Promise<string> {
  const url = config.baseUrl.endsWith("/")
    ? `${config.baseUrl}chat/completions`
    : `${config.baseUrl}/chat/completions`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI-compat API error: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    try {
      JSON.parse(cleaned);
      return cleaned;
    } catch {
      if (attempt === 1) throw new Error("OpenAI-compat: response failed JSON parse after 2 attempts");
    }
  }
  throw new Error("OpenAI-compat: unreachable");
}

// Fallback Simulator Engine for when API key is missing
function runSimulatorFallback(scenarioId: string, state: any, memory: any, event: string): any {
  const cleanEvent = event.toLowerCase();
  let narrative = "";
  let runtimeOperations: string[] = [];
  let executionLogs: string[] = [
    `Event Captured: ${event}`,
    "Simulator Fallback Mode Active (No API Key)",
    "Composing context layers manually...",
    "Executing deterministic state updates..."
  ];

  // Deep clone state & memory
  const nextState = JSON.parse(JSON.stringify(state));
  const nextMemory = JSON.parse(JSON.stringify(memory));

  if (scenarioId === 'cyberpunk-detective') {
    if (cleanEvent.includes('decrypt') || cleanEvent.includes('aria')) {
      narrative = "Kaelen plugs the Saito corporate datacore into his forearm rig. A.R.I.A.'s holographic avatar blinks in his optic feed, her binary eyes wide. 'Kaelen, Saito security protocols are high-grade, but I've bypassed the first firewall. Be careful, a trace signal was dispatched before I could mask our terminal.'";
      nextState.world.time = "Late Night (Alarm active)";
      nextState.player.hp = Math.max(10, nextState.player.hp - 5);
      nextState.player.statusEffects = [...new Set([...nextState.player.statusEffects, 'Hacking Trace (Active)'])];
      nextState.characters.aria.relationship = Math.min(100, nextState.characters.aria.relationship + 5);
      nextState.characters.aria.currentActivity = "Bypassing Saito decrypter firewall.";
      nextState.story.flags.saito_drones_aware = true;
      runtimeOperations = [
        "State Update: Timeline advanced",
        "Player HP: -5 (Neural backlash)",
        "Player status effect added: Hacking Trace",
        "Relationship(A.R.I.A.): +5",
        "Story Flag Committed: saito_drones_aware = true"
      ];
    } else if (cleanEvent.includes('vex') || cleanEvent.includes('lounge')) {
      narrative = "Pushing through the heavy synth-bass thrum at the Red Line lounge, Kaelen finds Vex swirling a glass of glowing synth-gin. She raises a cybernetic eyebrow. 'Kaelen, you look like death. If you have the Saito datacore, let's talk numbers. But Saito tactical squads are already sweeping this block.'";
      nextState.world.location = "Sector 7: Red Line Cyber-Lounge";
      nextState.characters.vex.relationship = Math.min(100, nextState.characters.vex.relationship + 10);
      nextState.characters.vex.currentActivity = "Negotiating for Kaelen's datacore.";
      nextState.story.flags.met_vex = true;
      runtimeOperations = [
        "Location Update: Sector 7: Red Line Cyber-Lounge",
        "Relationship(Vex): +10",
        "Story Flag Committed: met_vex = true"
      ];
    } else if (cleanEvent.includes('injector') || cleanEvent.includes('dampener') || cleanEvent.includes('heal')) {
      if (nextState.player.inventory.includes('Neural-Dampener Injector')) {
        narrative = "Clamping the injector to his neck, Kaelen presses the trigger. A cooling wave of neural stabilizers floods his system. The persistent glitch flickering across his cybernetic vision vanishes, leaving his mind perfectly clear and alert.";
        nextState.player.hp = Math.min(nextState.player.maxHp, nextState.player.hp + 20);
        nextState.player.inventory = nextState.player.inventory.filter((i: string) => i !== 'Neural-Dampener Injector');
        nextState.player.statusEffects = nextState.player.statusEffects.filter((s: string) => s !== 'Neural Glitch (Mild)');
        runtimeOperations = [
          "Inventory: -Neural-Dampener Injector",
          "Player HP: +20",
          "Status Removed: Neural Glitch (Mild)"
        ];
      } else {
        narrative = "Kaelen searches his pockets, but he has already depleted his supply of neural-dampener injectors. His neural glitch triggers again, blurring his sight.";
        nextState.player.hp = Math.max(10, nextState.player.hp - 10);
        runtimeOperations = [
          "Action Failed: No injector in inventory",
          "Player HP: -10 (Uncontrolled Neural Glitch)"
        ];
      }
    } else {
      narrative = `Kaelen takes action: "${event}". Scanning the dark alleyway, he remains alert. The heavy acidic drizzle sizzles against his synth-trenchcoat. Holographic ads flicker overhead, and the constant hum of a Saito security drone is audible in the distance. He must proceed carefully.`;
      nextState.player.hp = Math.max(10, nextState.player.hp - 2);
      runtimeOperations = [
        "State Update: Environmental stress",
        "Player HP: -2 (Acid rain exposure)"
      ];
    }

    nextMemory.working = ["Saito patrol squads are moving nearby.", "Decryption is currently in progress."];
    nextMemory.episode.push(`Player executed: ${event}`);

    return {
      provider: "simulator",
      narrative,
      state: nextState,
      memory: nextMemory,
      playerChoices: [
        "Let A.R.I.A. continue hacking the Saito Datacore",
        "Head inside the Red Line Cyber-Lounge to strike a deal with Vex",
        "Take cover behind the high-voltage dumpsters to avoid patrol drones",
        "Use custom neural scan to locate patrol routing"
      ],
      runtimeOperations,
      executionLogs: [...executionLogs, "State Commited successfully."]
    };
  } else if (scenarioId === 'steampunk-airship') {
    if (cleanEvent.includes('boiler') || cleanEvent.includes('steam') || cleanEvent.includes('stabilize')) {
      narrative = "Clara grabs her heavy brass wrench and climbs the shuddering pipe scaffold. With a forceful twist of the primary release valve, she vents a roaring jet of blue aether-steam into the exhaust channels. The boiler pressure needles settle back from the red-line. 'Boiler stabilized!' she shouts through the tube.";
      nextState.world.weather = "Stormy (Boiler pressure normal)";
      nextState.player.hp = Math.max(10, nextState.player.hp - 10); // Heat burn
      nextState.story.flags.boiler_stabilized = true;
      nextState.characters.ignis.relationship = Math.min(100, nextState.characters.ignis.relationship + 15);
      nextState.characters.ignis.status = "Stable (Vented)";
      nextState.story.activeQuests = nextState.story.activeQuests.map((q: any) =>
        q.id === 'stabilize-boiler' ? { ...q, status: 'completed' as const } : q
      );
      runtimeOperations = [
        "Quest Completed: Aether Redline",
        "Player HP: -10 (Steam heat scald)",
        "Relationship(Ignis): +15",
        "Story Flag Committed: boiler_stabilized = true"
      ];
    } else if (cleanEvent.includes('goggles') || cleanEvent.includes('equip') || cleanEvent.includes('examine')) {
      narrative = "Clara slips on her Aether-Goggles. Flickering on the brass gears, the specialized lenses reveal the structural flow of the engines. Highlighting a hidden crawlspace under auxiliary engine 2, she spots a dark, oily footprint and a discarded mechanical tool that doesn't belong to the crew.";
      nextState.story.flags.goggles_equipped = true;
      nextState.story.flags.saboteur_identified = true;
      nextState.player.inventory = nextState.player.inventory.filter((i: string) => i !== 'Aether-Goggles');
      nextState.player.inventory.push('Saboteur\'s Scrap-Tool');
      runtimeOperations = [
        "Inventory Update: -Aether-Goggles, +Saboteur's Scrap-Tool",
        "Story Flags Committed: goggles_equipped = true, saboteur_identified = true",
        "Discovery: Saboteur evidence located"
      ];
    } else {
      narrative = `Clara performs: "${event}". The Zephyr sways violently under a heavy cloud draft, throwing Clara against the metal catwalk. High-pressure steam continues to hiss menacingly from the central main boilers, which are ticking dangerously.`;
      nextState.player.hp = Math.max(10, nextState.player.hp - 15);
      runtimeOperations = [
        "Environmental Reaction: Heavy airship tilt",
        "Player HP: -15 (Catwalk crash injury)"
      ];
    }

    nextMemory.working = ["The boiler pressure is currently controlled.", "Saboteur tracks discovered in the engine deck."];
    nextMemory.episode.push(`Player executed: ${event}`);

    return {
      provider: "simulator",
      narrative,
      state: nextState,
      memory: nextMemory,
      playerChoices: [
        "Speak to Captain Sterling over the communication-tube regarding the saboteur evidence",
        "Help Ignis repair the cracked regulator gear using your brass wrench",
        "Pour the Blue Fluid Vial into the primary boiler to catalyze the fuel",
        "Inspect the auxiliary engine chamber more thoroughly"
      ],
      runtimeOperations,
      executionLogs: [...executionLogs, "State Commited successfully."]
    };
  } else if (scenarioId === 'wuxia-trial') {
    if (cleanEvent.includes('符文') || cleanEvent.includes('机关') || cleanEvent.includes('触碰') || cleanEvent.includes('顺序')) {
      narrative = "林砚秋按剑诀诗中暗藏的方位——左三右四，上二下一——逐字碰触石壁上的刻痕。指尖每过一处，青石便发出一声低沉的嗡鸣，如同潮水拍岸。当最后一字落定，整面石壁轰然中分，露出一条向下的石阶密道。一股清冽的剑气自深处涌出，吹得火折明灭不定。无崖子缓缓站起，声音沙哑却清晰：'潮生剑诀……等了你三十年。'";
      nextState.story.flags.secret_chamber_open = true;
      nextState.story.flags.wuyazi_trusted = true;
      nextState.world.location = "苍山深处：剑诀密室";
      nextState.characters.wuyazi.relationship = Math.min(100, nextState.characters.wuyazi.relationship + 20);
      nextState.characters.wuyazi.status = "清醒";
      nextState.characters.wuyazi.currentActivity = "稳步走向密道入口，示意林砚秋跟上。";
      nextState.story.activeQuests = nextState.story.activeQuests.map((q: any) =>
        q.id === 'decipher-poem' ? { ...q, status: 'completed' as const } : q
      );
      runtimeOperations = [
        "Quest Completed: 石壁残诗",
        "Location Update: 苍山深处：剑诀密室",
        "Relationship(无崖子): +20",
        "Story Flags Committed: secret_chamber_open = true, wuyazi_trusted = true"
      ];
    } else if (cleanEvent.includes('石壁') || cleanEvent.includes('诗') || cleanEvent.includes('碑文')) {
      narrative = "林砚秋举起火折，凑近石壁。飞鱼纹章之下，一行行剑诀以铁画银钩的笔法刻入青石——「潮生碧落」「剑起沧溟」「七返还转」「水断云横」……唯独末句处被人以利器凿去，只留下斑驳的凿痕。但他的手刚触碰那凿痕，石壁上竟透出一层淡淡的荧光，残缺字迹若隐若现——这石碑另有机关！";
      nextState.story.flags.poem_identified = true;
      if (!nextState.player.inventory.includes('剑谱拓片'))
        nextState.player.inventory.push('剑谱拓片');
      nextState.characters.wuyazi.relationship = Math.min(100, nextState.characters.wuyazi.relationship + 15);
      nextState.characters.wuyazi.currentActivity = "微微睁开眼，盯着林砚秋手中的拓片，嘴角浮起一丝笑意。";
      runtimeOperations = [
        "Story Flag Committed: poem_identified = true",
        "Inventory Added: 剑谱拓片",
        "Relationship(无崖子): +15"
      ];
    } else {
      narrative = `林砚秋${event.includes('尝试') ? '' : '尝试'}: "${event}"。石窟内只有水滴声回应。石壁上的字迹在火折微光下缥缈如雾，无崖子依旧垂目不语，仿佛一尊石雕。`;
      nextState.player.hp = Math.max(10, nextState.player.hp - 5);
      runtimeOperations = [
        "State Update: 石窟阴寒之气侵蚀",
        "Player HP: -5（寒气入体）"
      ];
    }

    nextMemory.working = ["石壁残诗已拓下，末句虽缺，但荧光暗示机关存在。", "无崖子的态度似乎因拓片而有所松动。"];
    nextMemory.episode.push(`Player executed: ${event}`);

    return {
      provider: "simulator",
      narrative,
      state: nextState,
      memory: nextMemory,
      playerChoices: [
        "对照剑谱拓片，尝试按诗句中的方位顺序触碰石壁",
        "走向无崖子，将半块玉玦递给他看",
        "用观澜铁剑的剑尖轻叩石壁，试探机关",
        "服下一颗金创药，运功调息恢复伤势"
      ],
      runtimeOperations,
      executionLogs: [...executionLogs, "State Commited successfully."]
    };
  } else {
    // Cosmic Horror Fallback
    if (cleanEvent.includes('bookshelf') || cleanEvent.includes('passage') || cleanEvent.includes('clue')) {
      narrative = "Arthur traces his fingers along the decaying spines of Lord Blackwood's ledger collection. Suddenly, his finger catches on a leather book embossed with a golden tide symbol. Pulling it triggers a soft mechanical click. A heavy bookcase swings back silently, revealing a narrow stone spiral staircase descending into the dark.";
      nextState.story.flags.unlocked_secret_compartment = true;
      nextState.world.location = "Blackwood Manor: Secret Cellar Passage";
      if (!nextState.player.inventory.includes('Torn Diary Page'))
        nextState.player.inventory.push('Torn Diary Page');
      nextState.player.statusEffects = [...new Set([...nextState.player.statusEffects, 'Sanity Sapped (Mild)'])];
      nextState.story.activeQuests = nextState.story.activeQuests.map((q: any) =>
        q.id === 'find-clues' ? { ...q, status: 'completed' as const } : q
      );
      runtimeOperations = [
        "Quest Completed: Whispers of Evelyn",
        "Location Update: Blackwood Manor: Secret Cellar Passage",
        "Inventory Added: Torn Diary Page",
        "Status Effect Added: Sanity Sapped (Mild)",
        "Story Flag Committed: unlocked_secret_compartment = true"
      ];
    } else if (cleanEvent.includes('lantern') || cleanEvent.includes('light')) {
      narrative = "Arthur raises his kerosene lantern high. The golden flame casts long, dancing shadows across the gothic library. For a brief second, the shadows cast by the bookshelves do not match their physical shapes—they stretch like grasping tentacles toward him before snapping back to normal.";
      nextState.player.statusEffects = nextState.player.statusEffects.filter((s: string) => s !== 'Creeping Dread (Mild)');
      runtimeOperations = [
        "Status Effect Removed: Creeping Dread (Mild)",
        "Environment: Lantern cast shadows distort"
      ];
    } else {
      narrative = `Arthur attempts: "${event}". As he does, a chilling wind whistles through the wooden window frames. The strange scraping noise behind the shelves intensifies, and he hears what sounds like a soft, distorted woman's voice calling: 'Arthur... down here...'`;
      nextState.player.hp = Math.max(10, nextState.player.hp - 5);
      runtimeOperations = [
        "State Update: Creeping dread mental toll",
        "Player HP: -5 (Mental shock)"
      ];
    }

    nextMemory.working = ["The secret cellar passage lies open.", "Eerie whispers are echoing louder."];
    nextMemory.episode.push(`Player executed: ${event}`);

    return {
      provider: "simulator",
      narrative,
      state: nextState,
      memory: nextMemory,
      playerChoices: [
        "Descend the secret stone staircase into the pitch-black cellar",
        "Carefully examine the Torn Diary Page under the lantern light",
        "Confront Silas the groundskeeper through the window before going deeper",
        "Read the mysterious leather-bound tome on the library desk"
      ],
      runtimeOperations,
      executionLogs: [...executionLogs, "State Commited successfully."]
    };
  }
}

// ---------------- API ENDPOINTS ----------------

// Reset / Initialize Endpoint
app.post("/api/inr/init", (req, res) => {
  const { scenarioId } = req.body;
  res.json({ status: "ready", scenarioId });
});

// Event Processor Endpoint
app.post("/api/inr/event", async (req, res) => {
  const { scenarioId, state, memory, event, llmConfig } = req.body;

  if (!scenarioId || !state || !memory || !event) {
    return res.status(400).json({ error: "Missing required fields (scenarioId, state, memory, event)" });
  }

  try {
    const openAIConfig = readOpenAIConfig(llmConfig) ?? envOpenAIConfig;

    // Context composition for LLM providers
    const systemPrompt = `You are the execution engine of an event-driven Interactive Narrative Runtime (INR).
Your responsibility is to compute the next state of the world, player, characters, memory, and quests, and generate a concise narrative continuation.

Strict execution loop:
1. Event Parsing: Determine "What event occurred?" from the input Event.
2. Context Composition: Assemble the context layers:
   - Scenario & World facts
   - Memory layers (Working, Episode, Semantic, Archive)
   - Player & Character states
3. Narrative Reasoning: Resolve the event's consequences logically based on player attributes, relationships, and world circumstances. Maintain world, character, and temporal consistency.
4. State Update: Commit updates to:
   - World State (day, time, weather, details)
   - Player State (hp, statusEffects, inventory, attributes)
   - Character State (relationships, currentActivity, status)
   - Story State (quests progress, story flags)
5. Memory Evolution: Shift elements between Working, Episode, Semantic, and Archive layers.
   - Working: items currently in immediate focus.
   - Episode: add the most recent event to the list of chronological events.
   - Semantic: stable, verified facts.
   - Archive: old facts no longer actively queried.
6. Structured Commit: Output the updated state, narrative, choices, and logs.

Important Rules:
- DO NOT generate overly long flowery prose. Keep the "narrative" field under 100-120 words.
- Maintain consistency! For example, if Kaelen is in Sector 7 and goes to the cyber-lounge, update world.location to "Sector 7: Red Line Cyber-Lounge".
- Ensure the state update is reflected completely in the JSON response's "state" object. Keep unmodified fields as they are, but update stats, locations, inventories, active quests status, and character relationships correctly.
- Generate 3 to 5 highly relevant "playerChoices" that arise naturally from the updated state and surroundings.
- Describe the exact state operations performed in "runtimeOperations" using human-readable committed updates (e.g. "Inventory: +Old Key", "Relationship(Silas): -10").
- Provide 4-6 lines of technical-looking step-by-step telemetry logs in "executionLogs" showing the runtime process (e.g., "Event parsed: PlayerChoice(Speak to Silas)", "Composing context: Silas cold relationship, library location", "Narrative Reasoning: Silas remains uncooperative but slips hint", "State Commit: Relationship updated, memory appended").`;

    const userContents = `
=== CURRENT IN-GAME STATE ===
${JSON.stringify(state, null, 2)}

=== MEMORY LAYERS ===
${JSON.stringify(memory, null, 2)}

=== PLAYER EVENT / ACTION ===
"${event}"

Generate the next state, memory, narrative, choices, operations, and execution logs using the schema.`;

    // Define response schema
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        narrative: {
          type: Type.STRING,
          description: "A short, atmospheric paragraph (under 120 words) detailing what happens next in response to the action."
        },
        state: {
          type: Type.OBJECT,
          properties: {
            world: {
              type: Type.OBJECT,
              properties: {
                currentDay: { type: Type.INTEGER },
                weather: { type: Type.STRING },
                time: { type: Type.STRING },
                location: { type: Type.STRING },
                details: { type: Type.OBJECT }
              },
              required: ["currentDay", "weather", "time", "location"]
            },
            player: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                hp: { type: Type.INTEGER },
                maxHp: { type: Type.INTEGER },
                inventory: { type: Type.ARRAY, items: { type: Type.STRING } },
                statusEffects: { type: Type.ARRAY, items: { type: Type.STRING } },
                attributes: { type: Type.OBJECT }
              },
              required: ["name", "hp", "maxHp", "inventory", "statusEffects", "attributes"]
            },
            characters: {
              type: Type.OBJECT,
              description: "Active character record mapping character IDs to their updated attributes."
            },
            story: {
              type: Type.OBJECT,
              properties: {
                activeQuests: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      status: { type: Type.STRING }
                    },
                    required: ["id", "title", "description", "status"]
                  }
                },
                completedEvents: { type: Type.ARRAY, items: { type: Type.STRING } },
                flags: { type: Type.OBJECT }
              },
              required: ["activeQuests", "completedEvents", "flags"]
            }
          },
          required: ["world", "player", "characters", "story"]
        },
        memory: {
          type: Type.OBJECT,
          properties: {
            working: { type: Type.ARRAY, items: { type: Type.STRING } },
            episode: { type: Type.ARRAY, items: { type: Type.STRING } },
            semantic: { type: Type.ARRAY, items: { type: Type.STRING } },
            archive: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["working", "episode", "semantic", "archive"]
        },
        playerChoices: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        runtimeOperations: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        executionLogs: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      },
      required: ["narrative", "state", "memory", "playerChoices", "runtimeOperations", "executionLogs"]
    };

    let parsedResponse: INREventResponse;

    if (openAIConfig) {
      console.log(`🤖 Invoking OpenAI-compatible API ('${openAIConfig.model}') for action: "${event}"`);
      const systemWithSchema = `${systemPrompt}\n\nYou MUST respond with valid JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}`;
      const rawJson = await callOpenAICompat(
        [{ role: "system", content: systemWithSchema }, { role: "user", content: userContents }],
        openAIConfig
      );
      parsedResponse = JSON.parse(rawJson) as INREventResponse;
    } else {
      const ai = getGeminiClient();
      console.log(`🤖 Invoking Gemini API ('${GEMINI_MODEL}') for action: "${event}"`);

      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: userContents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.2 // Lower temp for strict state consistency
        }
      });

      parsedResponse = JSON.parse(result.text || "{}") as INREventResponse;
    }

    return res.json(parsedResponse);

  } catch (err) {
    console.log("⚠️ API Mode failed or skipped. running in Simulator Mode fallback.");
    const fallbackResponse = runSimulatorFallback(scenarioId, state, memory, event);
    const { provider: _provider, ...fallbackV1 } = fallbackResponse;
    return res.json({
      ...fallbackV1,
      executionLogs: [
        "API Error: " + (err instanceof Error ? err.message : String(err)),
        ...fallbackResponse.executionLogs
      ]
    });
  }
});

// Event Processor Endpoint v2 — operations protocol (ADR-003/ADR-007)
// LLM outputs typed operations; RuntimeController validates & applies them. Runtime owns state.
app.post("/api/inr/event/v2", async (req, res) => {
  const { scenarioId, state, memory, event, llmConfig } = req.body;

  if (!scenarioId || !state || !memory || !event) {
    return res.status(400).json({ error: "Missing required fields (scenarioId, state, memory, event)" });
  }

  const openAIConfig = readOpenAIConfig(llmConfig) ?? envOpenAIConfig;

  // ponytail: fresh controller per call — state still roundtrips via HTTP; server-side sessions are a later step
  const runtime = new RuntimeController(state, memory);

  try {
    const systemPrompt = `You are the execution engine of an event-driven Interactive Narrative Runtime (INR).
You DO NOT output game state. The runtime owns state. You output a list of typed OPERATIONS the runtime will validate and apply.

Available operation types (output exactly these shapes in the "operations" array):
- { "type": "DamagePlayer", "amount": <positive int>, "source": "<cause>" }
- { "type": "HealPlayer", "amount": <positive int> }
- { "type": "AddItem", "itemId": "<item name>" }
- { "type": "RemoveItem", "itemId": "<item name, must exist in inventory>" }
- { "type": "UpdateLocation", "location": "<new location string>" }
- { "type": "ModifyRelationship", "characterId": "<existing character id>", "delta": <int, +/-> }
- { "type": "UpdateQuestStatus", "questId": "<existing quest id>", "status": "active" | "completed" | "failed" }
- { "type": "SetFlag", "key": "<flag key>", "value": true | false }

Execution loop:
1. Parse the player event.
2. Reason over the provided state and memory layers for consequences. Maintain world, character, and temporal consistency.
3. Emit the MINIMAL set of operations that realize those consequences. Do not emit no-op changes.
4. Write a short narrative (under 120 words) consistent with the operations you emitted.
5. Generate 3 to 5 relevant "playerChoices" arising naturally from the outcome.
6. Provide 4-6 lines of technical telemetry in "executionLogs" (e.g. "Event parsed: ...", "Reasoning: ...", "Emitting 3 operations").

Rules:
- characterId MUST be one of the keys in the provided characters record; questId MUST be an existing quest id.
- Only remove items that are present in the inventory.
- Amounts are positive integers; direction is encoded by the operation type (Damage vs Heal).`;

    const userContents = `
=== CURRENT IN-GAME STATE (read-only; you cannot edit it directly) ===
${JSON.stringify(state, null, 2)}

=== MEMORY LAYERS ===
${JSON.stringify(memory, null, 2)}

=== PLAYER EVENT / ACTION ===
"${event}"

Output narrative, operations, playerChoices, executionLogs per the schema.`;

    // Operations schema: one flat object shape covering the union; runtime type-guard + validator enforce details
    const operationsSchema = {
      type: Type.OBJECT,
      properties: {
        narrative: {
          type: Type.STRING,
          description: "A short, atmospheric paragraph (under 120 words) describing what happens."
        },
        operations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, description: "One of: DamagePlayer, HealPlayer, AddItem, RemoveItem, UpdateLocation, ModifyRelationship, UpdateQuestStatus, SetFlag" },
              amount: { type: Type.INTEGER, nullable: true },
              source: { type: Type.STRING, nullable: true },
              itemId: { type: Type.STRING, nullable: true },
              location: { type: Type.STRING, nullable: true },
              characterId: { type: Type.STRING, nullable: true },
              delta: { type: Type.INTEGER, nullable: true },
              questId: { type: Type.STRING, nullable: true },
              status: { type: Type.STRING, nullable: true },
              key: { type: Type.STRING, nullable: true },
              value: { type: Type.BOOLEAN, nullable: true }
            },
            required: ["type"]
          }
        },
        playerChoices: { type: Type.ARRAY, items: { type: Type.STRING } },
        executionLogs: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["narrative", "operations", "playerChoices", "executionLogs"]
    };

    let parsed: any;
    let provider: "gemini" | "openai-compat" = "gemini";

    if (openAIConfig) {
      provider = "openai-compat";
      console.log(`🤖 [v2] Invoking OpenAI-compatible API ('${openAIConfig.model}') for action: "${event}"`);
      const systemWithSchema = `${systemPrompt}\n\nYou MUST respond with valid JSON matching this schema:\n${JSON.stringify(operationsSchema, null, 2)}`;
      const rawJson = await callOpenAICompat(
        [{ role: "system", content: systemWithSchema }, { role: "user", content: userContents }],
        openAIConfig
      );
      parsed = JSON.parse(rawJson);
    } else {
      const ai = getGeminiClient();
      console.log(`🤖 [v2] Invoking Gemini API ('${GEMINI_MODEL}') for action: "${event}"`);

      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: userContents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: operationsSchema,
          temperature: 0.2
        }
      });

      parsed = JSON.parse(result.text || "{}");
    }

    // Trust boundary: shape-check raw LLM output before treating as Operations
    const rawOps: unknown[] = Array.isArray(parsed.operations) ? parsed.operations : [];
    const wellFormed: Operation[] = [];
    const malformed: unknown[] = [];
    for (const raw of rawOps) {
      // Strip nulls injected by the flat schema before the type guard
      const cleaned = Object.fromEntries(Object.entries(raw as object).filter(([, v]) => v !== null && v !== undefined));
      if (isOperation(cleaned)) wellFormed.push(cleaned);
      else malformed.push(raw);
    }

    const { applied, rejected } = runtime.applyOperations(wellFormed);

    if (!runtime.checkInvariants()) {
      throw new Error("Invariant violation after applying operations");
    }

    runtime.appendEpisode(`Player executed: ${event}`);

    return res.json({
      provider: provider,
      narrative: parsed.narrative,
      state: runtime.getState(),
      memory: runtime.getMemory(),
      playerChoices: parsed.playerChoices ?? [],
      runtimeOperations: [
        ...applied.map((op) => `Applied ${op.type}: ${JSON.stringify(op)}`),
        ...rejected.map((r) => `Rejected ${r.op.type}: ${r.reason}`)
      ],
      executionLogs: [
        ...(parsed.executionLogs ?? []),
        `Runtime: ${applied.length} operation(s) applied`,
        rejected.length > 0 ? `Runtime: ${rejected.length} operation(s) rejected by validator` : null,
        malformed.length > 0 ? `Runtime: ${malformed.length} malformed operation(s) discarded` : null
      ].filter(Boolean)
    });

  } catch (err) {
    console.log("⚠️ [v2] API Mode failed or skipped. Running Simulator fallback.");
    const fallbackResponse = runSimulatorFallback(scenarioId, state, memory, event);
    return res.json({
      ...fallbackResponse,
      provider: "simulator",
      executionLogs: [
        "API Error: " + (err instanceof Error ? err.message : String(err)),
        ...fallbackResponse.executionLogs
      ]
    });
  }
});

// Serve compiled static files in production
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  // Mount Vite middleware in development
  import("vite").then(async (viteModule) => {
    const vite = await viteModule.createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 INR Runtime Server listening at http://localhost:${PORT}`);
});
