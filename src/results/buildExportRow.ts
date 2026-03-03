import { mapUdemyInstructionalLevel } from '../udemy/instructionalLevel.js';
import { ExportRow, KeywordRow } from '../types.js';
import { CourseDetail } from '../udemy/extractCourseDetail.js';

/**
 * buildExportRow: public helper used by other modules.
 */
export function buildExportRow(keywordRow: KeywordRow, course: CourseDetail): ExportRow {
  const track = keywordRow.track.trim();
  if (track.length === 0) {
    throw new Error(`Cannot build export row for keyword "${keywordRow.keyword}": track is required`);
  }

  return {
    track,
    level: keywordRow.level,
    moduleType: keywordRow.moduleType,
    keyword: keywordRow.keyword,
    courseInstructionalLevel: mapUdemyInstructionalLevel(course.udemyLevel ?? '') ?? 'all',
    courseTitle: course.title,
    courseUrl: course.url,
    rating: course.rating ?? 0,
    ratingCount: course.ratingCount ?? 0,
    duration: course.durationDisplay ?? '',
    durationTotalMinutes: course.durationTotalMinutes ?? ''
  };
}
