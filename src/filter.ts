import { AppConfig, CourseRaw } from './types.js';
import { getNowInBrussels, monthsSince } from './utils/date.js';

export function filterCourses(courses: CourseRaw[], config: AppConfig): CourseRaw[] {
  const now = getNowInBrussels();

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
    if (!course.lastUpdated) {
      return false;
    }
    const ageMonths = monthsSince(course.lastUpdated, now);
    return ageMonths >= 0 && ageMonths < config.recencyMonths;
  });
}
