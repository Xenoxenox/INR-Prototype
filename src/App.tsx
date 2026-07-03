import { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Shield,
  Heart,
  Zap,
  User,
  Users,
  Compass,
  Scroll,
  Clock,
  BookOpen,
  Terminal,
  Sliders,
  ChevronRight,
  Play,
  RotateCcw,
  AlertTriangle,
  Eye,
  Plus,
  Trash2,
  HelpCircle,
  Activity,
  Cpu,
  Layers,
  FileText,
  KeyRound
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { SCENARIOS } from "./scenarios";
import { Scenario, RuntimeState, MemoryLayers, NarrativeTurn, Quest, CharacterState } from "./types";

type LLMConfig = { baseUrl: string; apiKey: string; model: string };
const emptyLlmConfig: LLMConfig = { baseUrl: "", apiKey: "", model: "" };

export default function App() {
  // Scenario & Game States
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [gameState, setGameState] = useState<RuntimeState | null>(null);
  const [memoryState, setMemoryState] = useState<MemoryLayers | null>(null);
  const [history, setHistory] = useState<NarrativeTurn[]>([]);
  const [playerChoices, setPlayerChoices] = useState<string[]>([]);
  const [latestNarrative, setLatestNarrative] = useState<string>("");
  const [latestOperations, setLatestOperations] = useState<string[]>([]);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);

  // UI State
  const [customEvent, setCustomEvent] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"narrative" | "memory" | "telemetry" | "state-editor">("narrative");
  const [isDevConsoleOpen, setIsDevConsoleOpen] = useState<boolean>(false);
  const [isSimulatorMode, setIsSimulatorMode] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => {
    try {
      const saved = localStorage.getItem("inr.openaiCompatConfig");
      if (!saved) return emptyLlmConfig;
      const parsed = JSON.parse(saved) as Partial<LLMConfig>;
      return {
        baseUrl: parsed.baseUrl ?? "",
        apiKey: parsed.apiKey ?? "",
        model: parsed.model ?? ""
      };
    } catch {
      return emptyLlmConfig;
    }
  });

  // Scroll ref for narrative log
  const narrativeEndRef = useRef<HTMLDivElement>(null);

  // Initialize a scenario
  const handleSelectScenario = async (scenario: Scenario) => {
    setIsLoading(true);
    setErrorBanner(null);
    try {
      const response = await fetch("/api/inr/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: scenario.id }),
      });
      const data = await response.json();

      if (data.status === "ready") {
        setSelectedScenario(scenario);
        setGameState(JSON.parse(JSON.stringify(scenario.initialState)));
        setMemoryState(JSON.parse(JSON.stringify(scenario.initialMemory)));
        setHistory([]);
        setLatestNarrative(scenario.description);
        setLatestOperations(["System Initialization", "Asset Cache Loaded"]);
        setPlayerChoices(scenario.id === 'cyberpunk-detective' ? [
          "Decrypt the Saito Datacore immediately inside the noodle alley",
          "Confront Vex in the Red Line cyber-lounge about the data",
          "Inject the Neural-Dampener to clear your optic glitch feedback",
          "Inspect the dark dumpster corners for Saito security sensors"
        ] : scenario.id === 'steampunk-airship' ? [
          "Climb the maintenance scaffolds to stabilize the main steam boiler",
          "Equip your Aether-Goggles to scan the layout for mechanical anomalies",
          "Yell update reports back to Captain Sterling via the communication tube",
          "Inspect the overheating clockwork maintenance automaton Ignis"
        ] : [
          "Inspect the dark, eastern bookshelves for the Tide Passage lock",
          "Raise your kerosene lantern to fully illuminate the shadowed alcoves",
          "Slip the letter from Evelyn into your breast pocket and search the desk",
          "Read the heavy, leather-bound grimoire sitting open on the oak table"
        ]);
        setExecutionLogs([
          "INR Engine boot sequence initiated...",
          "Asset Load: Scenario configuration parsed.",
          "Context Layer 1: Rules configured",
          "Context Layer 2: Scenario baseline verified",
          "Context Layer 3: Initial characters spawned",
          "INR Simulator ready. Input Player action to run event-loop."
        ]);
        // Set first narrative history
        setHistory([{
          id: "init",
          event: "Scenario Started",
          narrative: scenario.description,
          runtimeOperations: ["State Initialize", "World Frame Ready"],
          timestamp: new Date().toLocaleTimeString()
        }]);
      }
    } catch (err) {
      setErrorBanner("Failed to communicate with INR server. Falling back to local Client execution.");
      setSelectedScenario(scenario);
      setGameState(JSON.parse(JSON.stringify(scenario.initialState)));
      setMemoryState(JSON.parse(JSON.stringify(scenario.initialMemory)));
      setHistory([{
        id: "init",
        event: "Scenario Started",
        narrative: scenario.description,
        runtimeOperations: ["Local Sandbox Mode Mode Activated"],
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Run the Event Loop on action select/submit
  const handleExecuteEvent = async (eventText: string) => {
    if (!eventText.trim() || isLoading || !selectedScenario || !gameState || !memoryState) return;

    setIsLoading(true);
    setCustomEvent("");
    setErrorBanner(null);

    // Append standard logs to show the start of the event driven loop
    setExecutionLogs(prev => [
      ...prev,
      `🔄 Event Dispatched: "${eventText}"`,
      "State locked. Fetching context constraints...",
    ]);

    try {
      const trimmedLlmConfig = {
        baseUrl: llmConfig.baseUrl.trim(),
        apiKey: llmConfig.apiKey.trim(),
        model: llmConfig.model.trim()
      };
      const requestLlmConfig = trimmedLlmConfig.baseUrl && trimmedLlmConfig.apiKey && trimmedLlmConfig.model
        ? trimmedLlmConfig
        : null;

      // v2: operations protocol — state is computed by the server-side RuntimeController,
      // this component only caches what the runtime returns (plan D3/Option A)
      const response = await fetch("/api/inr/event/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: selectedScenario.id,
          state: gameState,
          memory: memoryState,
          event: eventText,
          ...(requestLlmConfig ? { llmConfig: requestLlmConfig } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const result = await response.json();

      // Check if we are running in API or Simulator mode
      const hasApiError = result.executionLogs?.some((log: string) => log.includes("API Error"));
      setIsSimulatorMode(hasApiError);

      setLatestNarrative(result.narrative);
      setGameState(result.state);
      setMemoryState(result.memory);
      setPlayerChoices(result.playerChoices);
      setLatestOperations(result.runtimeOperations);
      setExecutionLogs(result.executionLogs || []);

      // Append to chronological run history
      setHistory(prev => [
        ...prev,
        {
          id: Math.random().toString(36).substr(2, 9),
          event: eventText,
          narrative: result.narrative,
          runtimeOperations: result.runtimeOperations,
          timestamp: new Date().toLocaleTimeString()
        }
      ]);

      // Automatically switch to narrative tab to show progression
      setActiveTab("narrative");

    } catch (err) {
      setErrorBanner("Server processing error. Triggered fallback simulator locally.");
      console.error(err);
      // Hard fallback on network or parse error
      setExecutionLogs(prev => [...prev, "ERROR: Fetch failed. Launching Client local engine."]);
    } finally {
      setIsLoading(false);
    }
  };

  // Scroll to bottom of narrative log
  useEffect(() => {
    narrativeEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, latestNarrative]);

  useEffect(() => {
    localStorage.setItem("inr.openaiCompatConfig", JSON.stringify(llmConfig));
  }, [llmConfig]);

  // Dev state modification helpers
  const handleModifyAttribute = (key: string, val: number) => {
    if (!gameState) return;
    setGameState({
      ...gameState,
      player: {
        ...gameState.player,
        attributes: {
          ...gameState.player.attributes,
          [key]: val
        }
      }
    });
    setLatestOperations(prev => [...prev, `Developer Overrode Attribute [${key}] to ${val}`]);
  };

  const handleModifyHP = (val: number) => {
    if (!gameState) return;
    const boundedHP = Math.max(0, Math.min(gameState.player.maxHp, val));
    setGameState({
      ...gameState,
      player: {
        ...gameState.player,
        hp: boundedHP
      }
    });
    setLatestOperations(prev => [...prev, `Developer Overrode HP to ${boundedHP}`]);
  };

  const handleModifyRelationship = (charId: string, val: number) => {
    if (!gameState) return;
    setGameState({
      ...gameState,
      characters: {
        ...gameState.characters,
        [charId]: {
          ...gameState.characters[charId],
          relationship: Math.max(-100, Math.min(100, val))
        }
      }
    });
    setLatestOperations(prev => [...prev, `Developer Overrode Relationship [${charId}] to ${val}`]);
  };

  const handleAddItem = (item: string) => {
    if (!gameState || !item.trim()) return;
    setGameState({
      ...gameState,
      player: {
        ...gameState.player,
        inventory: [...gameState.player.inventory, item]
      }
    });
    setLatestOperations(prev => [...prev, `Developer Added Item to Inventory: +${item}`]);
  };

  const handleRemoveItem = (index: number) => {
    if (!gameState) return;
    const item = gameState.player.inventory[index];
    setGameState({
      ...gameState,
      player: {
        ...gameState.player,
        inventory: gameState.player.inventory.filter((_, idx) => idx !== index)
      }
    });
    setLatestOperations(prev => [...prev, `Developer Removed Item: -${item}`]);
  };

  const handleAddQuest = (id: string, title: string, desc: string) => {
    if (!gameState || !title.trim()) return;
    const newQuest: Quest = {
      id: id || `quest-${Math.random().toString(36).substr(2, 5)}`,
      title,
      description: desc,
      status: "active"
    };
    setGameState({
      ...gameState,
      story: {
        ...gameState.story,
        activeQuests: [...gameState.story.activeQuests, newQuest]
      }
    });
    setLatestOperations(prev => [...prev, `Developer Added Quest: ${title}`]);
  };

  const handleToggleQuestStatus = (questId: string) => {
    if (!gameState) return;
    setGameState({
      ...gameState,
      story: {
        ...gameState.story,
        activeQuests: gameState.story.activeQuests.map(q => {
          if (q.id === questId) {
            const nextStatus = q.status === 'active' ? 'completed' : q.status === 'completed' ? 'failed' : 'active';
            return { ...q, status: nextStatus };
          }
          return q;
        })
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500/30 selection:text-teal-200">
      
      {/* Top Banner & Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-teal-500/10 border border-teal-500/30 rounded-lg flex items-center justify-center text-teal-400">
            <Cpu className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-sans font-bold text-lg tracking-tight text-white">INR Prototype</h1>
              <span className="text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded font-mono uppercase tracking-wider">
                V1.0.5
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">Interactive Narrative Runtime Engine</p>
          </div>
        </div>

        {/* State / Key Status */}
        <div className="flex items-center gap-4">
          {selectedScenario && (
            <div className="hidden md:flex items-center gap-2 text-xs font-mono bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-md">
              <span className="text-slate-500">Scenario:</span>
              <span className="text-teal-400 font-semibold">{selectedScenario.title}</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-500 font-mono">Location:</span>
              <span className="text-slate-300 font-semibold">{gameState?.world.location}</span>
            </div>
          )}

          {/* Mode Indicator */}
          {selectedScenario && (
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-md border border-slate-800 text-xs font-mono">
              <div className={`h-2.5 w-2.5 rounded-full ${isSimulatorMode ? 'bg-amber-500 animate-pulse' : 'bg-green-500 animate-pulse'}`} />
              <span className={isSimulatorMode ? 'text-amber-400 font-medium' : 'text-green-400 font-medium'}>
                {isSimulatorMode ? 'Simulator Mode' : 'Gemini AI Mode'}
              </span>
              <div className="group relative">
                <HelpCircle className="h-3.5 w-3.5 text-slate-500 hover:text-slate-300 cursor-pointer" />
                <div className="absolute right-0 top-6 hidden group-hover:block w-72 bg-slate-900 border border-slate-800 text-[11px] p-3 rounded-lg shadow-xl text-slate-300 z-50">
                  {isSimulatorMode ? (
                    "No API Key provided in Secrets panel. Running on static fallback simulation. Set GEMINI_API_KEY to unlock limitless generative possibilities!"
                  ) : (
                    "Running on full-stack server-side Gemini 3.5. Generates narrative prose, dynamic choices, state updates, and updates the memory hierarchy."
                  )}
                </div>
              </div>
            </div>
          )}

          {selectedScenario && (
            <button
              onClick={() => {
                setSelectedScenario(null);
                setGameState(null);
                setMemoryState(null);
                setHistory([]);
              }}
              className="px-3 py-1.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-300 rounded transition flex items-center gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Scenario
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          {!selectedScenario ? (
            /* Scenario Selection Screen */
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="flex-1 p-8 overflow-y-auto max-w-6xl mx-auto flex flex-col justify-center min-h-[80vh]"
            >
              <div className="text-center max-w-2xl mx-auto mb-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 font-mono text-xs mb-4">
                  <Sparkles className="h-3 w-3 animate-spin" />
                  PERSISTENT COGNITIVE NARRATIVE ARCHITECTURE
                </div>
                <h2 className="text-4xl font-extrabold tracking-tight text-white mb-3">
                  Select Narrative Scenario
                </h2>
                <p className="text-slate-400 leading-relaxed text-sm">
                  Choose an environment framework to initialize. Each scenario contains dedicated
                  initial state vectors, relationships, story flags, and deep cognitive memory layers.
                </p>
              </div>

              {/* Grid of Scenarios */}
              <div className="grid md:grid-cols-3 gap-6 mb-12">
                {SCENARIOS.map((scenario) => {
                  const isCyber = scenario.id === 'cyberpunk-detective';
                  const isSteam = scenario.id === 'steampunk-airship';
                  return (
                    <div
                      key={scenario.id}
                      onClick={() => handleSelectScenario(scenario)}
                      className="group relative bg-slate-900/40 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-6 cursor-pointer transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-lg hover:shadow-teal-950/20"
                    >
                      {/* Gradient overlay background */}
                      <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${
                        isCyber ? 'from-pink-500 to-cyan-500' : isSteam ? 'from-amber-500 to-yellow-500' : 'from-emerald-500 to-teal-500'
                      }`} />
                      
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-[10px] font-mono tracking-wider uppercase text-slate-500 bg-slate-950 px-2 py-0.5 rounded">
                            {scenario.genre}
                          </span>
                        </div>
                        <h3 className="text-xl font-bold text-white group-hover:text-teal-400 transition mb-2">
                          {scenario.title}
                        </h3>
                        <p className="text-slate-400 text-xs leading-relaxed mb-6">
                          {scenario.description}
                        </p>
                      </div>

                      <div className="pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono text-slate-500 group-hover:text-slate-300 transition">
                        <span>Initialize Runtime</span>
                        <ChevronRight className="h-4 w-4 transform group-hover:translate-x-1 transition" />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-slate-900/30 border border-slate-800 rounded-lg p-5 max-w-4xl mx-auto mb-6 font-mono">
                <div className="flex items-center gap-2 text-teal-400 font-bold mb-4 text-xs uppercase tracking-wider">
                  <KeyRound className="h-4 w-4" />
                  <span>Custom API</span>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <label className="space-y-1 text-[10px] uppercase tracking-wider text-slate-500">
                    <span>Base URL</span>
                    <input
                      type="url"
                      value={llmConfig.baseUrl}
                      onChange={(e) => setLlmConfig({ ...llmConfig, baseUrl: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500/70 rounded px-3 py-2 text-xs text-slate-200 placeholder:text-slate-700 focus:outline-none normal-case tracking-normal"
                    />
                  </label>
                  <label className="space-y-1 text-[10px] uppercase tracking-wider text-slate-500">
                    <span>API Key</span>
                    <input
                      type="password"
                      value={llmConfig.apiKey}
                      onChange={(e) => setLlmConfig({ ...llmConfig, apiKey: e.target.value })}
                      placeholder="sk-..."
                      className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500/70 rounded px-3 py-2 text-xs text-slate-200 placeholder:text-slate-700 focus:outline-none normal-case tracking-normal"
                    />
                  </label>
                  <label className="space-y-1 text-[10px] uppercase tracking-wider text-slate-500">
                    <span>Model</span>
                    <input
                      type="text"
                      value={llmConfig.model}
                      onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
                      placeholder="gpt-4o"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-teal-500/70 rounded px-3 py-2 text-xs text-slate-200 placeholder:text-slate-700 focus:outline-none normal-case tracking-normal"
                    />
                  </label>
                </div>
              </div>

              {/* Config & Telemetry explanation */}
              <div className="bg-slate-900/20 border border-slate-900 rounded-lg p-6 max-w-4xl mx-auto font-mono text-xs text-slate-400">
                <div className="flex items-center gap-2 text-teal-400 font-bold mb-3">
                  <Terminal className="h-4 w-4" />
                  <span>INR EXECUTION PIPELINE BRIEFING</span>
                </div>
                <div className="grid md:grid-cols-3 gap-4 text-[11px] leading-relaxed">
                  <div>
                    <h4 className="text-slate-300 font-bold mb-1">1. Event Dispatch</h4>
                    <p>Every choice or custom prose input is caught as an Event payload, cataloged with timestamp metadata.</p>
                  </div>
                  <div>
                    <h4 className="text-slate-300 font-bold mb-1">2. Core State Reason</h4>
                    <p>Calculates dynamic adjustments (HP, relations, story state flags) securely server-side relative to variables.</p>
                  </div>
                  <div>
                    <h4 className="text-slate-300 font-bold mb-1">3. Cognitive Commit</h4>
                    <p>Decays immediate Working Memory into permanent Episode memory logs or Semantic world data layers.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            /* Active Simulation Interface */
            <div className="flex-1 flex overflow-hidden">
              
              {/* Left Sidebar: Runtime State Panel */}
              <div className="w-80 border-r border-slate-800 bg-slate-900/30 flex flex-col overflow-y-auto">
                
                {/* Section: World State */}
                <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                  <div className="flex items-center gap-2 mb-3 text-xs font-mono tracking-wider uppercase text-slate-400">
                    <Compass className="h-4 w-4 text-teal-500" />
                    <span>World State</span>
                  </div>
                  <div className="space-y-2 text-xs font-mono bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                    <div className="flex justify-between border-b border-slate-900 pb-1">
                      <span className="text-slate-500">Day:</span>
                      <span className="text-slate-300 font-bold">{gameState?.world.currentDay}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900 pb-1">
                      <span className="text-slate-500">Weather:</span>
                      <span className="text-slate-300 font-semibold">{gameState?.world.weather}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900 pb-1">
                      <span className="text-slate-500">Time:</span>
                      <span className="text-teal-400 font-semibold">{gameState?.world.time}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Location:</span>
                      <span className="text-slate-200 font-bold text-right truncate max-w-[150px]" title={gameState?.world.location}>
                        {gameState?.world.location}
                      </span>
                    </div>
                  </div>
                  {gameState?.world.details && (
                    <p className="text-[10px] text-slate-400 italic mt-2 leading-normal">
                      {Object.values(gameState.world.details).join(" ")}
                    </p>
                  )}
                </div>

                {/* Section: Player State */}
                <div className="p-4 border-b border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-mono tracking-wider uppercase text-slate-400">
                      <User className="h-4 w-4 text-teal-500" />
                      <span>Player State</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-300">{gameState?.player.name}</span>
                  </div>

                  {/* HP Progress Bar */}
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 mb-3 space-y-2">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-slate-500">Integrity/HP:</span>
                      <span className={`font-bold ${
                        (gameState?.player.hp || 0) < 30 ? "text-red-400 animate-pulse" : (gameState?.player.hp || 0) < 60 ? "text-amber-400" : "text-emerald-400"
                      }`}>
                        {gameState?.player.hp}/{gameState?.player.maxHp}
                      </span>
                    </div>
                    <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          (gameState?.player.hp || 0) < 30 ? "bg-red-500 animate-pulse" : (gameState?.player.hp || 0) < 60 ? "bg-amber-500" : "bg-teal-500"
                        }`}
                        style={{ width: `${((gameState?.player.hp || 0) / (gameState?.player.maxHp || 100)) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Attributes */}
                  <div className="mb-3">
                    <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1.5">Attribute Matrix</span>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                      {gameState && Object.entries(gameState.player.attributes).map(([attr, val]) => (
                        <div key={attr} className="bg-slate-900/60 px-2 py-1.5 rounded border border-slate-850 flex justify-between items-center">
                          <span className="text-slate-400 capitalize">{attr}</span>
                          <span className="text-teal-400 font-semibold">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Inventory */}
                  <div className="mb-2">
                    <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1.5">Cargo Inventory</span>
                    {gameState?.player.inventory.length === 0 ? (
                      <div className="text-slate-500 text-xs font-mono italic p-2 border border-dashed border-slate-850 text-center rounded">
                        Empty Cargo Inventory
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {gameState?.player.inventory.map((item, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] font-mono bg-slate-900/90 text-slate-300 px-2 py-1 rounded border border-slate-800 hover:border-teal-500/50 cursor-pointer transition flex items-center gap-1"
                          >
                            <Zap className="h-2.5 w-2.5 text-teal-400" />
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Status Effects */}
                  {gameState?.player.statusEffects && gameState.player.statusEffects.length > 0 && (
                    <div className="mt-3">
                      <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Status Overlays</span>
                      <div className="flex flex-wrap gap-1">
                        {gameState.player.statusEffects.map((status, idx) => (
                          <span
                            key={idx}
                            className="text-[9px] font-mono bg-red-950/40 text-red-400 px-1.5 py-0.5 rounded border border-red-900/40"
                          >
                            ⚠️ {status}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Section: Characters */}
                <div className="p-4 border-b border-slate-800 bg-slate-900/10">
                  <div className="flex items-center gap-2 mb-3 text-xs font-mono tracking-wider uppercase text-slate-400">
                    <Users className="h-4 w-4 text-teal-500" />
                    <span>Active Actors</span>
                  </div>
                  <div className="space-y-3">
                    {gameState && Object.entries(gameState.characters).map(([id, charVal]) => {
                      const char = charVal as CharacterState;
                      const rel = char.relationship;
                      return (
                        <div key={id} className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-xs font-mono space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-200 font-bold">{char.name}</span>
                            <span className="text-[10px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-850 uppercase">
                              {char.status}
                            </span>
                          </div>
                          
                          {/* Relationship slider display */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span>Attitude:</span>
                              <span className={rel < 0 ? "text-red-400" : rel > 30 ? "text-green-400" : "text-slate-400"}>
                                {rel > 0 ? `+${rel}` : rel} (Affinity)
                              </span>
                            </div>
                            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden relative">
                              {/* Central divider */}
                              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-850" />
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  rel < 0 ? 'bg-red-500' : 'bg-teal-500'
                                }`}
                                style={{
                                  width: `${Math.abs(rel)}%`,
                                  marginLeft: rel < 0 ? `${50 - Math.abs(rel)/2}%` : '50%'
                                }}
                              />
                            </div>
                          </div>

                          <div className="text-[10px] text-slate-400 leading-normal">
                            <span className="text-slate-500">Activity:</span> {char.currentActivity}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Section: Quests & Flag states */}
                <div className="p-4 bg-slate-900/10">
                  <div className="flex items-center gap-2 mb-3 text-xs font-mono tracking-wider uppercase text-slate-400">
                    <Scroll className="h-4 w-4 text-teal-500" />
                    <span>Active Directive Quests</span>
                  </div>
                  <div className="space-y-2">
                    {gameState?.story.activeQuests.map((quest) => (
                      <div key={quest.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono">
                        <div className="flex justify-between items-start gap-1 mb-1.5">
                          <span className="text-slate-200 font-bold truncate max-w-[150px]">{quest.title}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-semibold ${
                            quest.status === 'completed'
                              ? 'bg-emerald-950/50 text-emerald-400 border-emerald-900/40'
                              : quest.status === 'failed'
                              ? 'bg-red-950/50 text-red-400 border-red-900/40'
                              : 'bg-teal-950/50 text-teal-400 border-teal-900/40'
                          }`}>
                            {quest.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-normal">{quest.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Center Panel & Right Tabs container */}
              <div className="flex-1 flex overflow-hidden">
                
                {/* Center Panel: Primary Output and Action Inputs */}
                <div className="flex-1 flex flex-col justify-between bg-slate-950 relative overflow-hidden">
                  
                  {/* Decorative terminal ambient background matrix */}
                  <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[radial-gradient(#0d9488_1px,transparent_1px)] [background-size:16px_16px]" />

                  {/* Error Notification banner */}
                  {errorBanner && (
                    <div className="bg-red-950/90 text-red-200 border-b border-red-800/80 px-6 py-2 text-xs font-mono flex items-center justify-between z-10">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-400 animate-bounce" />
                        <span>{errorBanner}</span>
                      </div>
                      <button onClick={() => setErrorBanner(null)} className="hover:text-white font-bold font-sans">✕</button>
                    </div>
                  )}

                  {/* Large Timeline / Narrative Display */}
                  <div className="flex-1 p-6 overflow-y-auto space-y-6 select-text">
                    <AnimatePresence>
                      {history.map((turn, i) => (
                        <motion.div
                          key={turn.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: i * 0.05 }}
                          className={`max-w-2xl mx-auto border-l-2 p-4 space-y-3 bg-slate-900/10 rounded-r-xl transition ${
                            i === history.length - 1 ? 'border-teal-500 bg-slate-900/30' : 'border-slate-800 text-slate-400'
                          }`}
                        >
                          {/* Turn metadata header */}
                          <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 border-b border-slate-900 pb-2">
                            <span className="flex items-center gap-1.5 uppercase font-semibold text-slate-400">
                              <Terminal className="h-3.5 w-3.5 text-teal-500" />
                              Event: {turn.event}
                            </span>
                            <span>{turn.timestamp}</span>
                          </div>

                          {/* Prose Text */}
                          <p className={`font-sans leading-relaxed tracking-wide text-sm whitespace-pre-line ${
                            i === history.length - 1 ? 'text-slate-100 text-[15px]' : 'text-slate-400 text-xs'
                          }`}>
                            {turn.narrative}
                          </p>

                          {/* Render Operations performed */}
                          {turn.runtimeOperations && turn.runtimeOperations.length > 0 && i === history.length - 1 && (
                            <div className="pt-2">
                              <span className="text-[10px] font-mono text-teal-400/80 block mb-1">State Commit Logs:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {turn.runtimeOperations.map((op, opIdx) => (
                                  <span key={opIdx} className="text-[9px] font-mono bg-slate-950 text-slate-400 border border-slate-800/80 px-2 py-0.5 rounded">
                                    ⚙️ {op}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {/* Loader */}
                    {isLoading && (
                      <div className="max-w-2xl mx-auto border-l-2 border-teal-500/50 p-4 bg-slate-900/20 rounded-r-xl flex items-center gap-3 animate-pulse">
                        <Activity className="h-4 w-4 text-teal-400 animate-spin" />
                        <span className="text-xs font-mono text-teal-400">INR Engine processing next scenario event state...</span>
                      </div>
                    )}

                    <div ref={narrativeEndRef} />
                  </div>

                  {/* Actions Console / Choices and Custom Prompt Area */}
                  <div className="border-t border-slate-800 bg-slate-900/50 backdrop-blur-md p-6 space-y-4">
                    
                    {/* Dynamic Action Selection */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono text-slate-500 uppercase block tracking-wider">
                        Dynamic Action Choices (Choose One to Execute)
                      </span>
                      <div className="grid md:grid-cols-2 gap-2">
                        {playerChoices.map((choice, idx) => (
                          <button
                            key={idx}
                            disabled={isLoading}
                            onClick={() => handleExecuteEvent(choice)}
                            className="text-left px-4 py-2.5 text-xs font-mono bg-slate-950 hover:bg-slate-900 active:bg-slate-950 border border-slate-800 hover:border-teal-500/50 rounded-lg text-slate-300 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed group flex justify-between items-center"
                          >
                            <span className="pr-4 leading-normal truncate">{choice}</span>
                            <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-teal-400 transform group-hover:translate-x-0.5 transition" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Command Prompt */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleExecuteEvent(customEvent);
                      }}
                      className="space-y-2"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono text-slate-500 uppercase block tracking-wider">
                          Custom Action Terminal
                        </span>
                        <span className="text-[9px] font-mono text-slate-600">Type any action to trigger narrative reason logic</span>
                      </div>
                      <div className="relative flex gap-2">
                        <div className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-teal-500 font-mono text-sm pointer-events-none select-none">
                          &gt;
                        </div>
                        <input
                          type="text"
                          disabled={isLoading}
                          value={customEvent}
                          onChange={(e) => setCustomEvent(e.target.value)}
                          placeholder="Inject state actions directly... (e.g. 'Confront Silas about Evelyn\'s room')"
                          className="flex-1 pl-8 pr-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-teal-500/70 rounded-lg text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none transition"
                        />
                        <button
                          type="submit"
                          disabled={isLoading || !customEvent.trim()}
                          className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 active:bg-teal-700 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 text-white font-mono text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shrink-0"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Execute Event
                        </button>
                      </div>
                    </form>

                  </div>

                </div>

                {/* Right Panel: Tabs for Memory, Telemetry, and Sandboxing */}
                <div className="w-96 border-l border-slate-800 bg-slate-900/20 flex flex-col">
                  
                  {/* Tab bar header */}
                  <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-950 text-center font-mono text-xs select-none">
                    <button
                      onClick={() => setActiveTab("narrative")}
                      className={`py-3 flex flex-col items-center justify-center gap-1 hover:text-white transition ${
                        activeTab === "narrative" ? "border-b-2 border-teal-500 text-white bg-slate-900/40" : "text-slate-500"
                      }`}
                    >
                      <FileText className="h-4 w-4" />
                      <span className="text-[10px]">Turn Logs</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("memory")}
                      className={`py-3 flex flex-col items-center justify-center gap-1 hover:text-white transition ${
                        activeTab === "memory" ? "border-b-2 border-teal-500 text-white bg-slate-900/40" : "text-slate-500"
                      }`}
                    >
                      <Layers className="h-4 w-4" />
                      <span className="text-[10px]">Mem Layers</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("telemetry")}
                      className={`py-3 flex flex-col items-center justify-center gap-1 hover:text-white transition ${
                        activeTab === "telemetry" ? "border-b-2 border-teal-500 text-white bg-slate-900/40" : "text-slate-500"
                      }`}
                    >
                      <Cpu className="h-4 w-4" />
                      <span className="text-[10px]">Telemetry</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("state-editor")}
                      className={`py-3 flex flex-col items-center justify-center gap-1 hover:text-white transition ${
                        activeTab === "state-editor" ? "border-b-2 border-teal-500 text-white bg-slate-900/40" : "text-slate-400"
                      }`}
                    >
                      <Sliders className="h-4 w-4 text-teal-400 animate-pulse" />
                      <span className="text-[10px] text-teal-400">Sandbox</span>
                    </button>
                  </div>

                  {/* Tab Body contents */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">

                    {activeTab === 'narrative' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <span className="text-xs font-mono text-slate-300 uppercase font-bold">Chronological Logs</span>
                          <span className="text-[10px] font-mono text-slate-500">{history.length} operations</span>
                        </div>
                        {history.length <= 1 ? (
                          <div className="text-center py-10 text-slate-600 font-mono text-xs border border-dashed border-slate-850 rounded">
                            No gameplay history logged yet.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {history.map((turn, index) => {
                              if (turn.id === "init") return null;
                              return (
                                <div key={turn.id} className="bg-slate-950 p-3 rounded-lg border border-slate-850 text-xs font-mono space-y-1.5">
                                  <div className="flex justify-between items-center text-[10px] text-slate-500">
                                    <span className="text-teal-400 font-bold">Action {index}</span>
                                    <span>{turn.timestamp}</span>
                                  </div>
                                  <div className="text-slate-300 font-bold border-l border-slate-800 pl-2 py-0.5">
                                    "{turn.event}"
                                  </div>
                                  <p className="text-slate-400 text-[11px] leading-relaxed truncate-2-lines" title={turn.narrative}>
                                    {turn.narrative.length > 100 ? `${turn.narrative.substr(0, 100)}...` : turn.narrative}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {activeTab === 'memory' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <span className="text-xs font-mono text-slate-300 uppercase font-bold">Cognitive Memory Layers</span>
                          <span className="text-[9px] bg-teal-500/10 text-teal-400 px-1.5 py-0.5 rounded font-mono uppercase">
                            State-Committed
                          </span>
                        </div>

                        {/* Working Memory */}
                        <div className="space-y-1.5 bg-slate-950 p-3 rounded-lg border border-slate-850">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-teal-400 font-bold uppercase">1. Working Memory</span>
                            <span className="text-[9px] text-slate-500 font-mono">Immediate focus</span>
                          </div>
                          <div className="space-y-1">
                            {memoryState?.working.map((w, idx) => (
                              <div key={idx} className="text-[11px] font-mono text-slate-300 bg-slate-900/60 px-2 py-1 rounded border border-slate-850">
                                • {w}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Episode Memory */}
                        <div className="space-y-1.5 bg-slate-950 p-3 rounded-lg border border-slate-850">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-teal-400 font-bold uppercase">2. Episode Memory</span>
                            <span className="text-[9px] text-slate-500 font-mono">Chronological event sequence</span>
                          </div>
                          <div className="space-y-1 max-h-[140px] overflow-y-auto">
                            {memoryState?.episode.map((e, idx) => (
                              <div key={idx} className="text-[11px] font-mono text-slate-400 bg-slate-900/60 px-2 py-1 rounded border border-slate-850">
                                {idx + 1}. {e}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Semantic Memory */}
                        <div className="space-y-1.5 bg-slate-950 p-3 rounded-lg border border-slate-850">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-teal-400 font-bold uppercase">3. Semantic Memory</span>
                            <span className="text-[9px] text-slate-500 font-mono">Static World knowledge</span>
                          </div>
                          <div className="space-y-1">
                            {memoryState?.semantic.map((s, idx) => (
                              <div key={idx} className="text-[11px] font-mono text-slate-400 bg-slate-900/60 px-2 py-1 rounded border border-slate-850">
                                💡 {s}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Archive Memory */}
                        <div className="space-y-1.5 bg-slate-950 p-3 rounded-lg border border-slate-850">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-teal-400 font-bold uppercase">4. Archive</span>
                            <span className="text-[9px] text-slate-500 font-mono">Cold inactive memory</span>
                          </div>
                          <div className="space-y-1">
                            {memoryState?.archive.map((a, idx) => (
                              <div key={idx} className="text-[11px] font-mono text-slate-500 bg-slate-900/60 px-2 py-1 rounded border border-slate-850">
                                📦 {a}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'telemetry' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <span className="text-xs font-mono text-slate-300 uppercase font-bold">Event Loop Telemetry</span>
                          <span className="text-[9px] bg-slate-950 px-2 py-0.5 border border-slate-850 rounded text-slate-500 font-mono">
                            Console
                          </span>
                        </div>

                        {/* Execution Timeline Map */}
                        <div className="p-3 bg-slate-950 border border-slate-850 rounded-lg space-y-3 font-mono text-[11px]">
                          <div className="text-teal-400 font-bold border-b border-slate-900 pb-1">EXECUTION ROUTINE STAGES:</div>
                          
                          <div className="flex items-center gap-2 text-slate-300">
                            <div className="h-4 w-4 bg-teal-500/10 border border-teal-500 text-teal-400 rounded-full flex items-center justify-center text-[9px] font-bold">1</div>
                            <span>Event Captured & Parsed</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-300">
                            <div className="h-4 w-4 bg-teal-500/10 border border-teal-500 text-teal-400 rounded-full flex items-center justify-center text-[9px] font-bold">2</div>
                            <span>Context Composed (State + memory)</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-300">
                            <div className="h-4 w-4 bg-teal-500/10 border border-teal-500 text-teal-400 rounded-full flex items-center justify-center text-[9px] font-bold">3</div>
                            <span>Reasoning Outcome Computed</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-300">
                            <div className="h-4 w-4 bg-teal-500/10 border border-teal-500 text-teal-400 rounded-full flex items-center justify-center text-[9px] font-bold">4</div>
                            <span>Cognitive Shifts & Commits</span>
                          </div>
                        </div>

                        {/* Running Logs */}
                        <div className="bg-slate-950 border border-slate-850 rounded-lg p-3 space-y-1 max-h-[300px] overflow-y-auto">
                          <div className="text-xs font-mono text-slate-500 border-b border-slate-900 pb-1.5 mb-2 flex justify-between">
                            <span>System Logs</span>
                            <span className="animate-pulse">●</span>
                          </div>
                          {executionLogs.map((log, idx) => (
                            <div key={idx} className="text-[10px] font-mono text-slate-300 break-words leading-relaxed py-0.5">
                              <span className="text-slate-500">[{idx + 1}]</span> {log}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeTab === 'state-editor' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <span className="text-xs font-mono text-teal-400 uppercase font-bold">State Variables Sandbox</span>
                          <span className="text-[9px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-900/40 font-mono uppercase font-semibold">
                            Overlord-Mode
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-normal font-mono">
                          Directly override state variables inside the runtime cache. These values will be passed as the direct reality vector to the AI reasoning engine on your next turn.
                        </p>

                        {/* Player HP modifier */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-2">
                          <div className="flex justify-between items-center text-xs font-mono">
                            <span className="text-slate-300 font-bold">Set Player HP:</span>
                            <span className="text-teal-400 font-mono font-bold">{gameState?.player.hp} / {gameState?.player.maxHp}</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max={gameState?.player.maxHp || 100}
                            value={gameState?.player.hp || 10}
                            onChange={(e) => handleModifyHP(parseInt(e.target.value))}
                            className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-teal-500 border border-slate-800"
                          />
                        </div>

                        {/* Attribute Modifier Sliders */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-3">
                          <span className="text-[11px] font-mono text-slate-400 block border-b border-slate-900 pb-1">Modify Attributes</span>
                          {gameState && Object.entries(gameState.player.attributes).map(([attr, val]) => (
                            <div key={attr} className="space-y-1 text-xs font-mono">
                              <div className="flex justify-between">
                                <span className="text-slate-400 capitalize">{attr}</span>
                                <span className="text-teal-400 font-bold">{val}</span>
                              </div>
                              <input
                                type="range"
                                min="1"
                                max="15"
                                value={val}
                                onChange={(e) => handleModifyAttribute(attr, parseInt(e.target.value))}
                                className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-teal-500 border border-slate-800"
                              />
                            </div>
                          ))}
                        </div>

                        {/* Actor relationships sliders */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-3">
                          <span className="text-[11px] font-mono text-slate-400 block border-b border-slate-900 pb-1">Modify Affinity Relationships</span>
                          {gameState && Object.entries(gameState.characters).map(([id, charVal]) => {
                            const char = charVal as CharacterState;
                            return (
                              <div key={id} className="space-y-1 text-xs font-mono">
                                <div className="flex justify-between">
                                  <span className="text-slate-300 font-bold">{char.name}</span>
                                  <span className={char.relationship < 0 ? "text-red-400" : "text-green-400"}>
                                    {char.relationship > 0 ? `+${char.relationship}` : char.relationship}
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min="-100"
                                  max="100"
                                  value={char.relationship}
                                  onChange={(e) => handleModifyRelationship(id, parseInt(e.target.value))}
                                  className="w-full h-1 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-teal-500 border border-slate-800"
                                />
                              </div>
                            );
                          })}
                        </div>

                        {/* Quick Add inventory item */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-2">
                          <span className="text-[11px] font-mono text-slate-400 block border-b border-slate-900 pb-1">Append Item to Cargo</span>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              id="newItemInput"
                              placeholder="e.g. Master Keycard"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const target = e.currentTarget;
                                  handleAddItem(target.value);
                                  target.value = '';
                                }
                              }}
                              className="flex-1 bg-slate-900 border border-slate-850 px-2 py-1.5 text-xs font-mono rounded text-white focus:outline-none focus:border-teal-500/70"
                            />
                            <button
                              onClick={() => {
                                const input = document.getElementById('newItemInput') as HTMLInputElement;
                                if (input && input.value.trim()) {
                                  handleAddItem(input.value);
                                  input.value = '';
                                }
                              }}
                              className="px-2.5 py-1.5 bg-teal-600/30 hover:bg-teal-600/50 text-teal-400 border border-teal-500/30 rounded text-xs font-mono font-bold"
                            >
                              Add
                            </button>
                          </div>
                          {gameState && gameState.player.inventory.length > 0 && (
                            <div className="space-y-1.5 pt-1.5">
                              {gameState.player.inventory.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center text-[11px] font-mono bg-slate-900/60 px-2 py-1 rounded border border-slate-850 text-slate-300">
                                  <span>{item}</span>
                                  <button onClick={() => handleRemoveItem(idx)} className="text-red-500 hover:text-red-400">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Active Directives */}
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 space-y-2">
                          <span className="text-[11px] font-mono text-slate-400 block border-b border-slate-900 pb-1">Overlord Directives</span>
                          <div className="space-y-1.5">
                            {gameState?.story.activeQuests.map((quest) => (
                              <div key={quest.id} className="bg-slate-900/60 px-2 py-1.5 rounded border border-slate-850 flex justify-between items-center text-[11px] font-mono">
                                <div className="truncate max-w-[150px]">
                                  <span className="font-bold text-slate-300">{quest.title}</span>
                                  <p className="text-[9px] text-slate-500">{quest.status}</p>
                                </div>
                                <button
                                  onClick={() => handleToggleQuestStatus(quest.id)}
                                  className="text-[9px] font-bold bg-slate-950 hover:bg-slate-900 border border-slate-800 px-2 py-1 rounded text-slate-400 hover:text-white"
                                >
                                  Toggle Status
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    )}

                  </div>

                </div>

              </div>

            </div>
          )}
        </AnimatePresence>
      </main>

    </div>
  );
}
