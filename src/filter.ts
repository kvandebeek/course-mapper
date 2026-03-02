/**
 * src/filter.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
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
