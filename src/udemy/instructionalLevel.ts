import { InstructionalLevel } from './navigation.js';

/**
 * mapUdemyInstructionalLevel: public helper used by other modules.
 */
export function mapUdemyInstructionalLevel(raw: string): Exclude<InstructionalLevel, 'all'> | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.includes('beginner') || normalized.includes('all levels')) {
    return 'beginner';
  }

  if (normalized.includes('intermediate')) {
    return 'intermediate';
  }

  if (normalized.includes('expert') || normalized.includes('advanced')) {
    return 'expert';
  }

  return null;
}
