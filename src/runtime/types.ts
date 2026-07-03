export type Operation =
  | { type: 'DamagePlayer'; amount: number; source: string }
  | { type: 'HealPlayer'; amount: number }
  | { type: 'AddItem'; itemId: string }
  | { type: 'RemoveItem'; itemId: string }
  | { type: 'UpdateLocation'; location: string }
  | { type: 'ModifyRelationship'; characterId: string; delta: number }
  | { type: 'UpdateQuestStatus'; questId: string; status: 'active' | 'completed' | 'failed' }
  | { type: 'SetFlag'; key: string; value: boolean };

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}
