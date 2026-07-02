export interface Quest {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
}

export interface WorldState {
  currentDay: number;
  weather: string;
  time: string; // e.g. "Morning", "Night", "Late Night"
  location: string;
  details: Record<string, string>;
}

export interface PlayerState {
  name: string;
  hp: number;
  maxHp: number;
  inventory: string[];
  statusEffects: string[];
  attributes: Record<string, number>; // e.g. strength, charisma, intelligence
}

export interface CharacterState {
  name: string;
  relationship: number; // e.g. -100 to 100
  goals: string;
  status: string;
  currentActivity: string;
}

export interface StoryState {
  activeQuests: Quest[];
  completedEvents: string[];
  flags: Record<string, boolean>;
}

export interface RuntimeState {
  world: WorldState;
  player: PlayerState;
  characters: Record<string, CharacterState>;
  story: StoryState;
}

export interface MemoryLayers {
  working: string[]; // items currently in immediate focus
  episode: string[]; // chronological major events that happened
  semantic: string[]; // general stable facts about the world / characters
  archive: string[]; // old chapters / elements
}

export interface Scenario {
  id: string;
  title: string;
  genre: string;
  description: string;
  initialState: RuntimeState;
  initialMemory: MemoryLayers;
  coverImagePrompt: string;
}

export interface INREventResponse {
  narrative: string;
  state: RuntimeState; // Full updated state
  memory: MemoryLayers; // Full updated memory
  playerChoices: string[];
  runtimeOperations: string[]; // Operation commit descriptions
  executionLogs: string[]; // Execution logs of the loop
}

export interface NarrativeTurn {
  id: string;
  event: string; // Player's action
  narrative: string;
  runtimeOperations: string[];
  timestamp: string;
}
