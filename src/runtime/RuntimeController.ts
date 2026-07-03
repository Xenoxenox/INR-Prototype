import { RuntimeState, MemoryLayers } from '../types';
import { Operation } from './types';
import { OperationValidator } from './OperationValidator';
import { StateReducer } from './StateReducer';

export class RuntimeController {
  private state: RuntimeState;
  private memory: MemoryLayers;
  private validator: OperationValidator;
  private reducer: StateReducer;

  constructor(initialState: RuntimeState, initialMemory: MemoryLayers) {
    this.state = initialState;
    this.memory = initialMemory;
    this.validator = new OperationValidator();
    this.reducer = new StateReducer();
  }

  getState(): RuntimeState {
    return this.state;
  }

  getMemory(): MemoryLayers {
    return this.memory;
  }

  // Runtime-owned memory evolution (deterministic; LLM memory ops are out of scope for now)
  appendEpisode(entry: string): void {
    this.memory = { ...this.memory, episode: [...this.memory.episode, entry] };
  }

  // Apply and validate operations from LLM
  applyOperations(operations: Operation[]): { applied: Operation[]; rejected: { op: Operation; reason: string }[] } {
    const applied: Operation[] = [];
    const rejected: { op: Operation; reason: string }[] = [];

    for (const op of operations) {
      const validation = this.validator.validate(op, this.state);
      if (validation.valid) {
        this.state = this.reducer.reduce(this.state, op);
        applied.push(op);
      } else {
        console.warn(`Operation rejected: ${op.type}. Reason: ${validation.reason}`);
        rejected.push({ op, reason: validation.reason ?? 'unknown' });
      }
    }

    return { applied, rejected };
  }

  // Check invariants after state updates
  checkInvariants(): boolean {
    // HP within bounds
    if (this.state.player.hp < 0 || this.state.player.hp > this.state.player.maxHp) {
      console.error('Invariant violation: HP out of bounds');
      return false;
    }

    // All relationships in range
    for (const [id, char] of Object.entries(this.state.characters)) {
      if (char.relationship < -100 || char.relationship > 100) {
        console.error(`Invariant violation: ${id} relationship out of range`);
        return false;
      }
    }

    // No duplicate items
    const items = this.state.player.inventory;
    if (items.length !== new Set(items).size) {
      console.error('Invariant violation: duplicate items in inventory');
      return false;
    }

    return true;
  }
}
