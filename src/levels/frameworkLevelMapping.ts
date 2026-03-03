import { InstructionalLevel } from '../udemy/navigation.js';

export type FrameworkLevelCode = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'D1' | 'D2' | 'D3' | 'E1' | 'E2';

const ORDERED_INSTRUCTIONAL_LEVELS: readonly Exclude<InstructionalLevel, 'all'>[] = ['beginner', 'intermediate', 'expert'];

const FRAMEWORK_LEVEL_CODES: readonly FrameworkLevelCode[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'D3', 'E1', 'E2'];

export const FRAMEWORK_TO_INSTRUCTIONAL_LEVELS: Readonly<Record<FrameworkLevelCode, readonly Exclude<InstructionalLevel, 'all'>[]>> = {
  A1: ['beginner'],
  A2: ['beginner'],
  B1: ['beginner', 'intermediate'],
  B2: ['intermediate'],
  C1: ['intermediate', 'expert'],
  C2: ['intermediate', 'expert'],
  D1: ['expert'],
  D2: ['expert'],
  D3: ['intermediate', 'expert'],
  E1: ['expert'],
  E2: ['expert']
};

/**
 * parseLevelCode: public helper used by other modules.
 */
export function parseLevelCode(levelCell: string): FrameworkLevelCode | null {
  const token = levelCell.trim().split(/\s+/)[0]?.toUpperCase();
  if (!token) {
    return null;
  }

  return FRAMEWORK_LEVEL_CODES.includes(token as FrameworkLevelCode) ? (token as FrameworkLevelCode) : null;
}

/**
 * getAllowedInstructionalLevels: public helper used by other modules.
 */
export function getAllowedInstructionalLevels(
  levelCodes: readonly FrameworkLevelCode[]
): readonly Exclude<InstructionalLevel, 'all'>[] {
  const enabled = new Set<Exclude<InstructionalLevel, 'all'>>();

  for (const levelCode of levelCodes) {
    for (const instructionalLevel of FRAMEWORK_TO_INSTRUCTIONAL_LEVELS[levelCode]) {
      enabled.add(instructionalLevel);
    }
  }

  return ORDERED_INSTRUCTIONAL_LEVELS.filter((instructionalLevel) => enabled.has(instructionalLevel));
}
