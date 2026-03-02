import { AppConfig, CourseRaw } from './types.js';

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
