import { CourseRaw, CourseScored, KeywordRow } from './types.js';
import { getNowInBrussels, monthsSince } from './utils/date.js';

export function scoreAndSelectTopThree(courses: CourseRaw[], keywordRow: KeywordRow): CourseScored[] {
  const now = getNowInBrussels();

  const scored = courses
    .map((course) => {
      const months = course.lastUpdated ? monthsSince(course.lastUpdated, now) : Number.POSITIVE_INFINITY;
      const freshnessBonus = months < 12 ? 5 : months < 24 ? 3 : 1;
      const score = (course.rating ?? 0) * 10 + Math.log10((course.ratingCount ?? 0) + 1) * 5 + freshnessBonus;

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
