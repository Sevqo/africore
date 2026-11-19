import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyRenderDeploy } from './verify-render-deploy.mjs';

const commit = 'a'.repeat(40);
const startedAt = '2026-11-19T10:00:00.000Z';

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    },
  };
}

function deploy(status, id = 'dep-123', sha = commit) {
  return {
    id,
    trigger: 'deploy_hook',
    createdAt: '2026-11-19T10:00:01.000Z',
    commit: { id: sha },
    status,
  };
}

function harness(fetchResponses, options = {}) {
  let clock = Date.parse(startedAt);
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), init });
    const response = fetchResponses.shift();
    assert.ok(response, 'unexpected Render API request');
    return response;
  };
  return {
    requests,
    verify: () => verifyRenderDeploy({
      apiKey: 'test-api-key-do-not-print',
      serviceId: 'srv-test123',
      expectedCommit: commit,
      triggeredAt: startedAt,
      fetchImpl,
      now: () => clock,
      sleep: async (duration) => { clock += duration; },
      pollIntervalMs: 100,
      timeoutMs: options.timeoutMs ?? 1_000,
      ...options,
    }),
  };
}

test('verifies only after the deploy hook reaches live for the expected commit', async () => {
  const h = harness([
    jsonResponse([{ deploy: deploy('created'), cursor: 'cursor-1' }]),
    jsonResponse(deploy('build_in_progress')),
    jsonResponse(deploy('live')),
  ]);
  const result = await h.verify();
  assert.deepEqual(result, { deployId: 'dep-123', commit, status: 'live' });
  assert.equal(h.requests.length, 3);
  assert.match(h.requests[0].url, /createdAfter=2026-11-19T10%3A00%3A00.000Z/);
  assert.ok(h.requests.every((request) => request.init.headers.Authorization === 'Bearer test-api-key-do-not-print'));
});

test('rejects a deploy hook that selects a different commit', async () => {
  const h = harness([jsonResponse([{ deploy: deploy('created', 'dep-wrong', 'b'.repeat(40)) }])]);
  await assert.rejects(h.verify(), /does not match the checked-out main commit/);
});

test('fails when Render reports a terminal deployment failure', async () => {
  const h = harness([
    jsonResponse([{ deploy: deploy('created') }]),
    jsonResponse(deploy('build_failed')),
  ]);
  await assert.rejects(h.verify(), /finished unsuccessfully \(build_failed\)/);
});

test('times out if the hook does not create a Render deployment', async () => {
  const h = harness([jsonResponse([]), jsonResponse([]), jsonResponse([])], { timeoutMs: 200 });
  await assert.rejects(h.verify(), /Timed out waiting for the expected Render deployment/);
});

test('does not disclose Render API credentials in errors', async () => {
  const h = harness([jsonResponse({}, 401)]);
  await assert.rejects(h.verify(), (error) => {
    assert.match(error.message, /HTTP 401/);
    assert.doesNotMatch(error.message, /test-api-key/);
    return true;
  });
});
