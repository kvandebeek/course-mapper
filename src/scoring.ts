/**
 * src/scoring.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { CourseRaw, CourseScored, KeywordRow } from './types.js';

/**
 * scoreAndSelectTopThree: public helper used by other modules.
 */
export function scoreAndSelectTopThree(courses: CourseRaw[], keywordRow: KeywordRow): CourseScored[] {
  const scored = courses
    .map((course) => {
      const score = (course.rating ?? 0) * 10 + Math.log10((course.ratingCount ?? 0) + 1) * 5;

      return {
        ...course,
        track: keywordRow.track,
        level: keywordRow.level,
        moduleType: keywordRow.moduleType,
        score: Number(score.toFixed(4))
      } satisfies CourseScored;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored;
}
