import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  FRAMEWORK_TO_INSTRUCTIONAL_LEVELS,
  getAllowedInstructionalLevels,
  parseLevelCode
} from '../levels/frameworkLevelMapping.js';

test('parseLevelCode extracts valid level code from level cell', () => {
  assert.equal(parseLevelCode('A1 Intern'), 'A1');
});

test('parseLevelCode returns null for invalid levels', () => {
  assert.equal(parseLevelCode(''), null);
  assert.equal(parseLevelCode('Z9 Mystery'), null);
  assert.equal(parseLevelCode('intern A1'), null);
});

test('framework mapping table has expected representative values', () => {
  assert.deepEqual(FRAMEWORK_TO_INSTRUCTIONAL_LEVELS.A1, ['beginner']);
  assert.deepEqual(FRAMEWORK_TO_INSTRUCTIONAL_LEVELS.B1, ['beginner', 'intermediate']);
  assert.deepEqual(FRAMEWORK_TO_INSTRUCTIONAL_LEVELS.C1, ['intermediate', 'expert']);
  assert.deepEqual(FRAMEWORK_TO_INSTRUCTIONAL_LEVELS.D1, ['expert']);
  assert.deepEqual(FRAMEWORK_TO_INSTRUCTIONAL_LEVELS.E2, ['expert']);
});

test('allowed level union keeps stable ordering', () => {
  assert.deepEqual(getAllowedInstructionalLevels(['B1']), ['beginner', 'intermediate']);
  assert.deepEqual(getAllowedInstructionalLevels(['C1']), ['intermediate', 'expert']);
  assert.deepEqual(getAllowedInstructionalLevels(['B1', 'C1']), ['beginner', 'intermediate', 'expert']);
});
