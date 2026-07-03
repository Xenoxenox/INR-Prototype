import { Operation } from './types';
import { RuntimeState } from '../types';

export class StateReducer {
  reduce(state: RuntimeState, op: Operation): RuntimeState {
    // Deep clone to avoid mutations
    const next: RuntimeState = JSON.parse(JSON.stringify(state));

    switch (op.type) {
      case 'DamagePlayer':
        next.player.hp = Math.max(0, state.player.hp - op.amount);
        break;

      case 'HealPlayer':
        next.player.hp = Math.min(state.player.maxHp, state.player.hp + op.amount);
        break;

      case 'AddItem':
        if (!next.player.inventory.includes(op.itemId)) {
          next.player.inventory.push(op.itemId);
        }
        break;

      case 'RemoveItem':
        next.player.inventory = next.player.inventory.filter(i => i !== op.itemId);
        break;

      case 'UpdateLocation':
        next.world.location = op.location;
        break;

      case 'ModifyRelationship': {
        const char = next.characters[op.characterId];
        if (char) {
          char.relationship = Math.max(-100, Math.min(100, char.relationship + op.delta));
        }
        break;
      }

      case 'UpdateQuestStatus': {
        const quest = next.story.activeQuests.find(q => q.id === op.questId);
        if (quest) {
          quest.status = op.status;
        }
        break;
      }

      case 'SetFlag':
        next.story.flags[op.key] = op.value;
        break;
    }

    return next;
  }

  // Apply multiple operations in sequence
  reduceAll(state: RuntimeState, operations: Operation[]): RuntimeState {
    return operations.reduce((s, op) => this.reduce(s, op), state);
  }
}
