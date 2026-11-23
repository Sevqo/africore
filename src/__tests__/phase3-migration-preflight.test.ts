import assert from 'node:assert/strict';
import { test } from 'node:test';

const { missingPrerequisites } = require('../../scripts/phase3-migration-preflight.cjs') as {
  missingPrerequisites: (mode: string, appliedVersions: string[]) => string[];
};

test('Calendar hosted migration preflight reports every missing prerequisite in order', () => {
  assert.deepEqual(missingPrerequisites('phase3-calendar', ['027-website-forms']), [
    '016-procurement',
    '017-commerce-foundation',
    '018-public-media',
    '019-point-of-sale',
    '020-procurement-expansion',
    '021-people-expansion',
    '026-app15-16',
  ]);
});

test('Phase 3 hosted migration preflight reports its full dependency chain', () => {
  assert.deepEqual(missingPrerequisites('phase3', ['016-procurement', '021-people-expansion']), [
    '017-commerce-foundation',
    '018-public-media',
    '019-point-of-sale',
    '020-procurement-expansion',
    '026-app15-16',
  ]);
});

test('complete Phase 3 migration prerequisites return no missing versions', () => {
  assert.deepEqual(
    missingPrerequisites('phase3-calendar', [
      '016-procurement',
      '017-commerce-foundation',
      '018-public-media',
      '019-point-of-sale',
      '020-procurement-expansion',
      '021-people-expansion',
      '026-app15-16',
      '027-website-forms',
      '028-calendar-appointments',
    ]),
    [],
  );
});
