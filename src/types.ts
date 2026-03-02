export interface CliOptions {
  headless: boolean;
  debug: boolean;
  browserChannel: BrowserChannel;
  maxCoursesPerKeyword: number;
  maxPages: number;
  throttleMs: number;
  concurrency: number;
  profileDir: string;
}

export type BrowserChannel = 'chrome' | 'msedge' | 'chromium';

export interface AppConfig {
  baseUrl: string;
  orgHomePath: string;
  inputCsvPath: string;
  outputCsvPath: string;
  englishLocales: ReadonlySet<string>;
  minRating: number;
  minRatingCount: number;
  recencyMonths: number;
}

export interface KeywordRow {
  track: string;
  level: string;
  moduleType: string;
  keyword: string;
}

export interface CourseRaw {
  keyword: string;
  courseId: string;
  url: string;
  title: string;
  instructors: string;
  language: string;
  durationMinutes: number | null;
  udemyLevel: string | null;
  category: string | null;
  rating: number | null;
  ratingCount: number | null;
  lastUpdated: string | null;
  badges: string[];
}

export interface CourseScored extends CourseRaw {
  track: string;
  level: string;
  moduleType: string;
  score: number;
  failureReason?: string;
}

export interface SearchResultPayload {
  id: string;
  url: string;
  title: string;
  instructors: string;
  locale: string;
  rating: number | null;
  ratingCount: number | null;
  level: string | null;
}
