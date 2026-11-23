import test from 'node:test';
import assert from 'node:assert/strict';
import { moveWebsiteBlock, moveWebsiteBlockSelection } from '../src/apps/website-editor.ts';

test('Website block drag reorders in both directions and retains selected block identity', () => {
  assert.deepEqual(moveWebsiteBlock(['hero', 'text', 'gallery'], 0, 2), ['text', 'gallery', 'hero']);
  assert.deepEqual(moveWebsiteBlock(['hero', 'text', 'gallery'], 2, 0), ['gallery', 'hero', 'text']);
  assert.equal(moveWebsiteBlockSelection(0, 0, 2), 2);
  assert.equal(moveWebsiteBlockSelection(2, 0, 2), 1);
  assert.equal(moveWebsiteBlockSelection(0, 2, 0), 1);
});

test('Website block drag ignores invalid and same-position drops', () => {
  assert.deepEqual(moveWebsiteBlock(['hero', 'text'], -1, 1), ['hero', 'text']);
  assert.deepEqual(moveWebsiteBlock(['hero', 'text'], 0, 0), ['hero', 'text']);
  assert.equal(moveWebsiteBlockSelection(undefined, 0, 1), undefined);
});
