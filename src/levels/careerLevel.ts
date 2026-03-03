import { InstructionalLevel } from '../udemy/navigation.js';

export type CareerLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'D1' | 'D2' | 'D3' | 'E1' | 'E2';

export type CourseInstructionalLevel = Exclude<InstructionalLevel, 'all'>;

const CAREER_LEVELS = new Set<CareerLevel>(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'D3', 'E1', 'E2']);

const CAREER_LEVEL_PATTERN = /^([A-E][1-3])\b/i;

export const LEVEL_TO_INSTRUCTIONAL: Readonly<Record<CareerLevel, readonly CourseInstructionalLevel[]>> = {
  A1: ['beginner'],
  A2: ['beginner'],
  B1: ['beginner', 'intermediate'],
  B2: ['intermediate'],
  C1: ['intermediate'],
  C2: ['intermediate', 'expert'],
  D1: ['expert'],
  D2: ['expert'],
  D3: ['expert'],
  E1: ['expert'],
  E2: ['expert']
};

export const LEVEL_TARGET: Readonly<Record<CareerLevel, CourseInstructionalLevel>> = {
  A1: 'beginner',
  A2: 'beginner',
  B1: 'intermediate',
  B2: 'intermediate',
  C1: 'intermediate',
  C2: 'expert',
  D1: 'expert',
  D2: 'expert',
  D3: 'expert',
  E1: 'expert',
  E2: 'expert'
};

export function parseCareerLevel(levelLabel: string): CareerLevel | null {
  const match = levelLabel.trim().match(CAREER_LEVEL_PATTERN);
  const candidate = match?.[1]?.toUpperCase();
  if (!candidate) {
    return null;
  }

  return CAREER_LEVELS.has(candidate as CareerLevel) ? (candidate as CareerLevel) : null;
}
