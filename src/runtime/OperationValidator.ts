import { Operation, ValidationResult } from './types';
import { RuntimeState } from '../types';

const OP_TYPES = new Set([
  'DamagePlayer', 'HealPlayer', 'AddItem', 'RemoveItem',
  'UpdateLocation', 'ModifyRelationship', 'UpdateQuestStatus', 'SetFlag'
]);

// Trust boundary: LLM output arrives untyped. Shape-check before treating as Operation.
export function isOperation(raw: unknown): raw is Operation {
  if (!raw || typeof raw !== 'object') return false;
  const op = raw as Record<string, unknown>;
  if (typeof op.type !== 'string' || !OP_TYPES.has(op.type)) return false;
  switch (op.type) {
    case 'DamagePlayer': return typeof op.amount === 'number' && typeof op.source === 'string';
    case 'HealPlayer': return typeof op.amount === 'number';
    case 'AddItem':
    case 'RemoveItem': return typeof op.itemId === 'string';
    case 'UpdateLocation': return typeof op.location === 'string';
    case 'ModifyRelationship': return typeof op.characterId === 'string' && typeof op.delta === 'number';
    case 'UpdateQuestStatus': return typeof op.questId === 'string' && ['active', 'completed', 'failed'].includes(op.status as string);
    case 'SetFlag': return typeof op.key === 'string' && typeof op.value === 'boolean';
    default: return false;
  }
}

export class OperationValidator {
  validate(op: Operation, state: RuntimeState): ValidationResult {
    switch (op.type) {
      case 'DamagePlayer':
        if (op.amount < 0) return { valid: false, reason: 'Damage cannot be negative' };
        if (state.player.hp - op.amount < 0) return { valid: false, reason: 'Would kill player' };
        return { valid: true };

      case 'HealPlayer':
        if (op.amount < 0) return { valid: false, reason: 'Heal amount cannot be negative' };
        return { valid: true }; // Can't overheal; reducer will clamp

      case 'RemoveItem':
        if (!state.player.inventory.includes(op.itemId)) {
          return { valid: false, reason: `Item ${op.itemId} not in inventory` };
        }
        return { valid: true };

      case 'ModifyRelationship':
        if (!state.characters[op.characterId]) {
          return { valid: false, reason: `Character ${op.characterId} does not exist` };
        }
        return { valid: true }; // Reducer will clamp to [-100, 100]

      case 'UpdateQuestStatus': {
        const quest = state.story.activeQuests.find(q => q.id === op.questId);
        if (!quest) return { valid: false, reason: `Quest ${op.questId} not found` };
        return { valid: true };
      }

      // AddItem, UpdateLocation, SetFlag are always valid if well-formed
      default:
        return { valid: true };
    }
  }
}
