/**
 * Lightweight eligibility filter used by legacy/non-Playwright scoring paths.
 *
 * The filter is deterministic and only checks:
 * - language is in configured English locale set,
 * - rating meets minimum,
 * - rating-count meets minimum.
 */

import { AppConfig, CourseRaw } from './types.js';

/**
 * filterCourses: public helper used by other modules.
 */
export function filterCourses(courses: CourseRaw[], config: AppConfig): CourseRaw[] {
  return courses.filter((course) => {
    if (!config.englishLocales.has(course.language)) {
      return false;
    }
    if (course.rating === null || course.rating < config.minRating) {
      return false;
    }
    if (course.ratingCount === null || course.ratingCount < config.minRatingCount) {
      return false;
    }
    return true;
  });
}
