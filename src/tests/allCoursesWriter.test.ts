import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ALL_COURSES_HEADERS, initAllCoursesWriter } from '../output/allCoursesWriter.js';

const BASE_ROW = {
  keyword: 'python',
  courseTitle: 'Intro Course',
  courseUrl: 'https://resillion.udemy.com/course/intro/',
  rating: 4.7,
  ratingCount: 3210,
  courseInstructionalLevel: 'beginner',
  durationMinutes: 120,
  lastUpdated: '',
  status: 'inspected' as const,
  failureReason: ''
};

test('all courses writer creates header in fresh folder and appends rows', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'all-courses-writer-'));
  const outputFilePath = path.join(tempDir, 'artifacts', 'all_courses.csv');

  const writer = await initAllCoursesWriter(outputFilePath);
  assert.equal(writer.fileExisted, false);

  await writer.appendInspectedCourse(BASE_ROW);
  await writer.close();

  const content = await readFile(outputFilePath, 'utf-8');
  const lines = content.trimEnd().split('\n');

  assert.equal(lines[0], ALL_COURSES_HEADERS.join(','));
  assert.equal(lines.length, 2);
});

test('all courses writer appends to existing file without duplicating header', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'all-courses-existing-'));
  const outputFilePath = path.join(tempDir, 'all_courses.csv');

  const first = await initAllCoursesWriter(outputFilePath);
  await first.appendInspectedCourse(BASE_ROW);
  await first.close();

  const second = await initAllCoursesWriter(outputFilePath);
  assert.equal(second.fileExisted, true);
  await second.appendInspectedCourse({ ...BASE_ROW, keyword: 'typescript', courseUrl: 'https://resillion.udemy.com/course/ts/' });
  await second.close();

  const content = await readFile(outputFilePath, 'utf-8');
  const lines = content.trimEnd().split('\n');

  assert.equal(lines.length, 3);
  assert.equal(lines.filter((line) => line === ALL_COURSES_HEADERS.join(',')).length, 1);
});

test('all courses writer uses v2 file when existing header has old runId schema', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'all-courses-mismatch-'));
  const outputFilePath = path.join(tempDir, 'all_courses.csv');
  await writeFile(outputFilePath, 'runId,keyword\nlegacy,data\n', 'utf-8');

  const writer = await initAllCoursesWriter(outputFilePath);
  assert.equal(writer.outputFilePath, path.join(tempDir, 'all_courses_v2.csv'));

  await writer.appendInspectedCourse(BASE_ROW);
  await writer.close();

  const v2Content = await readFile(writer.outputFilePath, 'utf-8');
  assert.equal(v2Content.trimEnd().split('\n')[0], ALL_COURSES_HEADERS.join(','));
});

test('all courses writer escapes commas, quotes, and newlines', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'all-courses-escape-'));
  const outputFilePath = path.join(tempDir, 'all_courses.csv');

  const writer = await initAllCoursesWriter(outputFilePath);
  await writer.appendInspectedCourse({
    ...BASE_ROW,
    courseTitle: 'Course, "Quoted"\nTitle'
  });
  await writer.close();

  const content = await readFile(outputFilePath, 'utf-8');
  assert.match(content, /"Course, ""Quoted""\nTitle"/);
});

test('all courses writer adds per-row timeAdded in ISO UTC ms format and in append order', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'all-courses-time-added-'));
  const outputFilePath = path.join(tempDir, 'all_courses.csv');

  const writer = await initAllCoursesWriter(outputFilePath);
  await writer.appendInspectedCourse(BASE_ROW);
  await writer.appendInspectedCourse({ ...BASE_ROW, status: 'accepted', courseUrl: 'https://resillion.udemy.com/course/accepted/' });
  await writer.close();

  const content = await readFile(outputFilePath, 'utf-8');
  const [header, firstData, secondData] = content.trimEnd().split('\n');

  assert.match(header ?? '', /^timeAdded,/);
  assert.equal(header?.includes('runId'), false);

  const [firstTimeAdded] = (firstData ?? '').split(',');
  const [secondTimeAdded] = (secondData ?? '').split(',');
  const isoUtcMsRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  assert.match(firstTimeAdded ?? '', isoUtcMsRegex);
  assert.match(secondTimeAdded ?? '', isoUtcMsRegex);
  assert.ok(Date.parse(firstTimeAdded ?? '') <= Date.parse(secondTimeAdded ?? ''));
});

test('all courses writer serializes concurrent appends with stable call order', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'all-courses-concurrency-'));
  const outputFilePath = path.join(tempDir, 'all_courses.csv');

  const writer = await initAllCoursesWriter(outputFilePath);

  await Promise.all(
    Array.from({ length: 50 }, (_, index) => writer.appendInspectedCourse({
      ...BASE_ROW,
      keyword: `kw-${index}`,
      courseUrl: `https://resillion.udemy.com/course/${index}/`
    }))
  );
  await writer.close();

  const content = await readFile(outputFilePath, 'utf-8');
  const lines = content.trimEnd().split('\n');
  assert.equal(lines.length, 51);

  for (let index = 0; index < 50; index += 1) {
    assert.match(lines[index + 1]!, new RegExp(`,kw-${index},`));
  }
});
