import { CareerLevel, CourseInstructionalLevel, LEVEL_TARGET, LEVEL_TO_INSTRUCTIONAL } from '../levels/careerLevel.js';

const LEVEL_RANK: Readonly<Record<CourseInstructionalLevel, number>> = {
  beginner: 0,
  intermediate: 1,
  expert: 2
};

const MAX_POPULARITY_REFERENCE = 100_000;

export interface ScorableCourse {
  readonly rating: number;
  readonly ratingCount: number;
  readonly instructionalLevel: CourseInstructionalLevel;
  readonly courseUrl: string;
  readonly courseTitle: string;
}

export interface ScoreCourseOptions {
  readonly rejectOutsideAllowed?: boolean;
}

export interface CourseScoreResult {
  readonly score: number;
  readonly reasons: readonly string[];
  readonly isRejected: boolean;
}

export function scoreCourseForCareerLevel(
  careerLevel: CareerLevel,
  course: ScorableCourse,
  options: ScoreCourseOptions = {}
): CourseScoreResult {
  const rejectOutsideAllowed = options.rejectOutsideAllowed ?? true;
  const allowedLevels = LEVEL_TO_INSTRUCTIONAL[careerLevel];

  if (rejectOutsideAllowed && !allowedLevels.includes(course.instructionalLevel)) {
    return {
      score: 0,
      reasons: [`rejected: instructional level ${course.instructionalLevel} not allowed for ${careerLevel}`],
      isRejected: true
    };
  }

  const targetLevel = LEVEL_TARGET[careerLevel];
  const distance = Math.abs(LEVEL_RANK[targetLevel] - LEVEL_RANK[course.instructionalLevel]);
  const fitPoints = Math.max(0, 40 - (distance * 20));

  const boundedRating = clamp(course.rating, 0, 5);
  const ratingPoints = (boundedRating / 5) * 35;

  const boundedCount = Math.max(0, course.ratingCount);
  const popularityRatio = Math.log10(boundedCount + 1) / Math.log10(MAX_POPULARITY_REFERENCE + 1);
  const popularityPoints = clamp(popularityRatio, 0, 1) * 25;

  const totalScore = round4(fitPoints + ratingPoints + popularityPoints);

  return {
    score: totalScore,
    reasons: [
      `fit(${targetLevel} vs ${course.instructionalLevel})=${round4(fitPoints)}/40`,
      `rating(${boundedRating})=${round4(ratingPoints)}/35`,
      `popularity(${boundedCount})=${round4(popularityPoints)}/25`,
      `total=${totalScore}/100`
    ],
    isRejected: false
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}
