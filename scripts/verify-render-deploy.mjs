import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const API_BASE = 'https://api.render.com/v1';

const TERMINAL_FAILURES = new Set([
  'build_failed',
  'update_failed',
  'pre_deploy_failed',
  'canceled',
  'deactivated',
]);

const IN_PROGRESS = new Set([
  'created',
  'queued',
  'build_in_progress',
  'update_in_progress',
  'pre_deploy_in_progress',
]);

function validateInputs({ apiKey, serviceId, expectedCommit, triggeredAt }) {
  if (!apiKey) throw new Error('RENDER_API_KEY is required.');
  if (!serviceId) throw new Error('RENDER_SERVICE_ID is required.');
  if (!/^[0-9a-f]{40}$/i.test(expectedCommit || '')) {
    throw new Error('RENDER_EXPECTED_COMMIT must be a full 40-character commit SHA.');
  }
  if (!Number.isFinite(Date.parse(triggeredAt || ''))) {
    throw new Error('RENDER_DEPLOY_TRIGGERED_AT must be a valid ISO 8601 timestamp.');
  }
}

function makeUrl(path, parameters = {}) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function fetchJson(fetchImpl, url, apiKey) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { transientError: 'network' };
  }
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      return { transientError: `HTTP ${response.status}` };
    }
    throw new Error(`Render API request failed (HTTP ${response.status}).`);
  }
  try {
    return { data: await response.json() };
  } catch {
    throw new Error('Render API returned an invalid JSON response.');
  }
}

/**
 * Wait for the deployment created by the existing deploy hook to become live.
 * Every success is bound to both the expected repository commit and a deploy
 * whose trigger is Render's deploy_hook value.
 */
export async function verifyRenderDeploy({
  apiKey,
  serviceId,
  expectedCommit,
  triggeredAt,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  pollIntervalMs = 15_000,
  timeoutMs = 20 * 60_000,
  onStatus = () => {},
}) {
  validateInputs({ apiKey, serviceId, expectedCommit, triggeredAt });
  if (typeof fetchImpl !== 'function') throw new Error('This Node.js runtime does not provide fetch().');

  const startedAt = Date.parse(triggeredAt);
  const deadline = now() + timeoutMs;
  let deployId;
  let lastStatus = 'waiting for Render deploy hook';
  const servicePath = `/services/${encodeURIComponent(serviceId)}`;

  while (now() <= deadline) {
    let deploy;
    if (deployId) {
      const result = await fetchJson(
        fetchImpl,
        makeUrl(`${servicePath}/deploys/${encodeURIComponent(deployId)}`),
        apiKey,
      );
      if (result.transientError) {
        lastStatus = `Render API temporarily unavailable (${result.transientError})`;
      } else {
        deploy = result.data;
      }
    } else {
      const result = await fetchJson(
        fetchImpl,
        makeUrl(`${servicePath}/deploys`, {
          createdAfter: new Date(startedAt).toISOString(),
          limit: '50',
        }),
        apiKey,
      );
      if (result.transientError) {
        lastStatus = `Render API temporarily unavailable (${result.transientError})`;
      } else {
        if (!Array.isArray(result.data)) throw new Error('Render deploy list response was not an array.');
        const candidates = result.data
          .map((item) => item?.deploy ?? item)
          .filter((candidate) => candidate?.trigger === 'deploy_hook')
          .filter((candidate) => Number.isFinite(Date.parse(candidate.createdAt || '')))
          .filter((candidate) => Date.parse(candidate.createdAt) >= startedAt)
          .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
        if (candidates.length) {
          const candidate = candidates[0];
          if (!candidate.id) throw new Error('Render returned a deploy-hook record without an ID.');
          if (candidate.commit?.id !== expectedCommit) {
            throw new Error('Render deploy hook selected a commit that does not match the checked-out main commit.');
          }
          deployId = candidate.id;
          continue;
        }
        lastStatus = 'waiting for Render to create the deploy';
      }
    }

    if (deploy) {
      if (deploy.commit?.id !== expectedCommit) {
        throw new Error('Render deploy commit changed or does not match the checked-out main commit.');
      }
      lastStatus = deploy.status || 'unknown';
      onStatus(lastStatus, deploy.id);
      if (lastStatus === 'live') return { deployId: deploy.id, commit: deploy.commit.id, status: lastStatus };
      if (TERMINAL_FAILURES.has(lastStatus)) {
        throw new Error(`Render deployment finished unsuccessfully (${lastStatus}).`);
      }
      if (!IN_PROGRESS.has(lastStatus)) {
        throw new Error(`Render returned an unsupported deployment status (${lastStatus}).`);
      }
    } else {
      onStatus(lastStatus, deployId);
    }

    const remainingMs = deadline - now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }

  throw new Error(`Timed out waiting for the expected Render deployment; last status: ${lastStatus}.`);
}

async function main() {
  try {
    const result = await verifyRenderDeploy({
      apiKey: process.env.RENDER_API_KEY,
      serviceId: process.env.RENDER_SERVICE_ID,
      expectedCommit: process.env.RENDER_EXPECTED_COMMIT,
      triggeredAt: process.env.RENDER_DEPLOY_TRIGGERED_AT,
      onStatus: (status) => console.log(`Render deploy status: ${status}`),
    });
    console.log(`Render reports commit ${result.commit} as live (deploy ${result.deployId}).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Render deployment verification failed.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
