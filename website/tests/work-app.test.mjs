import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createsWorkCycle,
  workQuickFilter,
  workBlocked,
  loadWorkDirectory,
} from '../src/apps/work-app-model.ts';
const task = (id, dependencies = [], parent_id = null) => ({
  id,
  parent_id,
  status: 'open',
  due_on: '2026-11-18',
  data: { dependencies, checklist: [], priority: 'normal' },
});
test('Work selector detects mixed parent/dependency deadlocks before saving', () => {
  const rows = [task('parent'), task('child', [], 'parent')];
  assert.equal(createsWorkCycle(rows, 'child', 'parent', ['parent']), true);
  assert.equal(createsWorkCycle(rows, 'parent', null, ['child']), false);
  assert.equal(createsWorkCycle(rows, 'new', 'parent', ['parent']), true);
  assert.equal(createsWorkCycle(rows, 'child', 'parent', []), false);
});
test('Work filters distinguish completion blockers and calendar-week deadlines', () => {
  const a = task('a'),
    b = task('b', ['a']);
  assert.equal(workBlocked(b, [a, b]), true);
  a.status = 'completed';
  assert.equal(workBlocked(b, [a, b]), false);
  assert.equal(workQuickFilter(b, [a, b], 'week', '2026-11-16'), true);
  assert.equal(workQuickFilter(b, [a, b], 'week', '2026-11-23'), false);
  assert.equal(workQuickFilter(b, [a, b], 'overdue', '2026-11-19'), true);
  b.status = 'completed';
  assert.equal(workQuickFilter(b, [a, b], 'overdue', '2026-11-19'), false);
});

test('project visibility survives Team failure and a later retry can restore selectors', async () => {
  let rejectTeam;
  const pending = new Promise((_, reject) => {
    rejectTeam = reject;
  });
  let projects = null,
    members = [],
    teamError = '';
  const first = loadWorkDirectory(
    (path) => (path === '/team' ? pending : Promise.resolve({ data: [{ id: 'private-project' }] })),
    (r) => {
      projects = r;
    },
    (r) => {
      members = r;
    },
    () => {},
    (message) => {
      teamError = message;
    },
  );
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(projects.data[0].id, 'private-project');
  rejectTeam(new Error('Team unavailable'));
  await first;
  assert.equal(teamError, 'Team unavailable');
  await loadWorkDirectory(
    (path) => Promise.resolve(path === '/team' ? { data: [{ id: 'owner' }] } : projects),
    () => {},
    (r) => {
      members = r;
    },
    () => {},
    () => {},
  );
  assert.equal(members[0].id, 'owner');
});

test('cancelled subtasks do not block their parent', () => {
  const parent = task('parent'),
    child = { ...task('child', [], 'parent'), status: 'cancelled' };
  assert.equal(workBlocked(parent, [parent, child]), false);
});
