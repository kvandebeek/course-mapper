import { CourseInstructionalLevel, CareerLevel, LEVEL_TO_INSTRUCTIONAL, parseCareerLevel } from './careerLevel.js';

export type FrameworkLevelCode = CareerLevel;

const ORDERED_INSTRUCTIONAL_LEVELS: readonly CourseInstructionalLevel[] = ['beginner', 'intermediate', 'expert'];

export const FRAMEWORK_TO_INSTRUCTIONAL_LEVELS = LEVEL_TO_INSTRUCTIONAL;

export function parseLevelCode(levelCell: string): FrameworkLevelCode | null {
  return parseCareerLevel(levelCell);
}

export function getAllowedInstructionalLevels(
  levelCodes: readonly FrameworkLevelCode[]
): readonly CourseInstructionalLevel[] {
  const enabled = new Set<CourseInstructionalLevel>();

  for (const levelCode of levelCodes) {
    for (const instructionalLevel of FRAMEWORK_TO_INSTRUCTIONAL_LEVELS[levelCode]) {
      enabled.add(instructionalLevel);
    }
  }

  return ORDERED_INSTRUCTIONAL_LEVELS.filter((instructionalLevel) => enabled.has(instructionalLevel));
}
