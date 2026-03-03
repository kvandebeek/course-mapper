import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExportRow } from '../results/buildExportRow.js';
import { KeywordRow } from '../types.js';
import { CourseDetail } from '../udemy/extractCourseDetail.js';

test('buildExportRow preserves track from keyword row', () => {
  const keywordRow: KeywordRow = {
    track: 'Pathfinding',
    level: 'A1 Intern',
    levelCodes: ['A1'],
    moduleType: 'ai',
    keyword: 'AI-Assisted Documentation'
  };

  const course: CourseDetail = {
    keyword: 'AI-Assisted Documentation',
    courseId: 123,
    title: '[NEW] Ultimate AWS Certified AI Practitioner AIF-C01',
    url: 'https://resillion.udemy.com/course/aws-ai-practitioner-certified/',
    rating: 4.7,
    ratingCount: 39748,
    udemyLevel: null,
    durationHours: 10,
    durationMinutes: 0,
    durationTotalMinutes: 600,
    durationDisplay: '10h 0m'
  };

  const row = buildExportRow(keywordRow, course);

  assert.equal(row.track, 'Pathfinding');
  assert.equal(row.level, 'A1 Intern');
  assert.equal(row.moduleType, 'ai');
  assert.equal(row.keyword, 'AI-Assisted Documentation');
});


test('buildExportRow throws if track is blank', () => {
  const keywordRow: KeywordRow = {
    track: '   ',
    level: 'A1 Intern',
    levelCodes: ['A1'],
    moduleType: 'core',
    keyword: 'Intro Programming'
  };

  const course: CourseDetail = {
    keyword: 'Intro Programming',
    courseId: 99,
    title: 'Course',
    url: 'https://resillion.udemy.com/course/x/',
    rating: 4.9,
    ratingCount: 2000,
    udemyLevel: 'Beginner Level',
    durationHours: null,
    durationMinutes: null,
    durationTotalMinutes: null,
    durationDisplay: null
  };

  assert.throws(() => buildExportRow(keywordRow, course), /track is required/);
});
