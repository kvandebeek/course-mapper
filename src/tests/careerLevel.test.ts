import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { LEVEL_TARGET, LEVEL_TO_INSTRUCTIONAL, parseCareerLevel } from '../levels/careerLevel.js';

test('parseCareerLevel extracts known code from level labels', () => {
  assert.equal(parseCareerLevel('A1 Intern'), 'A1');
  assert.equal(parseCareerLevel('B1 Engineer / Associate'), 'B1');
  assert.equal(parseCareerLevel('D3 Director'), 'D3');
});

test('parseCareerLevel rejects unknown or malformed labels', () => {
  assert.equal(parseCareerLevel(''), null);
  assert.equal(parseCareerLevel('Z9 Mystery'), null);
  assert.equal(parseCareerLevel('Intern A1'), null);
  assert.equal(parseCareerLevel('A4 Invalid'), null);
});

test('career level mappings are strict for representative cases', () => {
  assert.deepEqual(LEVEL_TO_INSTRUCTIONAL.A1, ['beginner']);
  assert.deepEqual(LEVEL_TO_INSTRUCTIONAL.B1, ['beginner', 'intermediate']);
  assert.deepEqual(LEVEL_TO_INSTRUCTIONAL.C2, ['intermediate', 'expert']);
  assert.deepEqual(LEVEL_TO_INSTRUCTIONAL.D3, ['expert']);

  assert.equal(LEVEL_TARGET.B1, 'intermediate');
  assert.equal(LEVEL_TARGET.C2, 'expert');
  assert.equal(LEVEL_TARGET.E2, 'expert');
});
